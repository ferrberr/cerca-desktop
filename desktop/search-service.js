import {mergeListing} from '../shared/listings.js';
import {AsyncQueue} from '../shared/async-queue.js';
import {DEFAULT_CENTER} from '../shared/geo.js';
export class SearchService {
 constructor({engine,provider,store,demo=[]}){Object.assign(this,{engine,provider,store,demo});}
 allProducts(){return [...this.demo,...this.store.data.imported,...(this.store.data.live||[])];}
 remember(items){
  const all=new Map((this.store.data.live||[]).map(p=>[p.id,p]));
  for(const p of items)all.set(p.id,mergeListing(all.get(p.id),p));
  const favorites=new Set(this.store.data.preferences['cerca-favorites']||[]);
  this.store.data.live=[...all.values()].sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id))||(b.fetchedAt||0)-(a.fetchedAt||0)).slice(0,2000);
  if(this.store.scheduleFlush)this.store.scheduleFlush();else this.store.flush();
 }
 async search(query,constraints,dataset='live',context={}){
  let fetched;
  const live=dataset==='live';
  const options={...context,onUpdate:async update=>{
   if(live&&update.type==='decision')this.remember([update.item]);
   await context.onUpdate?.(update.type==='catalog'?{...update,source:fetched?{name:'Wallapop',...fetched,items:undefined}:undefined}:update);
  }};
  if(live)options.enrich=async(items,ctx)=>{const enriched=await this.provider.enrich(items,ctx);this.remember(enriched.items);return enriched;};
  const catalog=live?async(plan,effective,ctx)=>{
   if(effective.source&& !['Todos','Wallapop'].includes(effective.source))throw new Error('La fuente automática disponible es Wallapop. Selecciónala o elige Todas.');
   const fetchController=new AbortController();
   const queue=new AsyncQueue(()=>fetchController.abort());
   const signal=AbortSignal.any([fetchController.signal,...(ctx.signal?[ctx.signal]:[])]);
   this.provider.search(plan,effective,{...ctx,signal,pages:this.store.data.preferences['cerca-pages']||2,onPage:(items,metadata)=>{
    fetched=metadata;this.remember(items);if(items.length)queue.push(items);
   }}).then(result=>{fetched=result;queue.finish();},error=>queue.finish(error));
   return queue;
  }:dataset==='demo'?this.demo:this.store.data.imported;
  const report=await this.engine.search(query,catalog,constraints,options);
  if(live)this.remember([...report.items,...report.rejected]);
  return {...report,dataset,...(fetched?{source:{name:'Wallapop',pages:fetched.pages,queries:fetched.queries,hasMore:fetched.hasMore,fetchedAt:fetched.fetchedAt,skippedInvalid:fetched.skippedInvalid}}:{}),catalogItems:live?(this.store.data.live||[]):undefined};
 }
 async detail(id,{center=DEFAULT_CENTER,signal,force=false}={}){
  const item=this.allProducts().find(p=>p.id===id);if(!item)throw new Error('No se encuentra el anuncio.');
  if(item.provider!=='wallapop')return item;
  try{const updated=await this.provider.detail(item,{center,signal,force});this.remember([updated]);return mergeListing(item,updated);}
  catch(error){if(error.code==='NOT_FOUND'){const gone=mergeListing(item,{available:false,badge:'No disponible',fetchedAt:Date.now()});this.remember([gone]);return gone;}throw error;}
 }
}
