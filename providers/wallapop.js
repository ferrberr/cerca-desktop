import {createHash} from 'node:crypto';
import {distanceKm,DEFAULT_CENTER,validCoordinates} from '../shared/geo.js';

export class ProviderError extends Error {
 constructor(message,code='PROVIDER_ERROR'){super(message);this.code=code;}
}
export const WALLAPOP_HEADERS=Object.freeze({
 'User-Agent':'Cerca/0.3 (Linux desktop; personal product finder)',
 'Accept':'application/json, text/html;q=0.9', 'Accept-Language':'es-ES,es;q=0.9',
 'Origin':'https://es.wallapop.com','Referer':'https://es.wallapop.com/','X-DeviceOS':'0',
});
const str=(v,max=200)=>typeof v==='string'?v.slice(0,max):'';
const original=v=>typeof v==='string'?v:v?.original||'';
const flag=v=>typeof v==='boolean'?v:v?.flag===true;
const conditionMap={new:'Nuevo',as_good_as_new:'Como nuevo',good:'Buen estado',fair:'Aceptable',has_given_it_all:'Para piezas'};
export function imageURLs(images){return (Array.isArray(images)?images:[]).map(i=>i?.urls?.big||i?.urls?.medium||i?.url).filter(u=>{
 try{const parsed=new URL(u);return parsed.protocol==='https:'&&parsed.hostname==='cdn.wallapop.com'&&parsed.pathname.startsWith('/images/')&&!parsed.username&&!parsed.password;}catch{return false;}
}).slice(0,30);}
function stableId(id){return 1000+createHash('sha256').update('wallapop:'+id).digest().readUIntBE(0,6);}
export function normalizeListing(raw,{center=DEFAULT_CENTER,seller=null,detailed=false,now=Date.now()}={}){
 if(!raw||typeof raw.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id))throw new ProviderError('Wallapop devolvió un identificador no válido.','INVALID_RESPONSE');
 const title=str(original(raw.title),300),price=raw.price?.cash?.amount??raw.price?.amount;
 if(!title||!Number.isFinite(price)||price<0)throw new ProviderError('Wallapop devolvió un anuncio sin título o precio.','INVALID_RESPONSE');
 const currency=raw.price?.cash?.currency??raw.price?.currency;
 if(currency&&currency!=='EUR')throw new ProviderError('Moneda no compatible.','CURRENCY');
 const slug=str(raw.slug||raw.web_slug,300);
 if(!slug||!/^[a-zA-Z0-9_%-]+$/.test(slug))throw new ProviderError('El anuncio no incluye un enlace público válido.','INVALID_RESPONSE');
 const loc=raw.location||{},coords=validCoordinates(loc.latitude,loc.longitude)?{latitude:loc.latitude,longitude:loc.longitude}:{latitude:null,longitude:null};
 const rawCondition=raw.condition?.value||raw.typeAttributes?.condition?.value||raw.condition;
 const condition=conditionMap[rawCondition]||str(raw.condition?.text||raw.condition?.iconText||raw.typeAttributes?.condition?.text,100)||'Sin indicar';
 const images=imageURLs(raw.images);
 const attrs=Object.entries(raw.typeAttributes||{}).map(([key,value])=>({name:str(value?.title||key,100),value:str(value?.text||value?.icon_text||String(value?.value||''),300)}));
 for(const entry of raw.characteristicsDetails||[])if(entry&&typeof entry.value==='string')attrs.push({name:str(entry.attribute,100),value:str(entry.value,300)});
 const available=!(flag(raw.flags?.sold)||flag(raw.flags?.expired)||raw.sold===true||raw.expired===true);
 const reserved=flag(raw.flags?.reserved)||flag(raw.reserved)||flag(raw.flags?.onHold);
 const shipping=raw.shipping||{};
 const item={
  id:stableId(raw.id),providerId:raw.id,provider:'wallapop',title,price,currency:'EUR',previous:null,
  spec:str(raw.characteristics,500)||[raw.brand,raw.model,condition==='Sin indicar'?'Estado pendiente de consultar':condition].filter(Boolean).join(' · '),
  description:str(original(raw.description),12000),condition,city:str(loc.city,150)||'Localidad no indicada',district:'',
  ...coords,distance:distanceKm(center,coords),locationApproximate:loc.approximated!==false,
  postalCode:str(loc.postalCode||loc.postal_code,20),source:'Wallapop',url:'https://es.wallapop.com/item/'+slug,slug,
  images,image:images[0]||null,illustration:!images.length,asset:'laptop-1',demo:false,
  badge:!available?'No disponible':reserved?'Reservado':detailed?'Ficha consultada':'Anuncio real',available,reserved,
  shipping:Boolean(shipping.isItemShippable&&shipping.isShippingAllowedByUser||shipping.item_is_shippable&&shipping.user_allows_shipping),
  brand:str(raw.brand,150)||null,model:str(raw.model,150)||null,attributes:attrs,
  categories:(raw.taxonomies||raw.taxonomy||[]).map(t=>str(t.name,150)).filter(Boolean),
  createdAt:Number.isFinite(raw.created_at)?raw.created_at:null,
  modifiedAt:Number.isFinite(raw.modifiedDate||raw.modified_at)?raw.modifiedDate||raw.modified_at:null,
  views:Number.isFinite(raw.views)?raw.views:null,favoritesCount:Number.isFinite(raw.favorites)?raw.favorites:null,
  fetchedAt:now,detailFetchedAt:detailed?now:null,detailComplete:detailed,
 };
 if(seller){
  item.seller={name:str(seller.microName,150),rating:Number.isFinite(seller.stats?.ratingAverage)?seller.stats.ratingAverage:null,reviews:Number.isFinite(seller.stats?.counters?.reviews)?seller.stats.counters.reviews:null,verified:seller.verified===true,pro:seller.type==='pro',registeredAt:Number.isFinite(seller.registerDate)?seller.registerDate:null};
 }
 return item;
}
export function parsePublicPage(html){
 const match=html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
 if(!match)throw new ProviderError('La estructura de la ficha pública ha cambiado.','INVALID_RESPONSE');
 let page;try{page=JSON.parse(match[1])?.props?.pageProps;}catch{throw new ProviderError('La ficha pública no contiene datos válidos.','INVALID_RESPONSE');}
 if(!page?.item)throw new ProviderError('El anuncio ya no está disponible.','NOT_FOUND');
 return {item:page.item,seller:page.itemSeller};
}
export class WallapopProvider {
 constructor({fetchImpl=fetch,cache=new Map(),intervalMs=550,now=()=>Date.now()}={}){this.fetch=fetchImpl;this.cache=cache;this.intervalMs=intervalMs;this.now=now;this.tail=Promise.resolve();this.lastRequest=0;}
 async request(url,{signal,ttl=60_000,json=true}={}){
  signal?.throwIfAborted();
  const cached=this.cache.get(url);
  if(cached&&cached.until>this.now())return cached.data;
  const task=this.tail.catch(()=>{}).then(async()=>{
   signal?.throwIfAborted();
   // Another queued consumer may already have fetched this URL.
   const queuedCache=this.cache.get(url);
   if(queuedCache&&queuedCache.until>this.now())return queuedCache.data;
   const delay=Math.max(0,this.lastRequest+this.intervalMs-this.now());
   if(delay)await new Promise((resolve,reject)=>{const onAbort=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},delay);signal?.addEventListener('abort',onAbort,{once:true});});
   this.lastRequest=this.now();
   let response;
   try{response=await this.fetch(url,{headers:WALLAPOP_HEADERS,signal:AbortSignal.any([AbortSignal.timeout(25_000),...(signal?[signal]:[])]),redirect:'error'});}
   catch(e){if(signal?.aborted)throw e;throw new ProviderError('No se puede conectar con Wallapop. Comprueba la conexión e inténtalo más tarde.','NETWORK');}
   if(response.status===429)throw new ProviderError('Wallapop ha limitado las consultas. Espera unos minutos antes de volver a buscar.','RATE_LIMIT');
   if(response.status===401||response.status===403)throw new ProviderError('Wallapop no permite esta consulta en este momento. No se han mostrado anuncios de ejemplo.','ACCESS_DENIED');
   if(response.status===404||response.status===410)throw new ProviderError('El anuncio ya no está disponible.','NOT_FOUND');
   if(!response.ok)throw new ProviderError(`Wallapop no ha podido responder (${response.status}).`,'HTTP_ERROR');
   const data=json?await response.json():await response.text();
   signal?.throwIfAborted();
   if(this.cache.size>2000)this.cache.delete(this.cache.keys().next().value);
   this.cache.set(url,{storedAt:this.now(),until:this.now()+ttl,data});return data;
  });
  this.tail=task;return task;
 }
 async search(plan,filters={}, {signal,onProgress=()=>{},onPage=()=>{},pages=2}={}){
  const center=filters.center||DEFAULT_CENTER;
  const queries=[plan.product,...plan.queries].map(q=>q.trim()).filter(Boolean).filter((q,i,a)=>a.findIndex(v=>v.toLowerCase()===q.toLowerCase())===i).slice(0,2);
  const found=new Map();let pageCount=0,hasMore=false;const invalid=[];
  // Search relevant listings and a price-ordered pass. Each pass is bounded and cancellable.
  const passes=[{query:queries[0],order:'most_relevance'},...(queries[1]?[{query:queries[1],order:'most_relevance'}]:[]),{query:queries[0],order:'price_low_to_high'}];
  for(const pass of passes){
   signal?.throwIfAborted();
   const params=new URLSearchParams({keywords:pass.query,source:'search_box',order_by:pass.order,latitude:String(center.latitude),longitude:String(center.longitude)});
   if(filters.zone!=='Todas las zonas')params.set('distance_in_km',String(filters.radius||50));
   if(Number.isFinite(filters.minPrice)&&filters.minPrice>0)params.set('min_sale_price',String(filters.minPrice));
   if(Number.isFinite(filters.maxPrice))params.set('max_sale_price',String(filters.maxPrice));
   const condition={Nuevo:'new','Como nuevo':'as_good_as_new','Buen estado':'good',Aceptable:'fair','Para piezas':'has_given_it_all'}[filters.condition];
   if(condition)params.set('condition',condition);
   onProgress(`Consultando Wallapop: ${pass.query}…`);
   const config=await this.request('https://api.wallapop.com/api/v3/search/components?'+params,{signal});
   const queryParams=config?.components?.find(c=>c.type==='search_results')?.type_data?.query_params;
   if(!queryParams||typeof queryParams.search_id!=='string')throw new ProviderError('La estructura de búsqueda de Wallapop ha cambiado.','INVALID_RESPONSE');
   const section=new URLSearchParams(params);
   for(const [k,v]of Object.entries(queryParams))if(v!==null&&v!==undefined)section.set(k,String(v));
   section.set('source','deep_link');section.set('section_type','organic_search_results');
   for(let page=0;page<pages;page++){
    onProgress(`Recogiendo anuncios reales · página ${pageCount+1}…`);
    const result=await this.request('https://api.wallapop.com/api/v3/search/section?'+section,{signal});
    const items=result?.data?.section?.items;
    if(!Array.isArray(items))throw new ProviderError('Wallapop devolvió una página sin anuncios reconocibles.','INVALID_RESPONSE');
    pageCount++;
    const discovered=[];
    for(const raw of items){try{const item=normalizeListing(raw,{center});if(item.available&&!item.reserved){if(!found.has(item.id))discovered.push(item);found.set(item.id,item);}}catch(e){invalid.push(e.code||'INVALID_RESPONSE');}}
    await onPage(discovered,{pages:pageCount,queries,hasMore:Boolean(result.meta?.next_page),skippedInvalid:invalid.length,fetchedAt:this.now()});
    const next=result.meta?.next_page;hasMore=Boolean(next);
    if(!next||!items.length)break;
    if(typeof next!=='string'||next.length>20_000)throw new ProviderError('Paginación de Wallapop no válida.','INVALID_RESPONSE');
    section.set('next_page',next);
   }
  }
  return {items:[...found.values()],pages:pageCount,queries,hasMore,skippedInvalid:invalid.length,fetchedAt:this.now()};
 }
 async detail(listing,{signal,center=DEFAULT_CENTER,force=false}={}){
  if(listing.provider!=='wallapop'||!/^[a-zA-Z0-9_%-]{1,300}$/.test(listing.slug||''))throw new ProviderError('El enlace de la ficha no es válido.');
  const url='https://es.wallapop.com/item/'+listing.slug;
  if(force)this.cache.delete(url);
  const html=await this.request(url,{signal,json:false,ttl:15*60_000});
  const parsed=parsePublicPage(html);
  if(parsed.item.id!==listing.providerId)throw new ProviderError('La ficha recibida no corresponde al anuncio.','INVALID_RESPONSE');
  const item=normalizeListing(parsed.item,{center,seller:parsed.seller,detailed:true,now:this.cache.get(url)?.storedAt||this.now()});
  if(!item.createdAt)item.createdAt=listing.createdAt;
  return item;
 }
 async enrich(items,{signal,onProgress=()=>{},center=DEFAULT_CENTER}={}){
  const result=[],errors=[];
  for(const [i,item]of items.entries()){
   signal?.throwIfAborted();onProgress(`Leyendo fichas públicas ${i+1} de ${items.length}…`);
   try{result.push(await this.detail(item,{signal,center}));}
   catch(e){if(signal?.aborted||['ACCESS_DENIED','RATE_LIMIT'].includes(e.code))throw e;if(e.code!=='NOT_FOUND')result.push({...item,detailError:e.message});errors.push({id:item.id,error:e.message});}
  }
  return {items:result,errors};
 }
}
