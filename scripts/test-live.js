import fs from 'node:fs';
import path from 'node:path';
import {SearchEngine} from '../ai/engine.js';
import {WallapopProvider} from '../providers/wallapop.js';
import {Store} from '../desktop/store.js';
import {SearchService} from '../desktop/search-service.js';
const root=process.cwd();
const maxCandidates=process.env.CERCA_LIVE_MAX_CANDIDATES===undefined?Infinity:Number(process.env.CERCA_LIVE_MAX_CANDIDATES);
if(maxCandidates!==Infinity&&(!Number.isSafeInteger(maxCandidates)||maxCandidates<1||maxCandidates>1000))throw new Error('CERCA_LIVE_MAX_CANDIDATES debe estar entre 1 y 1000.');
fs.mkdirSync('test-results',{recursive:true});
const store=new Store(path.join(root,'.test-data','live-provider-test'));
store.data.preferences['cerca-pages']=1;
const provider=new WallapopProvider();
const service=new SearchService({engine:new SearchEngine(),provider,store});
const result=await service.search('MacBook Air M2 completo y funcionando, sin fundas ni piezas, hasta 900 euros',{maxPrice:900,radius:50,zone:'Barcelona',center:{latitude:41.3851,longitude:2.1734,label:'Barcelona'},condition:'Cualquiera',source:'Todos'},'live',{maxCandidates,onProgress:console.log});
if(!result.items.length)throw new Error('La búsqueda real no produjo coincidencias verificadas.');
for(const item of result.items){if(item.demo||!item.url?.startsWith('https://es.wallapop.com/item/')||!item.image||!item.detailComplete||item.distance>50||item.price>900||!item.reason)throw new Error('El resultado no cumple la verificación real: '+JSON.stringify(item));}
fs.writeFileSync(process.env.CERCA_LIVE_OUTPUT||'test-results/live-search.json',JSON.stringify(result,null,2));
console.log('CERCA_LIVE_OK',JSON.stringify({accepted:result.items.length,rejected:result.rejected.length,total:result.total,pages:result.source.pages,durationMs:result.durationMs,example:{title:result.items[0].title,price:result.items[0].price,city:result.items[0].city,images:result.items[0].images.length,description:result.items[0].description.length,condition:result.items[0].condition}}));
