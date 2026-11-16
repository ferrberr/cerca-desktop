import test from 'node:test';
import assert from 'node:assert/strict';
import {WallapopProvider,normalizeListing,parsePublicPage} from '../providers/wallapop.js';
import {distanceKm,withinArea,DEFAULT_CENTER} from '../shared/geo.js';
import {Geocoder} from '../providers/geocoding.js';
const raw={id:'abc123',title:'MacBook Air M2',description:'Equipo completo. Una descripción pública.',web_slug:'macbook-air-m2-123',price:{amount:650,currency:'EUR'},location:{latitude:41.4,longitude:2.18,city:'Barcelona'},images:[{urls:{big:'https://cdn.wallapop.com/images/1/a.jpg'}}],shipping:{item_is_shippable:true,user_allows_shipping:true},reserved:{flag:false}};
const reply=data=>({ok:true,status:200,json:async()=>data,text:async()=>data});
test('real search fields preserve photos, public coordinates, shipping and price without invented condition',()=>{const p=normalizeListing(raw);assert.equal(p.condition,'Sin indicar');assert.equal(p.images.length,1);assert.equal(p.demo,false);assert.equal(p.locationApproximate,true);assert.ok(p.distance>0&&p.distance<5);assert.equal(p.shipping,true);assert.equal(p.price,650);});
test('the detailed public page supplies condition, seller rating, availability and characteristics',()=>{const item={...raw,title:{original:raw.title},description:{original:raw.description},slug:raw.web_slug,price:{cash:raw.price},condition:{value:'as_good_as_new'},flags:{sold:true},characteristics:'Como nuevo · Apple',typeAttributes:{brand:{title:'Marca',text:'Apple'}}};const parsed=parsePublicPage(`<html><script type="application/json" nonce="abc" id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{item,itemSeller:{microName:'Vendedor público',stats:{ratingAverage:4.9,counters:{reviews:12}}}}}})}</script></html>`);const p=normalizeListing(parsed.item,{seller:parsed.seller,detailed:true});assert.equal(p.condition,'Como nuevo');assert.equal(p.seller.rating,4.9);assert.equal(p.available,false);assert.equal(p.detailComplete,true);assert.deepEqual(p.attributes,[{name:'Marca',value:'Apple'}]);});
test('unpublished seller locations are not inferred or fabricated',()=>{const p=normalizeListing({...raw,location:{city:'Barcelona'}});assert.equal(p.latitude,null);assert.equal(p.longitude,null);assert.equal(p.distance,null);assert.equal(withinArea(p,{center:DEFAULT_CENTER,radius:50}),false);});
test('photo URLs cannot load arbitrary hosts or credentials',()=>{const p=normalizeListing({...raw,images:[{urls:{big:'https://evil.test/a.jpg'}},{urls:{big:'http://cdn.wallapop.com/images/x'}},{urls:{big:'https://user:pass@cdn.wallapop.com/images/x'}}]});assert.deepEqual(p.images,[]);});
test('geographic radius is measured from the selected point, not the seller city string',()=>{assert.ok(distanceKm(DEFAULT_CENTER,{latitude:40.4168,longitude:-3.7038})>500);assert.equal(withinArea({latitude:41.4,longitude:2.18,city:'Other'},{center:DEFAULT_CENTER,radius:10}),true);assert.equal(withinArea({latitude:40.4168,longitude:-3.7038,city:'Barcelona'},{center:DEFAULT_CENTER,radius:50}),false);});
test('provider follows both search steps, distance_in_km, price filter and page tokens',async()=>{
 const seen=[];const provider=new WallapopProvider({intervalMs:0,retryAttempts:0,fetchImpl:async(url)=>{const u=new URL(url);seen.push(u);if(u.pathname.endsWith('/components'))return reply({components:[{type:'search_results',type_data:{query_params:{search_id:'search-session',keywords:'MacBook Air M2'}}}]});return reply({data:{section:{items:[raw]}},meta:{next_page:u.searchParams.has('next_page')?null:'next-token'}});}});
 const result=await provider.search({product:'MacBook Air M2',queries:[]},{minPrice:600,maxPrice:900,condition:'Como nuevo',center:DEFAULT_CENTER,zone:'Barcelona',radius:50},{pages:2});
 assert.equal(result.items.length,1);assert.equal(result.pages,4);assert.ok(seen.some(u=>u.searchParams.get('next_page')==='next-token'));for(const u of seen.filter(u=>u.pathname.endsWith('/section'))){assert.equal(u.searchParams.get('distance_in_km'),'50');assert.equal(u.searchParams.get('min_sale_price'),'600');assert.equal(u.searchParams.get('max_sale_price'),'900');assert.equal(u.searchParams.get('condition'),'as_good_as_new');assert.equal(u.searchParams.get('search_id'),'search-session');}
});
test('429 and 403 stop requests instead of retrying or returning fake announcements',async()=>{for(const status of [429,403]){let calls=0;const provider=new WallapopProvider({intervalMs:0,retryAttempts:0,fetchImpl:async()=>{calls++;return {ok:false,status};}});await assert.rejects(provider.search({product:'Laptop',queries:[]},{}),error=>['RATE_LIMIT','ACCESS_DENIED'].includes(error.code));assert.equal(calls,1);}});
test('cancellation stops before making network requests',async()=>{let calls=0;const provider=new WallapopProvider({intervalMs:0,retryAttempts:0,fetchImpl:async()=>{calls++;}});const controller=new AbortController();controller.abort();await assert.rejects(provider.request('https://api.wallapop.com/test',{signal:controller.signal}));assert.equal(calls,0);});
test('detail cache reuses public listing data and recomputes distance from a new center',async()=>{let calls=0;const page=`<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{item:{...raw,slug:raw.web_slug}}}})}</script>`;const provider=new WallapopProvider({intervalMs:0,retryAttempts:0,fetchImpl:async()=>{calls++;return reply(page);}});const item=normalizeListing(raw);const near=await provider.detail(item);const far=await provider.detail(item,{center:{latitude:40.4,longitude:-3.7}});assert.equal(calls,1);assert.ok(near.distance<5);assert.ok(far.distance>500);});
test('geocoding caches explicit searches and rejects invalid coordinates',async()=>{let calls=0;const geocoder=new Geocoder({fetchImpl:async()=>{calls++;return reply({results:[{name:'Madrid',latitude:40.4,longitude:-3.7,country:'España'},{name:'Bad',latitude:100,longitude:0}]});}});assert.equal((await geocoder.search('Madrid')).length,1);await geocoder.search('madrid');assert.equal(calls,1);await assert.rejects(geocoder.search('x'));});

