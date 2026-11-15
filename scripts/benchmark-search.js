import fs from 'node:fs/promises';
import {SearchEngine} from '../ai/engine.js';
import {Ollama} from '../ai/ollama.js';
const metrics=[];
class MeasuredOllama extends Ollama {
 async request(endpoint,body,options){const start=performance.now();const reply=await super.request(endpoint,body,options);if(body?.model)metrics.push({model:body.model,endpoint,ms:Math.round(performance.now()-start),loadMs:Math.round((reply.load_duration||0)/1e6),promptTokens:reply.prompt_eval_count,generatedTokens:reply.eval_count,promptMs:Math.round((reply.prompt_eval_duration||0)/1e6),generationMs:Math.round((reply.eval_duration||0)/1e6)});return reply;}
}
const catalog=JSON.parse(await fs.readFile('catalog/demo.json','utf8'));
const results=[];
const engine=new SearchEngine({ollama:new MeasuredOllama()});
for(let run=0;run<Number(process.env.CERCA_BENCH_RUNS||1);run++){
 const start=performance.now();let firstMs=null;const arrivals=[];
 const report=await engine.search('MacBook Air M2',catalog,{maxPrice:900,radius:50,zone:'Barcelona',condition:'Cualquiera'},{onUpdate:u=>{if(u.type==='decision'){const ms=Math.round(performance.now()-start);arrivals.push({id:u.item.id,accepted:u.item.accepted,ms});if(u.item.accepted&&firstMs===null)firstMs=ms;}}});
 results.push({firstMs,totalMs:report.durationMs,accepted:report.items.map(p=>p.id),rejected:report.rejected.map(p=>p.id),arrivals});
}
const result={results,metrics};
await fs.mkdir('test-results',{recursive:true});await fs.writeFile(process.env.CERCA_BENCH_OUTPUT||'test-results/performance-current.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
