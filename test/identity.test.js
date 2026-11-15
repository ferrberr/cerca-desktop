import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalProductText,productIdentity,identityRejection} from '../ai/product-identity.js';
import {literalPlan,SearchEngine} from '../ai/engine.js';
import {parseDecision} from '../ai/systemone.js';

test('Play 5 aliases describe a generation, not five games; source queries use the canonical model',()=>{
 for(const request of ['play 5 consola','PS5 consola','playstation5 consola','PlayStation 5 consola','Busco una play 5 sin juegos'])assert.equal(productIdentity(request).consoleGeneration,'5');
 assert.equal(canonicalProductText('PS4 con 5 juegos'),'PlayStation 4 con 5 juegos');
 assert.equal(literalPlan('play 5 consola').queries[0],'PlayStation 5 consola');
});
test('requested accessories and alternatives do not silently become a single console requirement',()=>{
 for(const request of ['mando PS5','Juegos PS5','funda para consola PS5','PS5 o PS4','consola sin PS5'])assert.equal(productIdentity(request).consoleGeneration,null);
});
test('generation and actual object rules reject high confidence model false positives',async()=>{
 let calls=0;const client={decide:async()=>{calls++;return{id:1,accept:true,score:99,reason:'Modelo demasiado permisivo'};}};
 const titles=['PlayStation 4 (PS4) con mando y 5 juegos','PS4 con 5 juegos','PlayStation 3 con 5 juegos','PS2 Slim','Nintendo Switch 2','Mando PS5','Lote de juegos PS5','Consola Sony con mando','PS5 con mando y juegos'];
 const updates=[];
 const result=await new SearchEngine({ollama:client}).search('play 5 consola',titles.map((title,i)=>({id:i+1,title,price:200,distance:1})),{zone:'Todas las zonas'},{onUpdate:u=>{if(u.type==='decision')updates.push(u.item);}});
 assert.deepEqual(result.items.map(p=>p.title),['PS5 con mando y juegos']);
 assert.equal(calls,1);assert.equal(updates.length,titles.length);assert.equal(result.rejected.length,8);
 assert.ok(result.rejected.every(p=>p.decisionSource==='identity_rule'&&p.decisionModel===null));
});
test('the requested generation must be sold, not just mentioned in compatibility or negated text',()=>{
 const identity=productIdentity('play 5 consola');
 for(const listing of [{title:'PS4 compatible con mando PS5'},{title:'Consola Sony',description:'No es PlayStation 5.'},{title:'PS5 pack',description:'Solo caja, no incluye la consola.'}])assert.ok(identityRejection(identity,listing));
 assert.equal(identityRejection(identity,{title:'Consola Sony',description:'Consola PlayStation 5 completa y funcionando.'}),null);
 assert.equal(identityRejection(identity,{title:'PS5 con 5 juegos y 2 mandos'}),null);
});
test('a merely leading match probability is insufficient for strict acceptance',()=>{
 const reply={answers:{eligibility:{type:'choice',choice:'match',probabilities:{match:.7,accessory:.1,wrong_model:.1,broken:.05,missing_requirement:.05},confidence:.6}}};
 assert.equal(parseDecision(reply).accept,false);assert.equal(parseDecision(reply).category,'missing_requirement');
});
