import {setTimeout as wait} from 'node:timers/promises';
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
const publicPageKey = url => 'public-page:' + url;

export class WallapopProvider {
 constructor({fetchImpl=fetch,cache=new Map(),intervalMs=1200,now=()=>Date.now(),sleep=wait,retryAttempts=3}={}){this.fetch=fetchImpl;this.cache=cache;this.intervalMs=intervalMs;this.baseIntervalMs=intervalMs;this.now=now;this.tail=Promise.resolve();this.lastRequest=0;this.sleep=sleep;this.retryAttempts=retryAttempts;this.deniedDetails=0;this.lastDeniedDetailAt=0;}
 async request(url,{signal,ttl=60_000,json=true,parsePage=false,onAccessLimit,onWait=()=>{}}={}){
  const key=parsePage?publicPageKey(url):url;
  signal?.throwIfAborted();
  const cached=this.cache.get(key);
  if(cached&&cached.until>this.now())return cached.data;
  const task=this.tail.catch(()=>{}).then(async()=>{
   signal?.throwIfAborted();
   // Another queued consumer may already have fetched this URL.
   const queuedCache=this.cache.get(key);
   if(queuedCache&&queuedCache.until>this.now())return queuedCache.data;
   let response;
   for(let attempt=0;;attempt++){
    const delay=Math.max(0,this.lastRequest+this.intervalMs-this.now());
    if(delay)await this.sleep(delay,undefined,{signal});
    signal?.throwIfAborted();
    this.lastRequest=this.now();
    try{response=await this.fetch(url,{headers:WALLAPOP_HEADERS,signal:AbortSignal.any([AbortSignal.timeout(25_000),...(signal?[signal]:[])]),redirect:'error'});}
    catch(error){if(signal?.aborted)throw error;throw new ProviderError('No se puede conectar con Wallapop. Comprueba la conexión e inténtalo más tarde.','NETWORK');}
    const header=response.headers?.get('retry-after');
    const retryAfter=header&&/^\d+$/.test(header.trim())?Number(header)*1000:header?Date.parse(header)-this.now():NaN;
    const retryable=response.status===429||response.status===503||response.status===403&&Number.isFinite(retryAfter);
    if(retryable&&attempt<this.retryAttempts){
     const pause=Math.max(60_000*2**attempt,Number.isFinite(retryAfter)?retryAfter:0);
     this.intervalMs=Math.max(this.intervalMs,Math.min(10_000,1200*2**(attempt+1)));
     const until=new Date(this.now()+pause).toLocaleTimeString('es-ES');
     onWait(`Wallapop pide una pausa · reanudación a las ${until} · intento ${attempt+1}/${this.retryAttempts}. Los resultados encontrados siguen disponibles.`);
     await response.body?.cancel().catch(()=>{});
     // Hold the shared queue during cooldown so prefetched details and other
     // callers cannot send requests while the source asks us to wait.
     let remaining=pause;
     while(remaining>0){
      const chunk=Math.min(remaining,60_000);
      await this.sleep(chunk,undefined,{signal});
      remaining-=chunk;
     }
     continue;
    }
    if(response.status===403&&parsePage){
     if(this.now()-this.lastDeniedDetailAt>60_000)this.deniedDetails=0;
     this.lastDeniedDetailAt=this.now();
     this.deniedDetails++;
     if(this.deniedDetails<3){
      const error=new ProviderError('No se permite leer esta ficha pública. Se ha excluido este anuncio.','DETAIL_FORBIDDEN');
      error.status=403;
      throw error;
     }
    }
    if([401,403,429].includes(response.status)){
     const error=response.status===429
      ?new ProviderError('Wallapop sigue limitando las consultas tras las pausas. Los resultados verificados se han conservado.','RATE_LIMIT')
      :new ProviderError('Wallapop ha denegado el acceso a esta petición (HTTP '+response.status+').','ACCESS_DENIED');
     error.status=response.status;
     onAccessLimit?.(error);
     throw error;
    }
    break;
   }
   if(response.status===404||response.status===410)throw new ProviderError('El anuncio ya no está disponible.','NOT_FOUND');
   if(!response.ok)throw new ProviderError(`Wallapop no ha podido responder (${response.status}).`,'HTTP_ERROR');
   let data;
   if(parsePage){data=parsePublicPage(await response.text());this.deniedDetails=0;}
   else if(json)data=await response.json();
   else data=await response.text();
   signal?.throwIfAborted();
   this.intervalMs=Math.max(this.baseIntervalMs,this.intervalMs*.9);
   this.cache.delete(key);
   if(this.cache.size>=2000)this.cache.delete(this.cache.keys().next().value);
   this.cache.set(key,{storedAt:this.now(),until:this.now()+ttl,data});return data;
  });
  this.tail=task;return task;
 }
 async searchSection(pass,filters,center,requestOptions){
  const params=new URLSearchParams({keywords:pass.query,source:'search_box',order_by:pass.order,latitude:String(center.latitude),longitude:String(center.longitude)});
  if(filters.zone!=='Todas las zonas')params.set('distance_in_km',String(filters.radius||50));
  if(Number.isFinite(filters.minPrice)&&filters.minPrice>0)params.set('min_sale_price',String(filters.minPrice));
  if(Number.isFinite(filters.maxPrice))params.set('max_sale_price',String(filters.maxPrice));
  const condition={Nuevo:'new','Como nuevo':'as_good_as_new','Buen estado':'good',Aceptable:'fair','Para piezas':'has_given_it_all'}[filters.condition];
  if(condition)params.set('condition',condition);
  const config=await this.request('https://api.wallapop.com/api/v3/search/components?'+params,requestOptions);
  const queryParams=config?.components?.find(c=>c.type==='search_results')?.type_data?.query_params;
  if(!queryParams||typeof queryParams.search_id!=='string')throw new ProviderError('La estructura de búsqueda de Wallapop ha cambiado.','INVALID_RESPONSE');
  const section=new URLSearchParams(params);
  for(const [key,value] of Object.entries(queryParams)){
   if(value!==null&&value!==undefined)section.set(key,String(value));
  }
  section.set('source','deep_link');
  section.set('section_type','organic_search_results');
  return section;
 }

