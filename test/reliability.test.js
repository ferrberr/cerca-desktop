import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SearchEngine, hardFilter} from '../ai/engine.js';
import {SearchService} from '../desktop/search-service.js';
import {Store} from '../desktop/store.js';
import {matchesFilters, mergeListing} from '../shared/listings.js';
import {AsyncQueue} from '../shared/async-queue.js';
import {WallapopProvider} from '../providers/wallapop.js';

const item = {id: 1, title: 'MacBook Air M2', price: 650, spec: '16 GB', description: 'Equipo completo', distance: 1, condition: 'Como nuevo'};
const analysis = {analyzed: true, accepted: true, match: 99, reason: 'Modelo correcto', analysisQuery: 'MacBook Air M2'};
const verdict = {id: 1, accept: true, score: 99, reason: 'Modelo correcto'};
const limits = {zone: 'Todas las zonas'};

test('a radius includes nearby municipalities and rejects a misleading city label outside the radius', () => {
  const filters = {center: {latitude: 40.4168, longitude: -3.7038}, radius: 30, zone: 'Madrid'};
  const near = {...item, city: 'Getafe', latitude: 40.3083, longitude: -3.7327};
  const far = {...item, id: 2, city: 'Madrid', latitude: 41.3851, longitude: 2.1734};
  assert.equal(matchesFilters(near, filters), true);
  assert.deepEqual(hardFilter([near, far], filters).map(p => p.id), [1]);
});

