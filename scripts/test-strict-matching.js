import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {SearchEngine} from '../ai/engine.js';
const cases=JSON.parse(await fs.readFile(new URL('../test/fixtures/strict-matching.json',import.meta.url),'utf8'));
const engine=new SearchEngine(),samples=[];
for(const request of new Set(cases.map(c=>c.request))){
 const group=cases.filter(c=>c.request===request);
 const listings=group.map((c,index)=>({...c.listing,id:index+1,price:200,condition:'Buen estado',distance:1,city:'Barcelona'}));
 const updates=[],result=await engine.search(request,listings,{zone:'Todas las zonas',maxPrice:10000},{onUpdate:u=>{if(u.type==='decision')updates.push(u.item.id);}});
 for(let i=0;i<group.length;i++){
  const c=group[i],item=[...result.items,...result.rejected].find(p=>p.id===i+1);
  samples.push({name:c.name,request,title:c.listing.title,expected:c.expected,actual:item?.accepted,correct:item?.accepted===c.expected,category:item?.decisionCategory,source:item?.decisionSource,score:item?.match,reason:item?.reason});
 }
 assert.equal(updates.length,group.length,'Cada anuncio produce una decisión individual');
}
await fs.mkdir('test-results',{recursive:true});
const report={correct:samples.filter(s=>s.correct).length,total:samples.length,falsePositives:samples.filter(s=>!s.expected&&s.actual),falseNegatives:samples.filter(s=>s.expected&&!s.actual),samples};
await fs.writeFile('test-results/strict-matching.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
assert.equal(report.correct,report.total,'La selección estricta contiene errores');