 async *searchPages(plan,filters={}, {signal,onAccessLimit,onProgress=()=>{},pages=Infinity}={}){
  const center=filters.center||DEFAULT_CENTER;
  const requestOptions={signal,onAccessLimit,onWait:onProgress};
  const queries=[plan.product,...(plan.queries||[])].map(q=>q.trim()).filter(Boolean).filter((q,i,a)=>a.findIndex(v=>v.toLowerCase()===q.toLowerCase())===i).slice(0,2);
  if(!queries.length)throw new ProviderError('Introduce un producto para buscar.');
  if(pages!==Infinity&&(!Number.isSafeInteger(pages)||pages<1))throw new ProviderError('El número de páginas debe ser un entero positivo.');
  const passes=[
   {query:queries[0],order:'most_relevance'},
   {query:queries[0],order:'price_low_to_high'},
  ];
  if(queries[1])passes.push({query:queries[1],order:'most_relevance'});
  const pending=passes.map(pass=>({...pass,seenCursors:new Set(),pageCount:0}));
  const seenIds=new Set();
  let pageCount=0,skippedInvalid=0,paginationStalled=false,limited=false;

  // Alternate relevance and price. Fetch only when the decision engine asks for another page.
  while(pending.length){
   signal?.throwIfAborted();
   const pass=pending.shift();
   if(!pass.section){
    onProgress('Consultando Wallapop: '+pass.query+'…');
    pass.section=await this.searchSection(pass,filters,center,requestOptions);
   }
   onProgress('Recogiendo anuncios reales · página '+(pageCount+1)+'…');
   const result=await this.request('https://api.wallapop.com/api/v3/search/section?'+pass.section,requestOptions);
   const rawItems=result?.data?.section?.items;
   if(!Array.isArray(rawItems))throw new ProviderError('Wallapop devolvió una página sin anuncios reconocibles.','INVALID_RESPONSE');
   pageCount++;
   pass.pageCount++;
   const items=[];
   for(const raw of rawItems){
    if(seenIds.has(raw?.id))continue;
    let item;
    try{item=normalizeListing(raw,{center});}
    catch{skippedInvalid++;continue;}
    if(item.available&&!item.reserved){
     seenIds.add(item.providerId);
     items.push(item);
    }
   }
   const next=result?.meta?.next_page;
   if(next!=null&&next!==''){
    if(typeof next!=='string'||next.length>20_000)throw new ProviderError('Paginación de Wallapop no válida.','INVALID_RESPONSE');
    if(pass.seenCursors.has(next)){
     paginationStalled=true;
    }else if(pass.pageCount>=pages){
     limited=true;
    }else{
     pass.seenCursors.add(next);
     pass.section.set('next_page',next);
     pending.push(pass);
    }
   }
   yield {items,pages:pageCount,queries,hasMore:pending.length>0||limited,paginationStalled,skippedInvalid,fetchedAt:this.now()};
  }
 }

 // The collecting API retains its small default; the app consumes searchPages on demand.
 async search(plan,filters={}, {onPage=()=>{},pages=2,...options}={}){
  const items=[];
  let metadata;
  for await(const {items:batch,...page} of this.searchPages(plan,filters,{...options,pages})){
   metadata=page;
   for(const item of batch)items.push(item);
   await onPage(batch,page);
  }
  return {items,...metadata};
 }
 async detail(listing,{signal,onAccessLimit,onWait,center=DEFAULT_CENTER,force=false}={}){
  if(listing.provider!=='wallapop'||!/^[a-zA-Z0-9_%-]{1,300}$/.test(listing.slug||''))throw new ProviderError('El enlace de la ficha no es válido.');
  const url='https://es.wallapop.com/item/'+listing.slug;
  if(force)this.cache.delete(publicPageKey(url));
  // Keep only the listing and seller fields when caching hundreds of public pages.
  const parsed=await this.request(url,{signal,onAccessLimit,onWait,parsePage:true,ttl:15*60_000});
  if(parsed.item.id!==listing.providerId)throw new ProviderError('La ficha recibida no corresponde al anuncio.','INVALID_RESPONSE');
  const item=normalizeListing(parsed.item,{center,seller:parsed.seller,detailed:true,now:this.cache.get(publicPageKey(url))?.storedAt??this.now()});
  if(!item.createdAt)item.createdAt=listing.createdAt;
  return item;
 }
 async enrich(items,{signal,onAccessLimit,onWait,onProgress=()=>{},center=DEFAULT_CENTER}={}){
  const result=[],errors=[];
  for(const [i,item]of items.entries()){
   signal?.throwIfAborted();onProgress(`Leyendo fichas públicas ${i+1} de ${items.length}…`);
   try{result.push(await this.detail(item,{signal,onAccessLimit,onWait,center}));}
   catch(e){if(signal?.aborted)throw signal.reason;if(['ACCESS_DENIED','RATE_LIMIT'].includes(e.code))throw e;if(e.code!=='NOT_FOUND')result.push({...item,detailError:e.message});errors.push({id:item.id,error:e.message});}
  }
  return {items:result,errors};
 }
}