test('requirements at the end of a long description reach the decision model and invalidate cached results', async () => {
  let calls = 0;
  const body = 'Equipo aparentemente en buen estado. '.repeat(60);
  const engine = new SearchEngine({ollama: {decide: async (_model, data) => {
    calls++;
    const broken = data.listing.description.includes('No enciende');
    return {...verdict, accept: !broken};
  }}});
  const good = {...item, description: body + 'Funciona perfectamente.'};
  assert.equal((await engine.search('MacBook Air M2', [good], limits)).items.length, 1);
  const bad = {...good, description: body + 'No enciende. Placa base rota. Para piezas.'};
  const result = await engine.search('MacBook Air M2', [bad], limits);
  assert.equal(result.items.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(calls, 2);
});

test('an unreadable public detail is excluded instead of being accepted from its search summary', async () => {
  let calls = 0;
  const result = await new SearchEngine({ollama: {decide: async () => {calls++; return verdict;}}})
    .search('MacBook Air M2', [item], limits, {enrich: async () => ({items: [{...item, detailError: 'Network error'}], errors: [{id: 1, error: 'Network error'}]})});
  assert.equal(calls, 0);
  assert.equal(result.items.length, 0);
  assert.equal(result.filteredOut, 1);
  assert.equal(result.detailErrors.length, 1);
});

test('a fresh validated decision after a price drop remains analyzed in the stored catalog', async () => {
  const store = {data: {live: [{...item, ...analysis, price: 700}], imported: [], preferences: {}}, scheduleFlush() {}};
  const engine = new SearchEngine({ollama: {decide: async () => verdict}});
  const provider = {
    search: async (_plan, _limits, {onPage}) => {onPage([item], {pages: 1}); return {pages: 1};},
    enrich: async items => ({items, errors: []}),
  };
  const result = await new SearchService({store, engine, provider}).search('MacBook Air M2', limits);
  assert.equal(result.items.length, 1);
  assert.equal(store.data.live[0].price, 650);
  assert.equal(store.data.live[0].analyzed, true);
  assert.equal(store.data.live[0].accepted, true);
});

test('changed description, model or condition removes an obsolete decision and unrelated metadata preserves it', () => {
  const previous = {...item, ...analysis};
  for (const change of [{description: 'Se vende solamente la funda'}, {title: 'MacBook Air M1'}, {condition: 'Para piezas'}, {price: 600}]) {
    const merged = mergeListing(previous, change);
    assert.equal(merged.analyzed, false);
    assert.equal(merged.accepted, undefined);
    assert.equal(merged.reason, undefined);
  }
  assert.equal(mergeListing(previous, {fetchedAt: 123}).accepted, true);
  assert.equal(mergeListing(previous, {...item, price: 600, ...analysis}).accepted, true);
});

test('a terminal source error stops buffered pages before additional inference, normal completion drains them', async () => {
  const queue = new AsyncQueue();
  queue.push([item]);
  queue.finish(new Error('RATE_LIMIT'));
  await assert.rejects(queue.next(), /RATE_LIMIT/);
  const normal = new AsyncQueue();
  normal.push([item]); normal.finish();
  assert.equal((await normal.next()).value[0].id, 1);
  assert.equal((await normal.next()).done, true);
});

test('simultaneous reads of a public detail share the cached response after the queued request completes', async () => {
  let calls = 0;
  const provider = new WallapopProvider({intervalMs: 0, fetchImpl: async () => {
    calls++;
    return {ok: true, status: 200, text: async () => 'public detail'};
  }});
  const replies = await Promise.all([provider.request('https://es.wallapop.com/item/test', {json: false}), provider.request('https://es.wallapop.com/item/test', {json: false})]);
  assert.deepEqual(replies, ['public detail', 'public detail']);
  assert.equal(calls, 1);
});

test('a cancelled response body is never cached as a completed public detail', async () => {
  const abort = new AbortController();
  const provider = new WallapopProvider({intervalMs: 0, fetchImpl: async () => ({ok: true, status: 200, text: async () => {abort.abort(); return 'incomplete';}})});
  await assert.rejects(provider.request('https://es.wallapop.com/item/test', {json: false, signal: abort.signal}));
  assert.equal(provider.cache.size, 0);
});

test('a failed preference write leaves the in-memory and on-disk preference unchanged', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cerca-transaction-'));
  try {
    const store = new Store(directory);
    store.setPreference('cerca-theme', 'dark');
    const original = store.file;
    store.file = path.join(directory, 'missing', 'state.json');
    assert.throws(() => store.setPreference('cerca-theme', 'light'));
    assert.equal(store.data.preferences['cerca-theme'], 'dark');
    assert.equal(JSON.parse(fs.readFileSync(original)).preferences['cerca-theme'], 'dark');
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});

test('deleting an alert cleans only its notification history and keeps other alerts deduplicated', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cerca-alert-cleanup-'));
  try {
    const store = new Store(directory);
    const alert = {id: 2, query: 'MacBook', price: 700, radius: 50, zone: 'Barcelona', condition: 'Cualquiera', enabled: true};
    store.data.notified = {'1': ['10:100'], '2': ['20:200']};
    store.setPreference('cerca-alerts', [alert]);
    assert.deepEqual(new Store(directory).data.notified, {'2': ['20:200']});
    assert.throws(() => store.setPreference('cerca-alerts', [null]), /Alerta inválida/);
    assert.equal(store.data.preferences['cerca-alerts'].length, 1);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});

test('bounded caches retain recently used entries without growing across repeated searches', async () => {
  const {LruCache} = await import('../shared/lru-cache.js');
  const cache = new LruCache(3);
  cache.set('query', [1, 2]).set('old', [3, 4]).set('recent', [5, 6]);
  assert.deepEqual(cache.get('query'), [1, 2]);
  cache.set('new', [7, 8]);
  assert.equal(cache.has('old'), false);
  assert.equal(cache.has('query'), true);
  for (let i = 0; i < 1000; i++) cache.set(i, [i]);
  assert.equal(cache.size, 3);
});


test('a live search card without confirmed detail completion cannot be treated as a verified listing', async () => {
  const result = await new SearchEngine({ollama: {decide: async () => {throw new Error('Must not infer from a search card');}}})
    .search('MacBook Air M2', [{...item, provider: 'wallapop', detailComplete: false}], limits, {enrich: async items => ({items, errors: []})});
  assert.equal(result.items.length, 0);
  assert.equal(result.filteredOut, 1);
  assert.equal(result.detailErrors.length, 1);
});


test('semantic ranking can process a batch larger than the persistent vector cache', async () => {
  const {LruCache} = await import('../shared/lru-cache.js');
  const engine = new SearchEngine({ollama: {embed: async values => values.map(() => [1, .5]), decide: async () => verdict}});
  engine.vectors = new LruCache(2);
  const result = await engine.search('Camara', [1, 2, 3].map(id => ({...item, id, title: 'Anuncio '+id})), limits);
  assert.equal(result.evaluated, 3);
  assert.equal(engine.vectors.size, 2);
});
