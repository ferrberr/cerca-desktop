import fs from 'node:fs';
import path from 'node:path';
import {SearchEngine} from '../ai/engine.js';
import {WallapopProvider} from '../providers/wallapop.js';
import {Store} from '../desktop/store.js';
import {SearchService} from '../desktop/search-service.js';
const store=new Store(path.join(process.cwd(),'.test-data','performance-live'));
const provider=new WallapopProvider(),service=new SearchService({engine:new SearchEngine(),provider,store});
const results=[];
for(let run=0;run<2;run++){
 const start=performance.now();let firstMs=null;
 const result=await service.search('MacBook Air M2',{maxPrice:900,radius:50,zone:'Barcelona',center:{latitude:41.3851,longitude:2.1734,label:'Barcelona'},condition:'Cualquiera'},'live',{maxCandidates:8,onUpdate:update=>{if(update.type==='decision'&&update.item.accepted&&firstMs===null){firstMs=Math.round(performance.now()-start);console.log('FIRST_RESULT',JSON.stringify({run,firstMs,id:update.item.id}));}}});
 results.push({run,firstMs,totalMs:result.durationMs,accepted:result.items.length,evaluated:result.evaluated,metrics:result.metrics,source:result.source});
}
store.flush();fs.writeFileSync('test-results/performance-live.json',JSON.stringify(results,null,2));console.log('CERCA_LIVE_PERFORMANCE',JSON.stringify(results));
