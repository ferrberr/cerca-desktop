import {mergeListing} from '../shared/listings.js';
import {DEFAULT_CENTER} from '../shared/geo.js';
import {DEFAULT_MATCH_TARGET} from '../shared/limits.js';
export class SearchService {
 constructor({engine,provider,store,demo=[]}){Object.assign(this,{engine,provider,store,demo});}
 allProducts(){return [...this.demo,...this.store.data.imported,...(this.store.data.live||[])];}
 remember(items){
  if(!items.length)return;
  const all=new Map((this.store.data.live||[]).map(p=>[p.id,p]));
  for(const p of items)all.set(p.id,mergeListing(all.get(p.id),p));
  const favorites=new Set(this.store.data.preferences['cerca-favorites']||[]);
  this.store.data.live=[...all.values()].sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id))||(b.fetchedAt||0)-(a.fetchedAt||0)).slice(0,2000);
  if(this.store.scheduleFlush)this.store.scheduleFlush();else this.store.flush();
 }
 async search(query,constraints,dataset='live',context={}){
  const live=dataset==='live';
  const options={targetResults:this.store.data.preferences['cerca-target']??DEFAULT_MATCH_TARGET,...context};
  if(!live){
   const catalog=dataset==='demo'?this.demo:this.store.data.imported;
   return {...await this.engine.search(query,catalog,constraints,options),dataset};
  }

  let source;
  const sourceStop=new AbortController();
  const onAccessLimit=error=>sourceStop.abort(error);
  const networkContext=ctx=>({
   ...ctx,onAccessLimit,onWait:context.onProgress,signal:ctx.signal?AbortSignal.any([ctx.signal,sourceStop.signal]):sourceStop.signal,
  });
  const known=new Set((this.store.data.live||[]).map(item=>item.id));
  // Refresh stored entries and save each new match before the UI can open its detail.
  // Other candidates only need to live in the page currently being evaluated.
  const refreshKnown=items=>this.remember(items.filter(item=>known.has(item.id)));
  options.enrich=async(items,ctx)=>{
   const enriched=await this.provider.enrich(items,networkContext(ctx));
   refreshKnown(enriched.items);
   return enriched;
  };
  options.onUpdate=async update=>{
   if(update.type==='decision'){
    if(update.item.accepted)known.add(update.item.id);
    refreshKnown([update.item]);
   }
   await context.onUpdate?.(update.type==='catalog'?{...update,source}:update);
  };

  const provider=this.provider;
  async function* pages(plan,effective,ctx){
   if(effective.source&&!['Todos','Wallapop'].includes(effective.source))throw new Error('La fuente automática disponible es Wallapop. Selecciónala o elige Todas.');
   for await(const {items,...metadata} of provider.searchPages(plan,effective,networkContext(ctx))){
    source={name:'Wallapop',...metadata};
    refreshKnown(items);
    yield items;
   }
  }
  const report=await this.engine.search(query,pages,constraints,options);
  this.remember(report.rejected);
  const stopReason=report.stopReason==='exhausted'&&source?.paginationStalled?'source_limit':report.stopReason;
  return {...report,dataset,source,stopReason,catalogItems:this.store.data.live};
 }
 async detail(id,{center=DEFAULT_CENTER,signal,force=false}={}){
  const item=this.allProducts().find(p=>p.id===id);if(!item)throw new Error('No se encuentra el anuncio.');
  if(item.provider!=='wallapop')return item;
  try{const updated=await this.provider.detail(item,{center,signal,force});this.remember([updated]);return mergeListing(item,updated);}
  catch(error){if(error.code==='NOT_FOUND'){const gone=mergeListing(item,{available:false,badge:'No disponible',fetchedAt:Date.now()});this.remember([gone]);return gone;}throw error;}
 }
}
