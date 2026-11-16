import {matchesFilters,mergeListing} from './shared/listings.js';
import {priceRange} from './shared/prices.js';
import {DEFAULT_MATCH_TARGET,MATCH_TARGETS,MAX_RESULTS} from './shared/limits.js';
import {DEFAULT_CENTER,listingDistance} from './shared/geo.js';
import {renderRealMap,destroyMap} from './map.js';
const icons = {
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
 scan:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="4.5"/>',
 map:'<path d="m9 4 6 3 6-3v16l-6 3-6-3-6 3V7zM9 4v16m6-13v16"/>',
 heart:'<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 6l-1-1.2a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 'bell-plus':'<path d="M16 4a6 6 0 0 0-10 4c0 7-3 7-3 9h18c0-1-2-2-3-6M10 21h4m6-20v6m-3-3h6"/>',
 'chevron-down':'<path d="m7 10 5 5 5-5"/>', chevrons:'<path d="m8 8 4-4 4 4m-8 8 4 4 4-4"/>',
 'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 more:'<circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
 'check-shield':'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
 moon:'<path d="M20.9 13a9 9 0 0 1-10-10A9 9 0 1 0 20.9 13Z"/>',
 settings:'<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
 sliders:'<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
 sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check:'<path d="m5 12 4 4L19 6"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 arrow:'<path d="M7 17 17 7M7 7h10v10"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.search}</svg>`;
const $=s=>document.querySelector(s);
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const desktop=window.cercaDesktop;
const unwrap=r=>{if(!r.ok)throw new Error(r.error);return r.value;};
const products=new Map();
let favorites=new Set(),alerts=[],recent=['MacBook Air M2','Sony WH-1000XM5','iPhone 15'];
let dataset='live',theme='dark',modelHealth=null,aiResult=null,searchReport=null,searchError=null,searching=false,progress='';
let matchTarget=DEFAULT_MATCH_TARGET,cancelPending=false,searchCancelled=false;
let modelLabels={planner:'Qwen3.5 9B',decision:'Nimble 9B'};
let appInfo={},modelsInstalling=false,modelProgress=null;
let toastTimer,detailToken=0,activeSearchId=null;
const state={page:'search',query:'MacBook Air M2',minPrice:0,maxPrice:900,condition:'Cualquiera',radius:50,zone:'Barcelona',source:'Todos',sort:'price-asc',center:{...DEFAULT_CENTER}};
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
async function pref(key,value){unwrap(await desktop.setPreference(key,value));}
function save(key,value){pref(key,value).catch(error=>toast(error.message));}
function setTheme(value){theme=value;document.documentElement.dataset.theme=value;$('#theme-toggle').innerHTML=icon(value==='dark'?'sun':'moon');$('#theme-toggle').setAttribute('aria-label',`Cambiar a modo ${value==='dark'?'claro':'oscuro'}`);save('cerca-theme',theme);}
const normalized=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function imageFor(p,index=0){const url=p.images?.[index]||p.image;try{const u=new URL(url);if(u.protocol==='https:'&&u.hostname==='cdn.wallapop.com'&&u.pathname.startsWith('/images/'))return u.href;}catch{}return p.demo&&/^laptop-[1-6]$|^phone$|^headphones$/.test(p.asset)?`assets/${p.asset}.svg`:'assets/product-placeholder.svg';}
const boundImages=new WeakSet();
function bindImages(root){root.querySelectorAll('img').forEach(img=>{if(boundImages.has(img))return;boundImages.add(img);img.addEventListener('error',()=>{img.src='assets/product-placeholder.svg';img.alt='Foto no disponible';},{once:true});});}
const money=p=>`${p.price.toLocaleString('es-ES')} €`;
const affinity=p=>p.analyzed?`${p.match}/100 de afinidad`:'Sin analizar';
function decisionSummary(product){
 const labels={identity:'Producto',requirements:'Requisitos',offer:'Oferta'};
 const status={satisfied:'confirmado',contradicted:'contradicho',unknown:'sin confirmar'};
 return (product.decisionChecks||[]).map(check=>`${labels[check.name]||check.name} · ${status[check.choice]||check.choice}`).join(' / ');
}

const distanceLabel=p=>{const distance=listingDistance(state.center,p);return distance==null?'Distancia no indicada':`${distance.toLocaleString('es-ES',{maximumFractionDigits:1})} km`;};
function syncCounts(){$('#saved-count').textContent=favorites.size;$('#alert-count').textContent=alerts.filter(a=>a.enabled).length;}
function mergeProducts(items){for(const p of items)products.set(p.id,mergeListing(products.get(p.id),p));}
function renderRecent(){$('#recent-searches').innerHTML=recent.map(q=>`<button class="recent-item" data-query="${e(q)}">${icon('clock')}<span>${e(q)}</span></button>`).join('');$('#recent-searches').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(searching)return;$('#search-input').value=b.dataset.query;state.page='search';doSearch();});}
function getResults(){
 let data=state.page==='favorites'?[...favorites].map(id=>products.get(id)).filter(Boolean):aiResult??[...products.values()].filter(p=>dataset==='demo'?p.demo:dataset==='live'?p.provider==='wallapop':!p.demo&&p.provider!=='wallapop');
 if(state.page!=='favorites')data=data.filter(p=>{
  if(!p.available&&p.available!==undefined||p.reserved)return false;
  if(aiResult===null){if(dataset==='live'&&(!p.analyzed||p.accepted!==true))return false;const words=normalized(state.query).split(/\s+/).filter(Boolean);const text=normalized(p.title+' '+p.spec+' '+(p.keywords||''));if(!words.every(w=>text.includes(w)))return false;}
  return matchesFilters(p,state);
 });
 return [...data].sort((a,b)=>state.sort==='price-asc'?a.price-b.price:state.sort==='price-desc'?b.price-a.price:state.sort==='distance'?(listingDistance(state.center,a)??Infinity)-(listingDistance(state.center,b)??Infinity):(b.match??0)-(a.match??0)||a.price-b.price).slice(0,MAX_RESULTS);
}
function productCard(p){return `<article class="product-card" data-product-id="${p.id}"><div class="product-image" data-detail="${p.id}" role="button" tabindex="0" aria-label="Ver ${e(p.title)}"><img src="${e(imageFor(p))}" alt="${p.demo?'Ilustración':'Foto del anuncio'}: ${e(p.title)}" loading="lazy"><span class="product-badge">${e(p.badge||'Anuncio real')}</span><span class="source-chip">${e(p.source)}</span></div><button class="save-button ${favorites.has(p.id)?'saved':''}" data-save="${p.id}" aria-label="${favorites.has(p.id)?'Quitar de':'Añadir a'} guardados: ${e(p.title)}" aria-pressed="${favorites.has(p.id)}">${icon('heart')}</button><div class="product-content"><button class="product-title-button" data-detail="${p.id}"><h3 class="product-title">${e(p.title)}</h3></button><p class="product-spec">${e(p.spec||p.condition)}</p><div class="price-line"><span class="price">${money(p)}</span>${p.previous?`<del>${p.previous} €</del><span class="price-saving">−${Math.round((1-p.price/p.previous)*100)} %</span>`:''}</div><span class="condition-chip"><i></i>${e(p.condition)}</span><div class="product-meta"><span class="product-location">${icon('pin')}${e(p.city)}<span>· ${distanceLabel(p)}</span></span><span class="match-percent">${icon('check-shield')}${affinity(p)}</span></div></div></article>`;}
function bindProducts(root){root.querySelectorAll('[data-detail]').forEach(b=>{b.onclick=()=>openProduct(Number(b.dataset.detail));if(b.getAttribute('role')==='button')b.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();b.click();}};});root.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>toggleFavorite(Number(b.dataset.save)));bindImages(root);}
function toggleFavorite(id){favorites.has(id)?favorites.delete(id):favorites.add(id);save('cerca-favorites',[...favorites]);syncCounts();render();toast(favorites.has(id)?'Producto añadido a guardados':'Producto eliminado de guardados');}
function quantity(value,singular,plural){return `${value.toLocaleString('es-ES')} ${value===1?singular:plural}`;}
function renderSearchSummary(){
 const summary=$('#match-summary'),r=searchReport;
 const target=r?.targetResults??matchTarget;
 let title=dataset==='live'?'Buscar en Wallapop':'Buscar en el catálogo';
 let description=`El objetivo es encontrar ${quantity(target,'coincidencia','coincidencias')}.`;
 const counts=r?[
  quantity(r.total,'anuncio recibido','anuncios recibidos'),
  quantity(r.evaluated,'evaluado','evaluados'),
  ...(r.source?[quantity(r.source.pages,'página','páginas')]:[]),
 ]:[];
 if(searching){
  title=cancelPending?'Cancelando la búsqueda…':`${r?.items.length??0} de ${target} coincidencias`;
  description=[...counts,progress].filter(Boolean).join(' · ');
 }else if(r||searchCancelled||searchError){
  if(searchCancelled)title='Búsqueda cancelada';
  else if(searchError)title='Búsqueda interrumpida';
  else if(r.stopReason==='target')title='Objetivo alcanzado';
  else if(r.stopReason==='exhausted')title=dataset==='live'?'Wallapop ha devuelto su última página':'Fin del catálogo';
  else if(r.stopReason==='source_limit')title=r.sourceError?'Wallapop ha detenido la consulta':'Wallapop ha repetido la página';
  else if(r.stopReason==='candidateLimit')title='Límite de revisión alcanzado';
  else title='Búsqueda finalizada';
  description=[r?`${r.items.length} de ${target} coincidencias`:null,...counts,r?.detailErrorCount?quantity(r.detailErrorCount,'ficha sin verificar','fichas sin verificar'):null,searchError||r?.sourceError?.message].filter(Boolean).join(' · ');
 }
 summary.classList.toggle('is-searching',searching);
 summary.classList.toggle('has-report',Boolean(r||searchCancelled));
 summary.classList.toggle('has-error',Boolean(searchError||r?.stopReason==='source_limit'));
 const heading=summary.querySelector('strong');
 if(heading.textContent!==title)heading.textContent=title;
 summary.querySelector('p').textContent=description;
 $('.summary-tag').textContent=r?'Ver selección':'Cómo funciona';
}
function render(){
 const isAlerts=state.page==='alerts',isFav=state.page==='favorites',isMap=state.page==='map';
 if(!isMap)destroyMap();
 $('.content').classList.toggle('map-mode',isMap);
 document.querySelectorAll('.nav-item').forEach(b=>{const active=b.dataset.page===state.page;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
 $('#breadcrumb-current').textContent={search:'Explorar',map:'Mapa',favorites:'Guardados',alerts:'Mis alertas'}[state.page];
 $('#page-title').textContent=isAlerts?'Las oportunidades te encuentran.':isFav?'Vale la pena volver a ellos.':isMap?'Tu próximo hallazgo, cerca.':'Lo que buscas, al mejor precio.';
 $('#intro-kicker').textContent=isAlerts?'Siempre un paso por delante.':isFav?'Tus favoritos, en un solo lugar.':isMap?'Un buen precio también está cerca.':'Menos ruido. Mejores hallazgos.';
 $('#page-description').textContent=isAlerts?'Búsquedas automáticas y avisos de nuevas coincidencias.':isFav?'Los anuncios que has guardado para decidir con calma.':isMap?'Explora anuncios reales, elige una zona y compara oportunidades.':'Encuentra ese producto. Quédate con la oportunidad.';
 $('.search-panel').hidden=isAlerts||isFav;$('.filter-bar').hidden=isAlerts||isFav;$('#match-summary').hidden=isAlerts||isFav;$('.result-tools').hidden=isAlerts;
 renderSearchSummary();
 $('#search-input').disabled=searching||modelsInstalling;$('#search-form button[type="submit"]').disabled=searching||modelsInstalling;$('#cancel-search').hidden=!searching;$('#cancel-search').disabled=cancelPending;
 $('.search-context>span:nth-child(2)').textContent=dataset==='demo'?'IA real sobre anuncios de ejemplo.':dataset==='live'?'Anuncios de Wallapop · Selección con IA local.':'IA local sobre tu catálogo importado.';
 $('#dataset-switch').value=dataset;$('#dataset-switch').disabled=searching;
 $('.demo-indicator').innerHTML=`<i></i>${searching?'Buscando y analizando':modelHealth?.ready?'IA local lista':'Revisar modelos'}`;
 $('.content-footer>span:first-child').innerHTML=`${icon('shield')}La inteligencia artificial se ejecuta en tu equipo.`;
 $('.content-footer>span:last-child').textContent=dataset==='demo'?'Anuncios de ejemplo':dataset==='live'?'Búsqueda pública · Ubicaciones publicadas por Wallapop':'Anuncios importados';
 $('#results-title').textContent=isAlerts?'Tus alertas':isFav?'Productos guardados':isMap?'Productos en la zona':'Tus resultados';
 $('#price-label').textContent=state.minPrice>0?(Number.isFinite(state.maxPrice)?`${state.minPrice}–${state.maxPrice} €`:`Desde ${state.minPrice} €`):(Number.isFinite(state.maxPrice)?`Hasta ${state.maxPrice} €`:'Sin límite');$('#condition-label').textContent=state.condition;$('#location-label').textContent=state.zone==='Todas las zonas'?'Todas las zonas':`${state.center.label}, ${state.radius} km`;
 $('#grid-view').classList.toggle('active',!isMap);$('#map-view').classList.toggle('active',isMap);
 if(isAlerts){renderAlerts();return;}
 const data=getResults();$('#results-count').textContent=quantity(data.length,'producto','productos');
 if(searching&&!isFav&&!isMap&&!data.length){$('#results').innerHTML=`<div class="empty-state search-running"><span class="search-loader"></span><h3>Esperando la primera coincidencia</h3><p>Cada producto aparecerá en cuanto se verifique.</p></div>`;return;}
 if((searchError||searchCancelled||searchReport?.stopReason==='source_limit')&&!isFav&&!isMap&&!data.length){$('#results').innerHTML=`<div class="empty-state">${icon('info')}<h3>Sin coincidencias verificadas</h3><button id="retry-search" class="secondary-button">Volver a buscar</button></div>`;$('#retry-search').onclick=()=>doSearch();return;}
 if(isMap){renderRealMap($('#results'),data,{center:state.center,radius:state.radius,busy:searching,allZones:state.zone==='Todas las zonas',key:`${state.query}:${state.center.latitude}:${state.center.longitude}:${dataset}`,escapeHTML:e,icon,imageFor,onDetail:openProduct,onCenter:setCenter,onSearch:center=>{setCenter(center,false);doSearch();},geocode:async query=>unwrap(await desktop.geocode(query)),openMapInfo:kind=>desktop.mapInfo(kind).then(unwrap).catch(error=>toast(error.message))});bindImages($('#results'));return;}
 if(!data.length){$('#results').innerHTML=`<div class="empty-state">${icon(isFav?'heart':'search')}<h3>${isFav?'Tu próxima selección empieza aquí':aiResult===null?'Tu próximo hallazgo empieza aquí':'No hay coincidencias con estos filtros'}</h3><p>${isFav?'Pulsa el corazón de un anuncio para guardarlo.':aiResult===null?'Introduce un producto y pulsa Buscar para consultar anuncios reales y dejar que tus modelos locales hagan la selección.':'Prueba a ampliar el precio o el radio de búsqueda. Los productos que no encajan se descartan.'}</p><button class="primary-button" id="empty-action">${isFav?'Explorar productos':'Buscar productos'}</button></div>`;$('#empty-action').onclick=()=>{if(isFav){state.page='search';render();}else doSearch();};return;}
 renderGrid(data);
}
function renderGrid(data){
 let grid=$('#results .product-grid');if(!grid){$('#results').innerHTML='<div class="product-grid"></div>';grid=$('#results .product-grid');}
 const existing=new Map([...grid.children].map(node=>[Number(node.dataset.productId),node]));let cursor=grid.firstElementChild;
 for(const product of data){
  const signature=JSON.stringify([product.title,imageFor(product),product.price,product.condition,product.spec,product.badge,product.source,product.match,product.analyzed,product.city,distanceLabel(product),favorites.has(product.id)]);
  let node=existing.get(product.id);existing.delete(product.id);
  if(!node||node.cercaSignature!==signature){const template=document.createElement('template');template.innerHTML=productCard(product);const fresh=template.content.firstElementChild;fresh.cercaSignature=signature;if(node){if(cursor===node)cursor=fresh;node.replaceWith(fresh);}node=fresh;bindProducts(node);}
  if(node!==cursor)grid.insertBefore(node,cursor);cursor=node.nextElementSibling;
 }
 for(const node of existing.values())node.remove();
}
function updateProgress(message){if(!searching||cancelPending)return;progress=message;renderSearchSummary();}
function receiveSearchUpdate(update){
 if(!searching||update.searchId!==activeSearchId)return;
 if(update.type==='started')searchReport=update.report;
 if(update.type==='catalog'&&searchReport){searchReport.total=update.total;searchReport.eligible=update.eligible;if(update.source)searchReport.source=update.source;}
 if(update.type==='decision'){
  if(update.item.accepted||products.has(update.item.id))mergeProducts([update.item]);
  const list=update.item.accepted?searchReport.items:searchReport.rejected;
  list.push(update.item);
  if(!update.item.accepted&&list.length>MAX_RESULTS)list.shift();
  searchReport.rejectedCount=update.rejectedCount;
  searchReport.evaluated=update.evaluated;searchReport.retries=update.retries;searchReport.durationMs=update.durationMs;
  if(update.item.accepted)aiResult.push(update.item);
 }
 if(update.type==='decision'&&update.item.accepted)render();
 else renderSearchSummary();
}
function doSearch(){window.cercaLastSearch=performSearch();return window.cercaLastSearch;}
async function performSearch(){
 if(searching)return;
 if(modelsInstalling){toast('Espera a que termine la configuración de los modelos.');return;}
 const query=$('#search-input').value.trim();if(!query){toast('Introduce el producto que buscas.');return;}
 activeSearchId=crypto.randomUUID();state.query=query;state.page=state.page==='map'?'map':'search';searching=true;cancelPending=false;searchCancelled=false;searchError=null;searchReport=null;aiResult=[];progress='Interpretando tu búsqueda…';
 recent=[query,...recent.filter(q=>q!==query)].slice(0,5);save('cerca-recent',recent);renderRecent();render();
 try{const report=unwrap(await desktop.search({searchId:activeSearchId,query,constraints:{minPrice:state.minPrice,maxPrice:Number.isFinite(state.maxPrice)?state.maxPrice:null,condition:state.condition,radius:state.radius,zone:state.zone,center:state.center,source:state.source}}));searchReport=report;aiResult=report.items.slice(0,MAX_RESULTS);if(report.catalogItems)mergeProducts(report.catalogItems.filter(p=>p.accepted||favorites.has(p.id)||products.has(p.id)));mergeProducts(report.items);return report;}
 catch(error){if(cancelPending&&error.message==='Búsqueda cancelada.')searchCancelled=true;else searchError=error.message;}
 finally{searching=false;cancelPending=false;activeSearchId=null;render();}
}
async function cancelSearch(){
 if(!searching||cancelPending)return;
 const searchId=activeSearchId;
 cancelPending=true;$('#cancel-search').disabled=true;renderSearchSummary();
 try{unwrap(await desktop.cancelSearch());}
 catch(error){if(searchId!==activeSearchId)return;cancelPending=false;$('#cancel-search').disabled=false;renderSearchSummary();toast(error.message);}
}
async function switchDataset(value){if(searching)return;try{await pref('cerca-dataset',value);dataset=value;aiResult=null;searchReport=null;searchCancelled=false;searchError=null;render();}catch(error){toast(error.message);}}
function setCenter(center,rerender=true){if(searching)return;state.center={latitude:center.latitude,longitude:center.longitude,label:String(center.label||'Zona del mapa').slice(0,150)};state.zone=state.center.label;save('cerca-center',state.center);if(rerender)render();}
function changedFilters(){modal.close();render();if(searchReport)toast('Filtro aplicado. Pulsa Buscar para renovar los anuncios.');}
const modal=$('#modal');
function openModal(title,body){$('#modal-content').innerHTML=`<div class="modal-header"><h2>${e(title)}</h2><button id="close-modal" class="icon-button" aria-label="Cerrar">${icon('close')}</button></div><div class="modal-body">${body}</div>`;$('#close-modal').onclick=()=>modal.close();if(!modal.open)modal.showModal();}
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});
modal.addEventListener('close',()=>detailToken++);
function openPrice(){
 openModal('El precio que tienes en mente',`<p>Define un precio mínimo y máximo. Los filtros se aplican a los anuncios y al mapa.</p><form id="price-form"><div class="field-row"><label class="form-field">Precio mínimo (€)<input name="min" type="number" min="0" max="100000000" step="0.01" value="${state.minPrice||''}" placeholder="0"></label><label class="form-field">Precio máximo (€)<input name="max" type="number" min="0" max="100000000" step="0.01" value="${Number.isFinite(state.maxPrice)?state.maxPrice:''}" placeholder="Sin límite"></label></div><p id="price-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" id="unlimited" class="secondary-button">Quitar límites</button><button class="primary-button">Aplicar filtro</button></div></form>`);
 $('#unlimited').onclick=()=>{state.minPrice=0;state.maxPrice=Infinity;changedFilters();};
 $('#price-form').onsubmit=event=>{event.preventDefault();const f=new FormData(event.currentTarget);try{const range=priceRange({minPrice:Number(f.get('min')||0),maxPrice:f.get('max')===''?Infinity:Number(f.get('max'))});Object.assign(state,range);changedFilters();}catch(error){$('#price-error').hidden=false;$('#price-error').textContent=error.message;}};
}

function openCondition(){openModal('¿En qué estado lo buscas?',`<form id="condition-form"><label class="form-field">Estado<select name="condition">${['Cualquiera','Nuevo','Como nuevo','Buen estado','Aceptable','Para piezas'].map(c=>`<option ${c===state.condition?'selected':''}>${c}</option>`).join('')}</select></label><div class="modal-actions"><button class="primary-button">Aplicar filtro</button></div></form>`);$('#condition-form').onsubmit=event=>{event.preventDefault();state.condition=new FormData(event.currentTarget).get('condition');changedFilters();};}
function openLocation(){
 let chosen={...state.center};
 openModal('Elige tu zona de búsqueda',`<p>Busca una localidad o introduce coordenadas. También puedes elegir el centro haciendo clic en el mapa.</p><form id="place-form" class="real-map-toolbar"><input id="place-query" placeholder="Localidad o código postal" aria-label="Buscar localidad" maxlength="120" required><button class="secondary-button">Buscar localidad</button></form><div id="place-options" class="map-place-results" hidden></div><form id="location-form"><p id="chosen-place" class="provider-note">Centro: ${e(chosen.label)}</p><div class="map-center-fields"><label class="form-field">Latitud<input name="latitude" type="number" min="-90" max="90" step="any" value="${chosen.latitude}" required></label><label class="form-field">Longitud<input name="longitude" type="number" min="-180" max="180" step="any" value="${chosen.longitude}" required></label></div><label class="form-field">Radio máximo (km)<input name="radius" type="number" min="1" max="500" value="${state.radius}" required></label><label class="checkbox-row"><input type="checkbox" name="all" ${state.zone==='Todas las zonas'?'checked':''}> Buscar sin límite de distancia</label><div class="modal-actions"><button class="primary-button">Aplicar ubicación</button></div></form><p class="settings-note">Distancias en línea recta desde el centro seleccionado. Localidades: Open-Meteo / GeoNames.</p>`);
 $('#place-form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button'),box=$('#place-options');button.disabled=true;box.hidden=false;box.textContent='Buscando…';try{const places=unwrap(await desktop.geocode($('#place-query').value));box.innerHTML=places.length?places.map((p,i)=>`<button type="button" class="place-option" data-place="${i}"><strong>${e(p.label)}</strong><span>${e(p.description)}</span></button>`).join(''):'No se ha encontrado la localidad.';box.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>{chosen=places[Number(b.dataset.place)];$('#location-form input[name="latitude"]').value=chosen.latitude;$('#location-form input[name="longitude"]').value=chosen.longitude;$('#chosen-place').textContent='Centro: '+chosen.label;box.hidden=true;});}catch(error){box.textContent=error.message;}finally{button.disabled=false;}};
 $('#location-form').onsubmit=event=>{event.preventDefault();const f=new FormData(event.currentTarget);const latitude=Number(f.get('latitude')),longitude=Number(f.get('longitude'));const label=latitude===chosen.latitude&&longitude===chosen.longitude?chosen.label:'Centro seleccionado';setCenter({latitude,longitude,label},false);state.radius=Number(f.get('radius'));state.zone=f.has('all')?'Todas las zonas':label;changedFilters();};
}
function renderAlerts(){$('#results-count').textContent=`${alerts.length} configuradas`;$('#results').innerHTML=alerts.length?`<div class="alert-list">${alerts.map(a=>`<article class="alert-card"><div class="alert-symbol">${icon('bell')}</div><div class="alert-info"><h3>${e(a.query)}</h3><p>${a.minPrice>0?`${a.minPrice}–${a.price} €`:`Hasta ${a.price} €`} · ${e(a.condition)} · ${e(a.zone)} · ${a.radius} km · ${a.dataset==='imported'?'Catálogo importado':'Wallapop en directo'}</p></div><span class="alert-enabled">${a.enabled?'Activa':'En pausa'}</span><label class="switch"><input type="checkbox" data-alert-toggle="${a.id}" ${a.enabled?'checked':''} aria-label="Activar alerta ${e(a.query)}"><span></span></label><button class="icon-button" data-alert-delete="${a.id}" aria-label="Eliminar alerta ${e(a.query)}">${icon('trash')}</button></article>`).join('')}</div>`:`<div class="empty-state">${icon('bell')}<h3>Tu próxima oportunidad empieza con una alerta</h3><p>Guarda el producto, presupuesto y zona. Cerca buscará nuevos anuncios mientras esté abierta.</p><button id="first-alert" class="primary-button">Crear alerta</button></div>`;$('#first-alert')?.addEventListener('click',()=>openAlert());document.querySelectorAll('[data-alert-toggle]').forEach(b=>b.onchange=()=>{alerts.find(a=>a.id===Number(b.dataset.alertToggle)).enabled=b.checked;save('cerca-alerts',alerts);syncCounts();render();});document.querySelectorAll('[data-alert-delete]').forEach(b=>b.onclick=()=>{alerts=alerts.filter(a=>a.id!==Number(b.dataset.alertDelete));save('cerca-alerts',alerts);syncCounts();render();toast('Alerta eliminada');});}
function openAlert(query=state.query){openModal('Crea tu próxima oportunidad',`<p>Buscaremos anuncios nuevos con estas condiciones cada 15 minutos mientras Cerca esté abierta.</p><form id="alert-form"><label class="form-field">Producto<input name="query" value="${e(query)}" required maxlength="500"></label><div class="field-row"><label class="form-field">Precio mínimo (€)<input name="minPrice" type="number" min="0" max="100000000" step="0.01" value="${state.minPrice||''}" placeholder="0"></label><label class="form-field">Precio máximo (€)<input name="price" type="number" min="0" max="100000000" step="0.01" value="${Number.isFinite(state.maxPrice)?state.maxPrice:900}" required></label></div><label class="form-field">Estado<select name="condition">${['Cualquiera','Nuevo','Como nuevo','Buen estado','Aceptable','Para piezas'].map(c=>`<option ${c===state.condition?'selected':''}>${c}</option>`).join('')}</select></label><div class="field-row"><label class="form-field">Fuente<select name="dataset"><option value="live">Wallapop en directo</option><option value="imported" ${dataset==='imported'?'selected':''}>Catálogo importado</option></select></label><label class="form-field">Radio (km)<input name="radius" type="number" min="1" max="500" value="${state.radius}" required></label></div><p class="provider-note">Zona: ${e(state.zone==='Todas las zonas'?state.zone:state.center.label)}. Usa el filtro de ubicación o el mapa para cambiarla antes de crear la alerta.</p><div class="privacy-note">${icon('bell')}Los avisos incluyen nuevos anuncios y nuevas bajadas de precio. No se repite un aviso del mismo producto al mismo precio.</div><div class="modal-actions"><button type="button" id="cancel-alert" class="secondary-button">Cancelar</button><button class="primary-button">Guardar alerta</button></div></form>`);$('#cancel-alert').onclick=()=>modal.close();$('#alert-form').onsubmit=async event=>{event.preventDefault();const f=new FormData(event.currentTarget),query=f.get('query').trim();if(!query)return;const next=[{id:Date.now(),query,minPrice:Number(f.get('minPrice')||0),price:Number(f.get('price')),condition:f.get('condition'),zone:state.zone,center:{...state.center},radius:Number(f.get('radius')),dataset:f.get('dataset'),enabled:true},...alerts];try{await pref('cerca-alerts',next);alerts=next;syncCounts();modal.close();if(state.page==='alerts')render();toast('Alerta guardada. Se comprobará cada 15 minutos.');}catch(error){toast(error.message);}};}
async function openProduct(id){
 let p=products.get(id);if(!p)return;
 const token=++detailToken;
 if(p.provider==='wallapop'){
  openModal(p.title,'<p>Leyendo la ficha pública del anuncio…</p>');
  try{const updated=unwrap(await desktop.detail(id,{center:state.center}));if(token!==detailToken||!modal.open)return;p=mergeListing(p,updated);mergeProducts([p]);if(aiResult)aiResult=aiResult.filter(item=>item.id!==p.id||p.analyzed&&p.accepted).map(item=>item.id===p.id?p:item);render();}
  catch(error){if(token!==detailToken||!modal.open)return;openModal(p.title,`<p>${e(error.message)}</p><div class="modal-actions"><button id="detail-original" class="primary-button">Abrir anuncio original</button></div>`);$('#detail-original').onclick=()=>desktop.openListing(id).then(unwrap).catch(err=>toast(err.message));return;}
 }
 renderProductDetail(p);
}
function renderProductDetail(p){
 const images=p.images?.length?p.images:[imageFor(p)];
 const dates=[{name:'Categoría',value:p.categories?.join(' › ')},{name:'Publicado',value:p.createdAt?new Date(p.createdAt).toLocaleDateString('es-ES'):null},{name:'Visualizaciones',value:p.views!==null&&p.views!==undefined?String(p.views):null},{name:'Favoritos',value:p.favoritesCount!==null&&p.favoritesCount!==undefined?String(p.favoritesCount):null},{name:'Actualizado',value:p.modifiedAt?new Date(p.modifiedAt).toLocaleDateString('es-ES'):null},{name:'Envío',value:p.shipping?'Disponible':'No indicado / entrega en mano'},{name:'Ubicación',value:p.locationApproximate?'Aproximada según la fuente':'Publicada por la fuente'},...(p.attributes||[])].filter(a=>a.value);
 openModal(p.title,`<div class="detail-gallery"><img id="gallery-main" class="detail-image" src="${e(images[0])}" alt="${e(p.title)}"><div class="gallery-controls"><button id="gallery-prev" aria-label="Foto anterior">‹</button><span id="gallery-count">1 / ${images.length}</span><button id="gallery-next" aria-label="Foto siguiente">›</button></div>${images.length>1?`<div class="gallery-thumbs">${images.map((url,index)=>`<button data-photo="${index}" class="${index===0?'active':''}" aria-label="Ver foto ${index+1}"><img src="${e(url)}" alt="" loading="lazy"></button>`).join('')}</div>`:''}</div><span class="match-percent">${icon('check-shield')}${affinity(p)}</span><div class="detail-price">${money(p)}</div><div class="detail-specs"><span>${e(p.condition)}</span><span>${e(p.city)} · ${distanceLabel(p)}</span><span>${p.available===false?'No disponible':p.reserved?'Reservado':'Disponible según la última consulta'}</span></div>${p.reason?`<div class="decision-reason"><strong>Decisión de la búsqueda</strong><p>${e(p.reason)}</p>${p.decisionChecks?.length?`<small>${e(decisionSummary(p))}</small>`:''}</div>`:''}<p class="detail-description">${e(p.description||'El anuncio no incluye descripción.')}</p>${p.seller?`<div class="seller-section"><span class="avatar">${e(p.seller.name[0]||'V')}</span><div><strong>${e(p.seller.name)}${p.seller.verified?' · Verificado':''}</strong><p>${p.seller.rating!==null?`${p.seller.rating}/5 · `:''}${p.seller.reviews??0} valoraciones${p.seller.pro?' · Profesional':''}</p></div></div>`:''}<dl class="detail-attributes">${dates.map(a=>`<div><dt>${e(a.name)}</dt><dd>${e(a.value)}</dd></div>`).join('')}</dl><p class="provider-note">${p.demo?'Anuncio de ejemplo.':p.provider==='wallapop'?`Ficha pública consultada ${new Date(p.detailFetchedAt||p.fetchedAt).toLocaleString('es-ES')}. El precio y la disponibilidad pueden cambiar.`:'Anuncio importado. Comprueba la información en la fuente.'}</p><div class="modal-actions"><button id="detail-save" class="secondary-button">${icon('heart')}${favorites.has(p.id)?'Quitar de guardados':'Guardar'}</button><button id="detail-alert" class="secondary-button">Crear alerta</button>${p.url?'<button id="open-listing" class="primary-button">Ver anuncio real</button>':''}</div>`);
 let photo=0;function showPhoto(index){photo=(index+images.length)%images.length;$('#gallery-main').src=images[photo];$('#gallery-count').textContent=`${photo+1} / ${images.length}`;document.querySelectorAll('[data-photo]').forEach(b=>b.classList.toggle('active',Number(b.dataset.photo)===photo));}
 $('#gallery-prev').onclick=()=>showPhoto(photo-1);$('#gallery-next').onclick=()=>showPhoto(photo+1);document.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>showPhoto(Number(b.dataset.photo)));bindImages($('#modal-content'));
 $('#detail-save').onclick=()=>{toggleFavorite(p.id);renderProductDetail(p);};$('#detail-alert').onclick=()=>openAlert(p.title);if($('#open-listing'))$('#open-listing').onclick=()=>desktop.openListing(p.id).then(unwrap).catch(error=>toast(error.message));
}
function openNativeHelp(){openModal('Una búsqueda con criterio',`<p>Qwen3.5 fija los requisitos de la petición antes de leer los anuncios. Nimble evalúa cada candidato con esos mismos requisitos. Cerca consulta varias páginas de Wallapop, recupera candidatos con búsqueda léxica rápida y, si hace falta, Qwen3 Embedding, y lee sus fichas públicas. El modelo comprueba por separado el producto vendido, los requisitos explícitos y lo incluido en la oferta; la ficha muestra el motivo de la decisión.</p><p>Los anuncios se evalúan de uno en uno y cada coincidencia aparece en cuanto se valida. El objetivo inicial es de ${DEFAULT_MATCH_TARGET} coincidencias. Puedes subirlo a ${MAX_RESULTS} en Preferencias. La búsqueda también termina cuando se agotan los anuncios disponibles. Las decisiones inválidas se reintentan hasta obtener una válida o cancelar. La afinidad es una valoración del modelo y puede equivocarse. El precio, el estado y la distancia también se comprueban con filtros.</p><p>El mapa muestra las coordenadas publicadas por la fuente y un radio en línea recta. Puedes moverlo, buscar una localidad, elegir un centro y lanzar una búsqueda en esa zona.</p><div class="privacy-note">${icon('shield')}La inferencia se ejecuta en tu equipo. Las consultas de anuncios y cartografía necesitan Internet. Solo se utiliza información pública; los datos que la fuente no publique permanecen sin indicar.</div>`);}
function openAnalysis(){if(!searchReport)return;const r=searchReport;openModal('Así hemos hecho tu selección',`<p>Petición: <strong>${e(r.query||state.query)}</strong><br>${quantity(r.total,'anuncio recogido','anuncios recogidos')} · ${quantity(r.evaluated,'evaluado','evaluados')} · ${quantity(r.rejectedCount??0,'descartado','descartados')}${r.notEvaluated?` · ${r.notEvaluated} sin evaluar`:''}${r.source?` · ${quantity(r.source.pages,'página consultada','páginas consultadas')}`:''} · ${Math.round(r.durationMs/1000)} s.</p>${r.intent?.requirements?.length?`<p>Requisitos interpretados</p><ul>${r.intent.requirements.map(row=>`<li>${e(row.requirement)}</li>`).join('')}</ul>`:''}<div class="analysis-queries">${r.plan.queries.map(q=>`<span>${e(q)}</span>`).join('')}</div>${r.detailErrorCount?`<p>${r.detailErrorCount} fichas no se pudieron verificar y se han excluido de la selección.</p>`:''}${r.rejectedCount>r.rejected.length?`<p>Se muestran los últimos ${r.rejected.length} descartes de ${r.rejectedCount} en total.</p>`:''}<div class="analysis-results">${[...r.items.map(p=>({...p,accepted:true})),...r.rejected].map(p=>`<div class="analysis-row"><span class="analysis-mark ${p.accepted?'accepted':''}">${icon(p.accepted?'check':'close')}</span><div><strong>${e(p.title)}</strong><p>${e(p.reason)}</p>${p.decisionChecks?.length?`<p>${e(decisionSummary(p))}</p>`:''}<small>${p.match}/100 de afinidad · ${money(p)}</small></div></div>`).join('')}</div>`);}
function renderModelHealth(){if(!modelHealth?.connected)return `<p class="settings-note">${e(modelHealth?.error||'Ollama no está disponible. Inicia el servicio local y vuelve a comprobar.')}</p>`;return modelHealth.models.map(m=>`<div class="model-row"><span class="model-indicator ${m.installed?'ready':''}"></span><div><strong>${e(modelLabels[m.role]||m.name)}</strong><small>${{planner:'Interpreta búsquedas',decision:'Evalúa anuncios',embedding:'Encuentra candidatos'}[m.role]}</small></div><span>${m.installed?'Instalado':'No disponible'}</span></div>`).join('');}
async function refreshModelHealth(){try{modelHealth=unwrap(await desktop.health());}catch(error){modelHealth={ready:false,error:error.message};}$('.local-status div>span').textContent=modelHealth.ready?'Qwen3.5 + Nimble · Requisitos fijados':modelHealth.connected?'Configura los modelos locales':'Abre Ollama para empezar';render();return modelHealth;}
function openDesktopSettings(){openModal('Preferencias de Cerca',`<p>Cerca ${e(appInfo.version||'')} · Aplicación de escritorio · Inteligencia artificial local.</p><div class="setting-row"><div><strong>Apariencia</strong><p>Elige el ambiente de tu espacio.</p></div><select id="native-theme" aria-label="Apariencia"><option value="dark" ${theme==='dark'?'selected':''}>Modo oscuro</option><option value="light" ${theme==='light'?'selected':''}>Modo claro</option></select></div><div class="setting-row"><strong>Modelos locales</strong><button class="text-button" id="refresh-models">Comprobar conexión</button></div><div id="model-details">${renderModelHealth()}</div><div class="settings-actions"><button id="configure-models" class="secondary-button">Configurar IA local</button><button id="download-releases" class="text-button">Descargas y versiones</button></div><div class="setting-row"><div><strong>Fuente de anuncios</strong><p>Wallapop, catálogo propio o ejemplos.</p></div><select id="dataset-select" aria-label="Catálogo activo" ${searching?'disabled':''}><option value="live" ${dataset==='live'?'selected':''}>Wallapop en directo</option><option value="imported" ${dataset==='imported'?'selected':''}>Importado</option><option value="demo" ${dataset==='demo'?'selected':''}>De ejemplo</option></select></div><div class="setting-row"><div><strong>Objetivo de coincidencias</strong><p>Cada búsqueda continúa hasta alcanzar el objetivo o agotar los anuncios disponibles.</p></div><select id="match-target" aria-label="Objetivo de coincidencias" ${searching?'disabled':''}>${MATCH_TARGETS.map(target=>`<option value="${target}" ${target===matchTarget?'selected':''}>${target} productos</option>`).join('')}</select></div><div class="settings-actions"><button id="import-catalog" class="secondary-button" ${searching?'disabled':''}>Importar anuncios JSON</button><button id="open-real-search" class="secondary-button">Abrir Wallapop</button></div><p class="settings-note">La búsqueda en directo consulta el flujo público de Wallapop y las fichas de los candidatos. Las consultas tienen límites, caché y cancelación. Una limitación o bloqueo se muestra como error, sin reemplazar los resultados por ejemplos.</p><div class="setting-row"><div><strong>Alertas de escritorio</strong><p>Consultan anuncios nuevos cada 15 minutos, con Cerca abierta.</p></div></div><div class="settings-actions"><button id="check-alerts" class="secondary-button">Comprobar ahora</button><button id="test-notification" class="secondary-button">Probar notificación</button></div><p class="settings-note">Mapa: OpenStreetMap, con atribución y caché HTTP local. Localidades: Open-Meteo / GeoNames, uso personal no comercial. La ubicación de vendedores es la publicada por la fuente y puede ser aproximada.</p>`);
 $('#match-target').onchange=async event=>{
  const select=event.currentTarget,target=Number(select.value);
  select.disabled=true;
  try{await pref('cerca-target',target);matchTarget=target;renderSearchSummary();}
  catch(error){select.value=String(matchTarget);toast(error.message);}
  finally{select.disabled=searching;}
 };
 $('#native-theme').onchange=event=>setTheme(event.target.value);$('#dataset-select').onchange=event=>switchDataset(event.target.value);
 $('#configure-models').onclick=openModelSetup;$('#download-releases').onclick=()=>desktop.openSupport('releases').then(unwrap).catch(error=>toast(error.message));
 $('#refresh-models').onclick=async()=>{const b=$('#refresh-models');b.disabled=true;await refreshModelHealth();$('#model-details').innerHTML=renderModelHealth();b.disabled=false;};
 $('#import-catalog').onclick=async()=>{try{const r=unwrap(await desktop.importCatalog());if(!r)return;mergeProducts(r.products);dataset='imported';aiResult=null;searchReport=null;searchCancelled=false;searchError=null;state.zone='Todas las zonas';modal.close();render();toast(`${r.count} anuncios importados. Pulsa Buscar para analizarlos.`);}catch(error){toast(error.message);}};
 $('#open-real-search').onclick=()=>desktop.openSearch(searchReport?.plan.product||state.query).then(unwrap).catch(error=>toast(error.message));
 $('#test-notification').onclick=()=>desktop.testNotification().then(unwrap).then(()=>toast('Notificación enviada al escritorio')).catch(error=>toast(error.message));
 $('#check-alerts').onclick=async()=>{const b=$('#check-alerts');b.disabled=true;b.textContent='Buscando coincidencias…';try{const r=unwrap(await desktop.checkAlerts());toast(r.sourceError?`Comprobación interrumpida · ${r.count} coincidencias notificadas. ${r.sourceError.message}`:r.count?`${r.count} coincidencias notificadas`:'No hay nuevas coincidencias para tus alertas.');}catch(error){toast(error.message);}finally{b.disabled=false;b.textContent='Comprobar ahora';}};
}
function renderModelProgress(){
 const status=$('#model-setup-status'),progress=$('#model-download-progress');
 if(!status||!progress)return;
 const p=modelProgress;
 status.textContent=modelsInstalling?(p?`${modelLabels[p.role]||p.name} · ${p.status}`:'Conectando con Ollama…'):modelHealth?.ready?'Todos los modelos están listos.':modelHealth?.error||'Instala y abre Ollama; después descarga los modelos.';
 progress.hidden=!modelsInstalling;
 if(p?.total>0){progress.max=p.total;progress.value=Math.min(p.completed,p.total);}else progress.removeAttribute('value');
 $('#install-local-models').disabled=modelsInstalling||searching;
 $('#cancel-local-models').hidden=!modelsInstalling;
}
function openModelSetup(){
 openModal('Prepara tu inteligencia artificial local',`<p>1. Instala o actualiza <strong>Ollama</strong> desde su web oficial y déjalo abierto.</p><div class="settings-actions"><button id="get-ollama" class="secondary-button">Descargar Ollama</button><button id="check-ollama" class="text-button">Comprobar conexión</button></div><p>2. Descarga los modelos gratuitos de Cerca. Se necesitan aproximadamente <strong>13 GB de disco</strong>. Se recomienda disponer de 24–32 GB de RAM; una GPU compatible acelera las decisiones.</p><p>Se instalarán Qwen3.5 9B, Nimble 9B y Qwen3 Embedding 0.6B. La descarga se realiza con Ollama y los modelos se ejecutan en tu equipo. Puedes cancelar y reanudar más tarde.</p><p id="model-setup-status" class="provider-note" role="status"></p><progress id="model-download-progress" style="width:100%" hidden aria-label="Progreso de descarga de modelos"></progress><div class="modal-actions"><button id="cancel-local-models" class="secondary-button" hidden>Cancelar descarga</button><button id="install-local-models" class="primary-button">Descargar modelos</button></div>`);
 $('#get-ollama').onclick=()=>desktop.openSupport('ollama').then(unwrap).catch(error=>toast(error.message));
 $('#check-ollama').onclick=async()=>{await refreshModelHealth();renderModelProgress();};
 $('#cancel-local-models').onclick=()=>desktop.cancelModels().then(unwrap).catch(error=>toast(error.message));
 $('#install-local-models').onclick=async()=>{
  if(modelsInstalling||searching)return;
  modelsInstalling=true;modelProgress=null;render();renderModelProgress();
  let failure;
  try{modelHealth=unwrap(await desktop.installModels());toast('Los modelos locales están listos.');}
  catch(error){failure=error.message;toast(error.message);}
  finally{modelsInstalling=false;await refreshModelHealth();renderModelProgress();if(failure&&$('#model-setup-status'))$('#model-setup-status').textContent=failure;}
 };
 renderModelProgress();
}

async function initializeDesktop(){
 if(!desktop){$('#results').innerHTML='<div class="empty-state"><h3>Abre Cerca como aplicación de escritorio</h3><p>Ejecuta npm start o busca Cerca en el menú de aplicaciones.</p></div>';return;}
 try{
  document.body.classList.add('native-desktop');const controls=$('.window-controls');controls.removeAttribute('aria-hidden');controls.innerHTML='<button data-action="close" aria-label="Cerrar ventana"></button><button data-action="minimize" aria-label="Minimizar ventana"></button><button data-action="maximize" aria-label="Maximizar ventana"></button>';controls.querySelectorAll('button').forEach(b=>b.onclick=()=>desktop.windowAction(b.dataset.action));
  const initial=unwrap(await desktop.bootstrap()),preferences=initial.preferences;appInfo=initial.appInfo||{};modelLabels=initial.modelLabels||modelLabels;mergeProducts(initial.products);favorites=new Set(preferences['cerca-favorites']||[]);alerts=preferences['cerca-alerts']||[];recent=preferences['cerca-recent']||recent;dataset=preferences['cerca-dataset']||'live';matchTarget=preferences['cerca-target']??DEFAULT_MATCH_TARGET;state.center=preferences['cerca-center']||{...DEFAULT_CENTER};state.zone=state.center.label;
  $('.local-status strong').textContent='Inteligencia artificial local';$('.local-status div>span').textContent='Conectando con Ollama…';
  const source=document.createElement('label');source.className='live-dataset-select';source.innerHTML='<select id="dataset-switch" aria-label="Fuente de búsqueda"><option value="live">Wallapop en directo</option><option value="imported">Catálogo importado</option><option value="demo">De ejemplo</option></select>';$('.search-context').append(source);$('#dataset-switch').onchange=event=>switchDataset(event.target.value);
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render();});$('#search-form').onsubmit=event=>{event.preventDefault();doSearch();};$('#sort-select').value=state.sort;$('#sort-select').onchange=event=>{state.sort=event.target.value;render();};
  $('#theme-toggle').onclick=()=>setTheme(theme==='dark'?'light':'dark');$('#create-alert').onclick=()=>openAlert();$('#settings-button').onclick=openDesktopSettings;$('#profile-button').onclick=openDesktopSettings;$('#price-filter').onclick=()=>{if(!searching)openPrice();};$('#condition-filter').onclick=()=>{if(!searching)openCondition();};$('#location-filter').onclick=()=>{if(!searching)openLocation();};
  $('#more-filters').onclick=()=>{if(searching)return;openModal('Fuentes de búsqueda',`<p>La consulta automática disponible es Wallapop. En Preferencias puedes elegir cuántas coincidencias buscar o importar tu propio catálogo.</p><button id="source-preferences" class="primary-button">Abrir preferencias</button>`);$('#source-preferences').onclick=openDesktopSettings;};
  $('#reset-filters').onclick=()=>{if(searching)return;state.minPrice=0;state.maxPrice=Infinity;state.condition='Cualquiera';state.radius=50;state.zone=state.center.label;state.source='Todos';state.sort='price-asc';$('#sort-select').value=state.sort;render();toast('Filtros restablecidos');};
  $('#grid-view').onclick=()=>{state.page=state.page==='favorites'?'favorites':'search';render();};$('#map-view').onclick=()=>{state.page='map';render();};$('#notifications-button').onclick=()=>{state.page='alerts';render();};$('.brand').onclick=event=>{event.preventDefault();state.page='search';render();};$('#clear-recent').onclick=()=>{recent=[];save('cerca-recent',recent);renderRecent();toast('Búsquedas recientes borradas');};$('#search-help').onclick=openNativeHelp;$('.summary-tag').onclick=()=>searchReport?openAnalysis():openNativeHelp();$('#cancel-search').onclick=cancelSearch;desktop.onProgress(updateProgress);desktop.onSearchUpdate(receiveSearchUpdate);
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(modal.open)modal.close();if(['alerts','favorites'].includes(state.page)){state.page='search';render();}$('#search-input').focus();$('#search-input').select();}});
  setTheme(preferences['cerca-theme']||'dark');renderRecent();syncCounts();render();desktop.onModelProgress(update=>{modelProgress=update;renderModelProgress();});await refreshModelHealth();if(appInfo.packaged&&!appInfo.testing&&!modelHealth?.ready)openModelSetup();
 }catch(error){searchError=error.message;$('#results').innerHTML=`<div class="empty-state"><h3>No se ha podido iniciar Cerca</h3><p>${e(error.message)}</p></div>`;console.error(error);}
}
window.cercaReady=initializeDesktop();
