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
