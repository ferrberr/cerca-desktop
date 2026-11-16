import fs from 'node:fs/promises';
import {Ollama} from '../ai/ollama.js';
import {MODELS} from '../ai/config.js';
const files=['strict-matching.json','general-matching.json'];
const cases=(await Promise.all(files.map(file=>fs.readFile(new URL('../test/fixtures/'+file,import.meta.url),'utf8').then(JSON.parse)))).flat();
const client=new Ollama(),samples=[];
const {interpretRequest}=await import('../ai/judge.js');
const interpretationStart=performance.now();
const requests=[...new Set(cases.map(sample=>sample.request))];
for(const [index,request] of requests.entries()){
 await interpretRequest(client,request);
 console.log('Consultas interpretadas',index+1,'de',requests.length);
}
const interpretationMs=Math.round(performance.now()-interpretationStart);

for(const sample of cases){
 const start=performance.now();
 const decision=await client.decide(MODELS.decision,{request:sample.request,listing:{id:1,...sample.listing}});
 samples.push({...sample,actual:decision.accept,correct:decision.accept===sample.expected,decision,ms:Math.round(performance.now()-start)});
 if(samples.length%10===0)console.log('Evaluados',samples.length,'de',cases.length);
}
const failures=samples.filter(sample=>!sample.correct);
const report={interpretationMs,model:MODELS.decision,total:samples.length,correct:samples.length-failures.length,falsePositives:failures.filter(s=>!s.expected),falseNegatives:failures.filter(s=>s.expected),medianMs:samples.map(s=>s.ms).sort((a,b)=>a-b)[Math.floor(samples.length/2)],samples};
await fs.mkdir('test-results',{recursive:true});
await fs.writeFile('test-results/general-precision.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({total:report.total,correct:report.correct,medianMs:report.medianMs,failures:failures.map(s=>({name:s.name,expected:s.expected,decision:s.decision}))}));