const searchPlan = {product: 'PS5', queries: []};
function pagedProvider(getPage) {
 const requests = [];
 const provider = new WallapopProvider({intervalMs: 0, retryAttempts: 0, fetchImpl: async url => {
  const request = new URL(url);
  requests.push(request);
  const params = request.searchParams;
  if (request.pathname.endsWith('/components')) {
   return reply({components: [{type: 'search_results', type_data: {query_params: {search_id: params.get('order_by')}}}]});
  }
  const {items, next} = getPage(params.get('order_by'), params.get('next_page'));
  return reply({data: {section: {items}}, meta: {next_page: next}});
 }});
 return {provider, requests};
}

test('the consumer can stop after one page without fetching a second search or following the cursor', async () => {
 const {provider, requests} = pagedProvider(() => ({items: [raw], next: 'page-2'}));
 const pages = provider.searchPages(searchPlan);
 assert.equal(requests.length, 0);
 for await (const page of pages) {
  assert.equal(page.items.length, 1);
  assert.equal(page.hasMore, true);
  break;
 }
 assert.equal(requests.length, 2);
});

test('an abort between pages prevents any further requests', async () => {
 const {provider, requests} = pagedProvider(() => ({items: [raw], next: 'page-2'}));
 const controller = new AbortController();
 const pages = provider.searchPages(searchPlan, {}, {signal: controller.signal});
 assert.equal((await pages.next()).value.pages, 1);
 controller.abort();
 await assert.rejects(pages.next(), {name: 'AbortError'});
 assert.equal(requests.length, 2);
});

