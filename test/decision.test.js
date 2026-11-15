import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDecision,decisionQuestion,systemDecision} from '../ai/systemone.js';
import {priceRange} from '../shared/prices.js';
import {hardFilter,SearchEngine} from '../ai/engine.js';
const response={answers:{eligibility:{type:'choice',choice:'match',probabilities:{match:.95,accessory:.02,wrong_model:.01,broken:.01,missing_requirement:.01},confidence:.9}}};
test('typed decisions map only documented classes to validated individual results',()=>{const result=parseDecision(response);assert.equal(result.accept,true);assert.equal(result.score,95);assert.equal(result.id,1);assert.ok(result.reason);assert.equal(parseDecision({answers:{eligibility:{...response.answers.eligibility,choice:'accessory'}}}).accept,false);});
test('malformed or unnormalised decision probabilities are invalid',()=>{for(const change of [{choice:'invented'},{probabilities:{match:2}},{confidence:NaN},{type:'text'},{probabilities:{...response.answers.eligibility.probabilities,match:.2}}])assert.throws(()=>parseDecision({answers:{eligibility:{...response.answers.eligibility,...change}}}));});
test('typed API uses one listing and no autoregressive chat output',async()=>{let url,body;const client={request:async(endpoint,data)=>{url=endpoint;body=data;return response;}};await systemDecision(client,'test',{request:'MacBook',listing:{id:1,title:'MacBook'}});assert.equal(url,'/v1/systemone');assert.equal(body.state.listing.id,1);assert.equal(body.messages,undefined);assert.equal(Object.keys(body.questions).length,1);});
test('explicit accessory and repair requests adjust decision criteria',()=>{assert.match(decisionQuestion({request:'MacBook M2 para reparar'}).criteria.broken,/NO usar/);assert.match(decisionQuestion({request:'Busco una funda para iPhone 15'}).criteria.accessory,/DISTINTO/);assert.doesNotMatch(decisionQuestion({request:'MacBook sin fundas ni piezas'}).criteria.accessory,/DISTINTO/);});
test('minimum and maximum prices are inclusive and omitted minimum means zero',()=>{const items=[{price:0,distance:1},{price:600,distance:1},{price:700,distance:1},{price:800,distance:1},{price:801,distance:1}];assert.deepEqual(hardFilter(items,{minPrice:600,maxPrice:800,zone:'Todas las zonas'}).map(p=>p.price),[600,700,800]);assert.equal(priceRange({}).minPrice,0);assert.throws(()=>priceRange({minPrice:900,maxPrice:800}));assert.throws(()=>priceRange({minPrice:-1}));assert.throws(()=>priceRange({minPrice:NaN}));});
test('natural-language minimum is combined with UI limits using the tighter bounds',async()=>{const plan={product:'MacBook',queries:['MacBook'],must_have:[],exclude:[],min_price:600,max_price:900,condition:'Cualquiera'};const client={chat:async()=>plan};const result=await new SearchEngine({ollama:client}).search('MacBook desde 600 euros',[],{minPrice:700,maxPrice:850});assert.equal(result.constraints.minPrice,700);assert.equal(result.constraints.maxPrice,850);await assert.rejects(new SearchEngine({ollama:client}).search('MacBook desde 600 euros',[],{minPrice:950,maxPrice:1000}),/mínimo/);});

// Exercise persistence independently of the renderer so alerts cannot bypass price bounds.
test('alert minimum survives reload and invalid ranges never overwrite saved alerts',async()=>{
 const {Store}=await import('../desktop/store.js');
 const fs=await import('node:fs/promises');
 const os=await import('node:os');
 const path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cerca-price-alert-'));
 try{
  const store=new Store(dir);
  const alert={id:1,query:'MacBook',minPrice:600,price:800,radius:50,condition:'Cualquiera',zone:'Barcelona',enabled:true};
  store.setPreference('cerca-alerts',[alert]);
  assert.equal(new Store(dir).data.preferences['cerca-alerts'][0].minPrice,600);
  for(const minPrice of [-1,801,Infinity,NaN])assert.throws(()=>store.setPreference('cerca-alerts',[{...alert,minPrice}]));
  assert.equal(new Store(dir).data.preferences['cerca-alerts'][0].minPrice,600);
  const {minPrice,...legacy}=alert;store.setPreference('cerca-alerts',[legacy]);
  assert.equal(priceRange({minPrice:new Store(dir).data.preferences['cerca-alerts'][0].minPrice}).minPrice,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
