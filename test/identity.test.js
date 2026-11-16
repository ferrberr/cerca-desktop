import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalProductText} from '../ai/product-identity.js';
import {literalPlan,SearchEngine} from '../ai/engine.js';

test('source aliases normalize equivalent names without deciding eligibility',()=>{
 assert.equal(canonicalProductText('PS4 con 5 juegos'),'PlayStation 4 con 5 juegos');
 assert.equal(literalPlan('play 5 consola').queries[0],'PlayStation 5 consola');
});
test('different product categories all reach the decision model',async()=>{
 const titles=['PS5','RAM DDR4 16GB','Tornillos M4','Bicicleta talla M'];
 for(const title of titles){
  const decisions=[];
  const engine=new SearchEngine({ollama:{decide:async(_model,data)=>{
   decisions.push(data);
   return {id:1,accept:false,score:0,reason:'No coincide'};
  }}});
  const report=await engine.search(title,[{id:1,title,price:30,description:'Texto completo'}],{zone:'Todas las zonas'});
  assert.equal(decisions.length,1);
  assert.equal(decisions[0].listing.description,'Texto completo');
  assert.equal(report.rejected[0].decisionSource,'model');
 }
});
