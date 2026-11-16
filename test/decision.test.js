import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDecision,interpretRequest,parseEvaluation} from '../ai/judge.js';
import {priceRange} from '../shared/prices.js';
import {hardFilter,SearchEngine} from '../ai/engine.js';
const satisfied={type:'choice',choice:'satisfied',probabilities:{satisfied:.95,contradicted:.03,unknown:.02},confidence:.9};
const response={answers:{identity:satisfied,requirements:satisfied,offer:satisfied}};
test('all three independent checks must confirm eligibility',()=>{
 assert.equal(parseEvaluation(response).accept,true);
 for(const name of ['identity','requirements','offer']){
  const result=parseEvaluation({answers:{...response.answers,[name]:{...satisfied,choice:'contradicted'}}});
  assert.equal(result.accept,false);assert.equal(result.category,name);
 }
 const uncertain={...satisfied,probabilities:{satisfied:.6,contradicted:.1,unknown:.3}};
 assert.equal(parseEvaluation({answers:{...response.answers,requirements:uncertain}}).accept,false);
 const confirmed={...satisfied,probabilities:{satisfied:.75,contradicted:.15,unknown:.10}};
 assert.equal(parseEvaluation({answers:{...response.answers,requirements:confirmed}}).accept,true);
 assert.equal(parseEvaluation({answers:{...response.answers,requirements:{...uncertain,choice:'unknown'}}}).accept,false);
});
test('invalid or incomplete model evaluations remain invalid',()=>{
 for(const change of [{choice:'invented'},{probabilities:{satisfied:2}},{confidence:NaN},{type:'text'},{probabilities:{...satisfied.probabilities,satisfied:.2}}]){
  assert.throws(()=>parseEvaluation({answers:{...response.answers,requirements:{...satisfied,...change}}}));
 }
 assert.throws(()=>parseEvaluation({answers:{identity:satisfied}}));
});
test('intent is extracted before any listing and reused without drifting to fit a seller',async()=>{
 let interpretations=0;
 const intent={product:'Tornillos',model_or_family:'M4',requirements:[{requirement:'Exactamente 20 unidades en total',source:'20 unidades'}]};
 const client={
  chat:async(_model,_prompt,data)=>{
   interpretations++;assert.deepEqual(data,{buyer_request:'Tornillos M4 20 unidades'});
   return intent;
  },
  request:async(endpoint,data)=>{
   assert.equal(endpoint,'/v1/systemone');assert.deepEqual(data.state.buyer_intent,intent);
   assert.deepEqual(Object.keys(data.state.listing),['id','title','description','spec']);
   assert.equal(data.state.listing.id,1);assert.equal(data.state.listing.price,undefined);assert.equal(data.state.listing.city,undefined);
   assert.deepEqual(Object.keys(data.questions),['identity','requirements','offer']);
   assert.ok(data.questions.requirements.instructions.includes('Exactamente 20 unidades'));
   return response;
  },
 };
 for(const title of ['Tornillos M5','Tornillos M4','Juego de herramientas']){
  await reviewDecision(client,'local',{request:'Tornillos M4 20 unidades',listing:{title,id:999,price:300,city:'Municipio'}});
 }
 assert.equal(interpretations,1);
});
test('invented source quotations cannot become cached requirements',async()=>{
 const client={chat:async()=>({product:'Producto',model_or_family:null,requirements:[{requirement:'Nuevo',source:'nuevo'}]})};
 await assert.rejects(interpretRequest(client,'Producto 16 unidades'),/requisitos válidos/);
 client.chat=async()=>({product:'Producto',model_or_family:null,requirements:[]});
 await assert.rejects(interpretRequest(client,'Producto 16 unidades'),/omitido un número/);
 client.chat=async()=>({product:'Producto',model_or_family:null,requirements:[{requirement:'16 unidades exactas',source:'16 unidades'}]});
 assert.equal((await interpretRequest(client,'Producto 16 unidades')).product,'Producto');
});
test('an unsupported planning filter is removed before it can discard valid products',async()=>{
 const plan={product:'Producto',queries:['Producto'],must_have:[],exclude:[],condition:'Nuevo',min_price:16,max_price:32,condition_evidence:null,min_price_evidence:'16 euros',max_price_evidence:null};
 const engine=new SearchEngine({ollama:{chat:async()=>plan}});
 const report=await engine.search('Producto con 16 unidades',[],{});
 assert.equal(report.constraints.condition,'Cualquiera');
 assert.equal(report.constraints.minPrice,0);
 assert.equal(report.constraints.maxPrice,Infinity);
});
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
