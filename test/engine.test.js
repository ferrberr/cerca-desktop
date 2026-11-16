import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine, hardFilter} from '../ai/engine.js';
import {validateCatalog} from '../desktop/catalog.js';
import {Ollama} from '../ai/ollama.js';
import {Store} from '../desktop/store.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const plan={product:'MacBook Air M2',queries:['macbook air m2'],must_have:['M2'],exclude:['funda'],max_price:null,condition:'Cualquiera'};
const products=[{id:1,title:'MacBook Air M2',price:650,condition:'Como nuevo',city:'Barcelona',distance:2,spec:'8 GB 256 GB',description:'Completo'},{id:2,title:'Funda MacBook Air M2',price:15,condition:'Como nuevo',city:'Barcelona',distance:3,spec:'Plástico',description:'Solo funda'}];
const constraints={maxPrice:900,zone:'Barcelona',radius:50,condition:'Cualquiera'};
function fake(decisions){return {chat:async(model,_system,data)=>data?.search?plan:{...decisions.find(d=>d.id===products.find(p=>p.title===data.listing.title)?.id),id:1},embed:async input=>input.map(()=>[1,.2,.1])};}

test('each request contains one listing and a validated decision is published before the next completes',async()=>{
 let releaseSecond,secondStarted;const gate=new Promise(resolve=>releaseSecond=resolve),started=new Promise(resolve=>secondStarted=resolve),events=[];
 const client=fake([]);client.chat=async(model,_system,data)=>{
  if(data?.search)return plan;
  assert.equal(data.listings,undefined);assert.equal(data.listing.id,1);
  if(data.listing.title===products[1].title){secondStarted();await gate;return{id:1,accept:false,score:12,reason:'Es una funda'};}
  return{id:1,accept:true,score:97,reason:'Modelo M2 completo'};
 };
 const pending=new SearchEngine({ollama:client}).search('MacBook Air M2',products,constraints,{onUpdate:update=>events.push(update)});
 await started;
 assert.equal(events.filter(u=>u.type==='decision').length,1);const first=events.find(u=>u.type==='decision');assert.equal(first.item.id,1);assert.equal(first.item.accepted,true);
 releaseSecond();const result=await pending;assert.deepEqual(result.items.map(p=>p.id),[1]);assert.deepEqual(result.rejected.map(p=>p.id),[2]);
});
test('malformed, fabricated, missing and out-of-range decisions retry the same product until valid',async()=>{
 const invalid=[{id:999,accept:true,score:99,reason:'Inventado'},{}, {id:1,accept:true,score:101,reason:'Fuera de rango'},{id:1,accept:'yes',score:95,reason:'Tipo inválido'},{id:1,accept:true,score:95,reason:'   '}];
 const updates=[];let calls=0;const client=fake([]);
 client.chat=async(model,_system,data)=>{if(data?.search)return plan;assert.equal(data.listing.title,products[0].title);return invalid[calls++]||{id:1,accept:true,score:95,reason:'M2 completo'};};
 const result=await new SearchEngine({ollama:client}).search('MacBook Air M2',[products[0]],constraints,{retryDelayMs:0,onUpdate:update=>updates.push(update)});
 assert.equal(calls,6);assert.equal(result.retries,5);assert.equal(result.items.length,1);assert.equal(updates.filter(u=>u.type==='decision').length,1);
});
test('invalid JSON and truncated output are retried, transport errors are surfaced',async()=>{
 const {InvalidModelOutputError,LocalModelError}=await import('../ai/ollama.js');let calls=0;const client=fake([]);
 client.chat=async(model,_system,data)=>{if(data?.search)return plan;if(calls++<2)throw new InvalidModelOutputError('Invalid JSON');return{id:1,accept:true,score:90,reason:'Completo'};};
 const result=await new SearchEngine({ollama:client}).search('MacBook Air M2',[products[0]],constraints,{retryDelayMs:0});assert.equal(result.retries,2);
 client.chat=async(model,_system,data)=>{if(data?.search)return plan;throw new LocalModelError('Ollama no disponible');};
 await assert.rejects(new SearchEngine({ollama:client}).search('MacBook Air M2',[products[0]],constraints),/Ollama no disponible/);
});
test('retries have no attempt limit but remain cancellable without emitting invalid results',async()=>{
 const controller=new AbortController();let calls=0,emitted=0;const client=fake([]);
 client.chat=async(model,_system,data)=>{if(data?.search)return plan;if(++calls===12)controller.abort();return{};};
 await assert.rejects(new SearchEngine({ollama:client}).search('MacBook Air M2',[products[0]],constraints,{signal:controller.signal,retryDelayMs:0,onUpdate:u=>{if(u.type==='decision')emitted++;}}));
 assert.equal(calls,12);assert.equal(emitted,0);
});
test('details can be prefetched but each single-product decision waits for its own detail',async()=>{
 const order=[];const client=fake([]);client.chat=async(model,_system,data)=>{if(data?.search)return plan;order.push('decide:'+data.listing.title);return{id:1,accept:true,score:90,reason:'Coincide'};};
 await new SearchEngine({ollama:client}).search('MacBook Air M2',products,constraints,{enrich:async rows=>{assert.equal(rows.length,1);order.push('detail:'+rows[0].title);return{items:rows,errors:[]};}});
 for(const p of products)assert.ok(order.indexOf('detail:'+p.title)<order.indexOf('decide:'+p.title));
 assert.deepEqual(order.filter(s=>s.startsWith('decide:')),products.map(p=>'decide:'+p.title));
});
test('200 is a results limit, not a candidate limit; rejected listings do not consume it',async()=>{
 let calls=0;const rows=Array.from({length:450},(_,i)=>({...products[0],id:i+1}));const client=fake([]);
 client.chat=async(model,_system,data)=>{if(data?.search)return plan;calls++;return{id:1,accept:calls>75,score:90,reason:calls>75?'Coincide':'No coincide'};};
 const result=await new SearchEngine({ollama:client}).search('MacBook Air M2',rows,constraints);
 assert.equal(result.items.length,200);assert.equal(result.rejected.length,75);assert.equal(calls,275);assert.equal(result.limitReached,true);assert.equal(result.notEvaluated,175);
});
test('search streams through hundreds of rejections to 100 verified matches, then stops pagination and prefetch', async () => {
 const product = id => ({...products[0], id, provider: 'wallapop', detailComplete: true});
 const wrong = Array.from({length: 250}, (_, i) => ({...product(i + 1), description: 'Solo funda'}));
 const unverifiable = Array.from({length: 205}, (_, i) => ({...product(300 + i), detailComplete: false}));
 const matching = Array.from({length: 120}, (_, i) => product(i + 600));
 const details = [], arrivals = [];
 let closed = false, rejectedEvents = 0;
 async function* pages() {
  try {
   for (let start = 0; start < wrong.length; start += 25) yield wrong.slice(start, start + 25);
   yield [wrong[0], {...product(275), price: 1500}];
   for (let start = 0; start < unverifiable.length; start += 25) yield unverifiable.slice(start, start + 25);
   yield [];
   for (let start = 0; start < matching.length; start += 40) yield matching.slice(start, start + 40);
   assert.fail('The engine requested another source page after meeting the target');
  } finally {
   closed = true;
  }
 }
 const ollama = {decide: async (_model, {listing}) => ({
  id: 1, accept: listing.description !== 'Solo funda', score: 90, reason: 'Comprobado'
 })};
 const result = await new SearchEngine({ollama}).search('MacBook Air M2', pages(), constraints, {
  targetResults: 100,
  enrich: async items => {
   details.push(items[0].id);
   return {items, errors: []};
  },
  onUpdate: update => {
   if (update.type !== 'decision') return;
   if (update.item.accepted) arrivals.push(update.item.id);
   else rejectedEvents++;
   assert.equal(update.rejectedCount, rejectedEvents);
  },
 });
 assert.deepEqual(arrivals, matching.slice(0, 100).map(row => row.id));
 assert.deepEqual(result.items.map(row => row.id), arrivals);
 assert.equal(result.rejectedCount, 250);
 assert.equal(rejectedEvents, result.rejectedCount);
 assert.deepEqual(result.rejected.map(row => row.id), wrong.slice(-200).map(row => row.id));
 assert.equal(result.evaluated, 350);
 assert.equal(result.filteredOut, 205);
 assert.equal(result.detailErrorCount, 205);
 assert.deepEqual(result.detailErrors.map(error => error.id), unverifiable.slice(-200).map(row => row.id));
 assert.equal(result.targetResults, 100);
 assert.equal(result.targetReached, true);
 assert.equal(result.stopReason, 'target');
 assert.equal(result.limitReached, false);
 assert.equal(closed, true);
 assert.equal(details.length, 555);
 assert.equal(details.at(-1), arrivals.at(-1));
});
test('an exhausted source returns the true number of matches below the requested target', async () => {
 const client = fake([{id: 1, accept: true, score: 90, reason: 'Completo'}]);
 const result = await new SearchEngine({ollama: client}).search('MacBook Air M2', [products[0]], constraints, {targetResults: 150});
 assert.equal(result.items.length, 1);
 assert.equal(result.targetResults, 150);
 assert.equal(result.targetReached, false);
 assert.equal(result.stopReason, 'exhausted');
});
test('a denied detail mid-page returns the completed decisions and closes the source', async () => {
 const denied = Object.assign(new Error('Ficha bloqueada'), {code: 'ACCESS_DENIED'});
 const rows = [1, 2, 3, 4].map(id => ({...products[0], id, description: id === 2 ? 'Solo funda' : 'Completo'}));
 const details = [];
 let closed = false;
 async function* pages() {
  try {
   yield rows;
   assert.fail('A denied detail must stop pagination');
  } finally {closed = true;}
 }
 const ollama = {decide: async (_model, {listing}) => ({
  id: 1, accept: listing.description === 'Completo', score: 90, reason: 'Verificado'
 })};
 const result = await new SearchEngine({ollama}).search('MacBook Air M2', pages(), constraints, {
  targetResults: 100,
  prefetch: 1,
  enrich: items => {
   details.push(items[0].id);
   if (items[0].id === 3) throw denied;
   return {items, errors: []};
  },
 });
 assert.equal(closed, true);
 assert.deepEqual(details, [1, 2, 3]);
 assert.deepEqual(result.items.map(row => row.id), [1]);
 assert.deepEqual(result.rejected.map(row => row.id), [2]);
 assert.equal(result.evaluated, 2);
 assert.equal(result.total, 4);
 assert.equal(result.notEvaluated, 2);
 assert.equal(result.targetReached, false);
 assert.equal(result.stopReason, 'source_limit');
 assert.deepEqual(result.sourceError, {code: 'ACCESS_DENIED', message: 'Ficha bloqueada'});
});
test('a rate-limited cursor preserves the partial report; an initial blocked request still fails', async () => {
 const limited = Object.assign(new Error('Consulta limitada'), {code: 'RATE_LIMIT'});
 async function* pages(afterFirstPage) {
  if (afterFirstPage) yield [products[0]];
  throw limited;
 }
 const engine = new SearchEngine({ollama: fake([{id: 1, accept: true, score: 90, reason: 'Completo'}])});
 const result = await engine.search('MacBook Air M2', pages(true), constraints);
 assert.equal(result.stopReason, 'source_limit');
 assert.deepEqual(result.sourceError, {code: 'RATE_LIMIT', message: 'Consulta limitada'});
 assert.deepEqual(result.items.map(row => row.id), [1]);
 assert.equal(result.evaluated, 1);
 await assert.rejects(engine.search('MacBook Air M2', pages(false), constraints), error => error === limited);
});
test('model failures and user cancellation during a provider block remain errors', async () => {
 const limited = Object.assign(new Error('Límite de solicitudes'), {code: 'RATE_LIMIT'});
 const engine = new SearchEngine({ollama: {decide: async () => {throw limited;}}});
 await assert.rejects(engine.search('MacBook Air M2', [products[0]], constraints), error => error === limited);
 const controller = new AbortController();
 await assert.rejects(engine.search('MacBook Air M2', [products[0]], constraints, {
  signal: controller.signal,
  enrich: async () => {controller.abort(); throw limited;},
 }), error => error === controller.signal.reason);
});
test('retrieval ordering does not override the model and sparse cards use their full details', async () => {
 const titles = ['Mando para consola PlayStation 5', 'Consola Xbox', 'Consola PlayStation 4', 'PS5 Slim', 'Sony'];
 const cards = titles.map((title, i) => ({id: i + 1, title, price: 100 + i}));
 const loaded = [], modelInputs = [];
 const ollama = {decide: async (_model, {listing}) => {
  modelInputs.push(listing.title);
  return {id: 1, accept: /^(PS5 Slim|PS5 Digital)$/.test(listing.title), score: 95, reason: 'Ficha comprobada'};
 }};
 const result = await new SearchEngine({ollama}).search('play 5 consola', cards, {zone: 'Todas las zonas'}, {
  targetResults: 2,
  prefetch: 1,
  enrich: async ([card]) => {
   loaded.push(card.title);
   return {items: [card.title === 'Sony' ? {...card, title: 'PS5 Digital'} : card], errors: []};
  },
 });
 assert.ok(loaded.includes('Sony'));
 assert.ok(modelInputs.includes('PS5 Slim'));
 assert.ok(modelInputs.includes('PS5 Digital'));
 assert.ok(modelInputs.includes('Mando para consola PlayStation 5'));
 assert.deepEqual(result.items.map(row => row.id), [4, 5]);
});
test('price and unknown location constraints do not depend on the language model',()=>{
 assert.deepEqual(hardFilter([...products,{...products[0],id:3,price:1000},{...products[0],id:4,distance:null}],constraints).map(p=>p.id),[1,2]);
 assert.equal(hardFilter([{...products[0],distance:null}],{...constraints,zone:'Todas las zonas'}).length,1);
});
test('explicit language budget is combined with the UI budget using the tighter bound',async()=>{
 const client=fake([]);client.chat=async()=>({...plan,max_price:600});
 const r=await new SearchEngine({ollama:client}).search('Hasta 600 euros',[products[0]],constraints);
 assert.equal(r.constraints.maxPrice,600);assert.equal(r.items.length,0);
});
test('cancelled searches do not call an inference endpoint',async()=>{
 let called=false;const abort=new AbortController();abort.abort();
 const engine=new SearchEngine({ollama:{chat:()=>{called=true;}}});
 await assert.rejects(engine.search('MacBook',products,constraints,{signal:abort.signal}));assert.equal(called,false);
});
test('Ollama accepts structured local output and rejects invalid JSON',async()=>{
 const client=new Ollama({fetchImpl:async(url,request)=>{
  assert.match(url,/^http:\/\/127\.0\.0\.1:11434\//);const body=JSON.parse(request.body);assert.equal(body.think,false);assert.deepEqual(body.format,{type:'object'});
  return {ok:true,json:async()=>({message:{content:'not json'}})};
 }});
 await assert.rejects(client.chat('cerca-search:4b','system',{}, {type:'object'}),/respuesta inválida/);
});
test('imports reject malformed prices, duplicate listings and non-HTTPS links',()=>{
 assert.throws(()=>validateCatalog([{title:'A',price:-1}]));
 assert.throws(()=>validateCatalog([{title:'A',price:1,url:'file:///etc/passwd'}]));
 assert.throws(()=>validateCatalog([{title:'A',price:1},{title:'A',price:2}]));
 assert.throws(()=>validateCatalog([{title:'A',price:1,url:'https://user:password@example.com'}]));
});
test('imported listings preserve actual text but cannot supply code paths or fake map positions',()=>{
 const [p]=validateCatalog([{title:'Portátil <img onerror="x">',price:100,asset:'../../secret',pos:[50,50],latitude:41.4,longitude:2.1}]);
 assert.equal(p.title,'Portátil <img onerror="x">');assert.equal(p.asset,'laptop-1');assert.equal(p.pos,null);assert.equal(p.distance,null);assert.equal(p.demo,false);
});
test('persistent alerts survive a new process state and unknown preference writes are rejected',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cerca-store-'));
 try{const store=new Store(directory);const alert={id:1,query:'MacBook',price:700,radius:50,zone:'Barcelona',condition:'Cualquiera',enabled:true};store.setPreference('cerca-alerts',[alert]);assert.deepEqual(new Store(directory).data.preferences['cerca-alerts'],[alert]);assert.throws(()=>store.setPreference('../../path','x'));assert.throws(()=>store.setPreference('cerca-alerts',[{...alert,price:-1}]));}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});