test('fresh cursors continue through empty and duplicate pages and past five pages per search pass', async () => {
 const ids = prefix => Array.from({length: 25}, (_, index) => ({...raw, id: prefix + '-' + index}));
 const {provider} = pagedProvider((order, cursor) => {
  if (order === 'price_low_to_high') return {items: ids('1'), next: null};
  const index = Number(cursor || 1);
  const items = index === 2 ? [] : ids(index === 3 ? '1' : String(index));
  return {items, next: index < 7 ? String(index + 1) : null};
 });
 const pages = [];
 for await (const page of provider.searchPages(searchPlan)) pages.push(page);
 assert.deepEqual(pages.map(page => page.items.length), [25, 0, 0, 0, 25, 25, 25, 25]);
 assert.equal(new Set(pages.flatMap(page => page.items.map(item => item.id))).size, 125);
 assert.deepEqual(pages.map(page => page.hasMore), [true,true,true,true,true,true,true,false]);
 assert.equal(pages.at(-1).paginationStalled, false);
});

test('a cursor cycle stops only that pass and reports the interrupted pagination', async () => {
 const {provider} = pagedProvider((order, cursor) => {
  if (order === 'most_relevance') return {items: [raw], next: cursor === 'a' ? 'b' : 'a'};
  const index = Number(cursor || 1);
  return {items: [{...raw, id: 'price-' + index}], next: index < 4 ? String(index + 1) : null};
 });
 const result = await provider.search(searchPlan, {}, {pages: Infinity});
 assert.equal(result.items.length, 5);
 assert.equal(result.pages, 7);
 assert.equal(result.hasMore, false);
 assert.equal(result.paginationStalled, true);
});

test('parsed detail cache discards page scaffolding, keeps its fetch time and supports forced refresh', async () => {
 let calls = 0, now = 0;
 const cache = new Map();
 const provider = new WallapopProvider({cache, intervalMs: 0, now: () => now, fetchImpl: async () => {
  calls++;
  const pageProps = {item: {...raw, slug: raw.web_slug, views: calls}, unrelatedPageData: 'x'.repeat(65536)};
  return reply('<script id="__NEXT_DATA__">' + JSON.stringify({props: {pageProps}}) + '</script>');
 }});
 const listing = normalizeListing(raw);
 assert.equal((await provider.detail(listing)).views, 1);
 now = 100;
 assert.equal((await provider.detail(listing)).detailFetchedAt, 0);
 assert.equal(calls, 1);
 assert.ok(JSON.stringify([...cache.values()]).length < 65536);
 assert.equal((await provider.detail(listing, {force: true})).views, 2);
});

test('authorization failures and terminal rate limits cancel other queued requests', async () => {
 for (const status of [401, 429]) {
  let calls = 0, reported = 0;
  const provider = new WallapopProvider({intervalMs: 0, retryAttempts: 0, fetchImpl: async () => {
   calls++;
   return {status, ok: false};
  }});
  const controller = new AbortController();
  const context = {signal: controller.signal, onAccessLimit: error => {
   reported++;
   controller.abort(error);
  }};
  const listings = [1, 2, 3].map(i => normalizeListing({...raw, id: 'ad-' + i, web_slug: 'ad-' + i}));
  const results = await Promise.allSettled(listings.map(item => provider.enrich([item], context)));
  assert.equal(reported, 1);
  assert.equal(calls, 1);
  assert.equal(controller.signal.reason.code, status === 429 ? 'RATE_LIMIT' : 'ACCESS_DENIED');
  assert.ok(results.every(result => result.status === 'rejected' && result.reason === controller.signal.reason));
 }
});

test('search setup and paginated sections report access limits to the same search context', async () => {
 for (const endpoint of ['/components', '/section']) {
  let reported;
  const provider = new WallapopProvider({intervalMs: 0, retryAttempts: 0, fetchImpl: async url => {
   if (new URL(url).pathname.endsWith(endpoint)) return {status: 403, ok: false};
   return reply({components: [{type: 'search_results', type_data: {query_params: {search_id: 'session'}}}]});
  }});
  await assert.rejects(provider.search(searchPlan, {}, {onAccessLimit: error => { reported = error; }}),
   error => error === reported && error.code === 'ACCESS_DENIED');
 }
});

test('temporary rate limits resume the same request after Retry-After while the shared queue waits',async()=>{
 let now=0,calls=0,reported=0;
 const fetched=[],waits=[],messages=[];
 const provider=new WallapopProvider({intervalMs:0,now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;},fetchImpl:async url=>{
  fetched.push(url);
  if(++calls===1)return new Response(null,{status:429,headers:{'Retry-After':new Date(180_000).toUTCString()}});
  return reply({done:true});
 }});
 const context={onAccessLimit:()=>reported++,onWait:message=>messages.push(message)};
 const [a,b]=await Promise.all([provider.request('https://example.test/a',context),provider.request('https://example.test/b',context)]);
 assert.ok(a.done&&b.done);
 assert.deepEqual(fetched,['https://example.test/a','https://example.test/a','https://example.test/b']);
 assert.ok(waits.reduce((sum,n)=>sum+n,0)>=180_000);
 assert.equal(reported,0);assert.equal(messages.length,1);
});

test('cancellation interrupts a cooldown and prevents another request',async()=>{
 let calls=0;
 const controller=new AbortController();
 const provider=new WallapopProvider({intervalMs:0,sleep:async(_ms,_value,{signal})=>{controller.abort();signal.throwIfAborted();},fetchImpl:async()=>{calls++;return new Response(null,{status:429});}});
 await assert.rejects(provider.request('https://example.test/',{signal:controller.signal}));
 assert.equal(calls,1);
});

test('persistent rate limits have bounded retries and report a terminal error once',async()=>{
 let now=0,calls=0,reported=0;
 const provider=new WallapopProvider({intervalMs:0,now:()=>now,sleep:async ms=>{now+=ms;},fetchImpl:async()=>{calls++;return new Response(null,{status:429});}});
 await assert.rejects(provider.request('https://example.test/',{onAccessLimit:()=>reported++}),error=>error.code==='RATE_LIMIT');
 assert.equal(calls,4);assert.equal(reported,1);assert.ok(now>=420_000);
});

test('an isolated forbidden detail is excluded and the next accessible listing is still read',async()=>{
 let calls=0,reported=0;
 const provider=new WallapopProvider({intervalMs:0,retryAttempts:0,fetchImpl:async()=>{
  if(++calls===1)return new Response(null,{status:403});
  return reply('<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{item:{...raw,slug:raw.web_slug}}}})+'</script>');
 }});
 const listing=normalizeListing(raw);
 const context={onAccessLimit:()=>reported++};
 const first=await provider.enrich([listing],context);
 assert.equal(first.errors.length,1);assert.ok(first.items[0].detailError);
 assert.equal((await provider.enrich([listing],context)).items[0].detailComplete,true);
 assert.equal(reported,0);assert.equal(calls,2);assert.equal(provider.deniedDetails,0);
});

test('repeated forbidden details trip the circuit and cancel later queued reads',async()=>{
 let calls=0,reported=0;
 const controller=new AbortController();
 const provider=new WallapopProvider({intervalMs:0,retryAttempts:0,fetchImpl:async()=>{calls++;return new Response(null,{status:403});}});
 const rows=[1,2,3,4].map(i=>normalizeListing({...raw,id:'forbidden-'+i,web_slug:'forbidden-'+i}));
 const results=await Promise.allSettled(rows.map(row=>provider.enrich([row],{signal:controller.signal,onAccessLimit:error=>{reported++;controller.abort(error);}})));
 assert.equal(calls,3);assert.equal(reported,1);
 assert.ok(results.slice(0,2).every(result=>result.status==='fulfilled'||result.reason===controller.signal.reason));
 assert.equal(results[2].status,'rejected');assert.equal(results[3].status,'rejected');
});

test('a retryable server response resumes only after the requested cooldown',async()=>{
 for(const status of [403,503]){
  let now=0,calls=0;
  const provider=new WallapopProvider({intervalMs:0,now:()=>now,sleep:async ms=>{now+=ms;},fetchImpl:async()=>{
   if(++calls===1)return new Response(null,{status,headers:{'Retry-After':'120'}});
   return reply({available:true});
  }});
  assert.equal((await provider.request('https://example.test/')).available,true);
  assert.equal(calls,2);assert.ok(now>=120_000);
 }
});
