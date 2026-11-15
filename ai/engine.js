import {canonicalProductText,productIdentity,identityRejection} from './product-identity.js';
import {priceRange} from '../shared/prices.js';
import {LruCache} from '../shared/lru-cache.js';
import {SearchCache} from './search-cache.js';
import {DECISION_PROMPT,PLAN_PROMPT} from './prompts.js';
import {createHash} from 'node:crypto';
import {MODELS} from './config.js';
import {setTimeout as delay} from 'node:timers/promises';
import {MAX_RESULTS} from '../shared/limits.js';
import {Ollama, LocalModelError, InvalidModelOutputError} from './ollama.js';
import {matchesFilters} from '../shared/listings.js';
import {distanceKm} from '../shared/geo.js';

const planSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    product: {type: 'string'}, queries: {type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 3},
    must_have: {type: 'array', items: {type: 'string'}, maxItems: 8},
    exclude: {type: 'array', items: {type: 'string'}, maxItems: 8},
    min_price: {type: ['number', 'null'],minimum:0},
    max_price: {type: ['number', 'null'],minimum:0},
    condition: {type: 'string', enum: ['Cualquiera', 'Nuevo', 'Como nuevo', 'Buen estado', 'Aceptable', 'Para piezas']},
  }, required: ['product', 'queries', 'must_have', 'exclude', 'min_price', 'max_price', 'condition'],
};
const decisionSchema = {
  type:'object', additionalProperties:false,
  properties:{id:{type:'integer',enum:[1]},accept:{type:'boolean'},score:{type:'integer',minimum:0,maximum:100},reason:{type:'string',minLength:1,maxLength:600}},
  required:['id','accept','score','reason'],
};
function validDecision(d){return d&&d.id===1&&typeof d.accept==='boolean'&&Number.isInteger(d.score)&&d.score>=0&&d.score<=100&&typeof d.reason==='string'&&d.reason.trim().length>0&&d.reason.length<=600;}
export const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function cosine(a, b) {
  if (a.length !== b.length) throw new LocalModelError('Dimensiones de similitud incompatibles.');
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function hardFilter(items, constraints = {}) {
  return items.filter(item => matchesFilters(item, constraints));
}
function validPlan(p) {
  return p && typeof p.product === 'string' && p.product.trim() && p.product.length <= 200
    && ['queries', 'must_have', 'exclude'].every(k => Array.isArray(p[k]) && p[k].length <= 8 && p[k].every(v => typeof v === 'string' && v.length <= 150))
    && p.queries.length >= 1 && p.queries.length <= 3
    && (p.min_price == null || Number.isFinite(p.min_price) && p.min_price >= 0)
    && (p.max_price === null || Number.isFinite(p.max_price) && p.max_price >= 0)
    && ['Cualquiera', 'Nuevo', 'Como nuevo', 'Buen estado', 'Aceptable', 'Para piezas'].includes(p.condition);
}
const CACHE_VERSION='strict-identity-v3';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function literalPlan(query){
 const text=canonicalProductText(query.trim());
 if(text.length>120||text.split(/\s+/).length>10||/[€<>:=!?]/.test(text)||/\b(busco|quiero|necesito|hasta|desde|al|menos|mas|máximo|maximo|mínimo|minimo|sin|excepto|no|con|que|para|nuevo|nueva|usado|usada|buen|estado|roto|rota|piezas|funcionando|euros?|barato|barata|cerca|entre|solo|sólo|mayor|menor)\b/i.test(text))return null;
 return {product:text,queries:[text],must_have:[],exclude:[],min_price:null,max_price:null,condition:'Cualquiera'};
}
function lexicalScore(product,text){
 const words=[...new Set(normalize(product).split(/[^a-z0-9]+/).filter(w=>w.length>1&&!['de','la','el','un','una','los','las'].includes(w)))];
 const title=' '+normalize(text.title).replace(/[^a-z0-9]+/g,' ')+' ',body=normalize(text.spec+' '+(text.description||''));
 const prefix=normalize(text.title).startsWith(normalize(product))?8:0;
 return prefix+words.reduce((score,w)=>score+(title.includes(' '+w+' ')?5:body.includes(w)?1:0),0);
}
export class SearchEngine {
 constructor({ollama=new Ollama(),cache=new SearchCache()}={}){this.ollama=ollama;this.cache=cache;this.vectors=new LruCache(2048);}
 async search(query,catalog,constraints={}, {signal,onProgress=()=>{},onUpdate=()=>{},enrich,maxCandidates=Infinity,retryDelayMs=750,prefetch=3}={}){
  if(typeof query!=='string'||!query.trim()||query.length>500)throw new LocalModelError('Introduce una búsqueda de entre 1 y 500 caracteres.');
  const start=performance.now(),metrics={planningMs:0,rankingMs:0,decisionMs:0,enrichmentMs:0,cacheHits:0,firstResultMs:null};
  const report=message=>{signal?.throwIfAborted();onProgress(message);};
  const planKey=hash([CACHE_VERSION,'plan',MODELS.planner,query]);
  let plan=this.cache.get(planKey)||literalPlan(query);
  if(!validPlan(plan)){
   report('Interpretando tu búsqueda con Qwen3.5 9B…');
   plan=await this.ollama.chat(MODELS.planner,PLAN_PROMPT,{search:query},planSchema,{signal,tokens:400});
   if(!validPlan(plan))throw new LocalModelError('El modelo no pudo interpretar la búsqueda de forma válida.');
  }
  plan={...plan,product:canonicalProductText(plan.product),queries:plan.queries.map(canonicalProductText)};
  const identity=productIdentity(query,plan);
  this.cache.set(planKey,plan);metrics.planningMs=Math.round(performance.now()-start);
  const effective={...constraints,...priceRange({minPrice:Math.max(constraints.minPrice??0,plan.min_price??0),maxPrice:Math.min(constraints.maxPrice??Infinity,plan.max_price??Infinity)}),condition:constraints.condition&&constraints.condition!=='Cualquiera'?constraints.condition:plan.condition};
  const base={plan,constraints:effective,models:MODELS,total:0,eligible:0,maxResults:MAX_RESULTS};
  await onUpdate({type:'started',report:{...base,items:[],rejected:[],evaluated:0,retries:0,durationMs:0}});
  if(typeof catalog==='function')catalog=await catalog(plan,effective,{signal,onProgress:report});
  if(!Array.isArray(catalog)&&!catalog?.[Symbol.asyncIterator])throw new LocalModelError('La fuente no devolvió un catálogo válido.');
  const batches=Array.isArray(catalog)?(async function*(){yield catalog;})():catalog;
  const accepted=[],rejected=[],detailErrors=[],seen=new Set();let evaluated=0,retries=0,filteredOut=0,considered=0;
  const detailController=new AbortController();
  const detailSignal=AbortSignal.any([detailController.signal,...(signal?[signal]:[])]);
  try{
   for await(const rows of batches){
    signal?.throwIfAborted();
    const unique=rows.filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true;}).map(p=>effective.center?{...p,distance:distanceKm(effective.center,p)??p.distance}:p);
    const eligible=hardFilter(unique,enrich?{...effective,condition:'Cualquiera'}:effective);
    base.total+=unique.length;base.eligible+=eligible.length;
    await onUpdate({type:'catalog',total:base.total,eligible:base.eligible});
    const rankingStart=performance.now();
    let candidates=eligible.map(p=>({...p,priority:lexicalScore(plan.product,p)}));
    // Embeddings are useful only when the text has no lexical anchor; do not index the whole market before showing the first result.
    if(candidates.length&&!candidates.some(p=>p.priority>0)){
     report('Localizando candidatos por similitud semántica…');
     const text=p=>`${p.title}. ${p.spec}. ${p.description||''}`.slice(0,1200),keys=candidates.map(p=>hash(text(p)));
     // Pin this batch while the bounded cross-search cache evicts older vectors.
     const batchVectors=new Map(keys.map(key=>[key,this.vectors.get(key)]));
     const missing=candidates.filter((_,i)=>!batchVectors.get(keys[i]));
     for(let i=0;i<missing.length;i+=16){
      const slice=missing.slice(i,i+16),vectors=await this.ollama.embed(slice.map(text),signal);
      slice.forEach((p,j)=>{const key=hash(text(p));batchVectors.set(key,vectors[j]);this.vectors.set(key,vectors[j]);});
     }
     const qkey=hash(['query',query]);let queryVector=this.vectors.get(qkey);
     if(!queryVector){[queryVector]=await this.ollama.embed([query],signal);this.vectors.set(qkey,queryVector);}
     candidates=candidates.map((p,i)=>({...p,priority:cosine(queryVector,batchVectors.get(keys[i]))}));
    }
    candidates.sort((a,b)=>b.priority-a.priority||a.price-b.price);
    metrics.rankingMs+=Math.round(performance.now()-rankingStart);
    const pending=new Map(),lookahead=Math.max(1,Math.min(4,prefetch));let currentIndex=0;
    const prepare=index=>{
     if(index>=candidates.length||pending.has(index)||considered+index-currentIndex>=maxCandidates)return;
     const before=performance.now();
     const task=enrich?enrich([candidates[index]],{signal:detailSignal,center:effective.center,onProgress:message=>{if(index===currentIndex)report(message);}}):Promise.resolve({items:[candidates[index]],errors:[]});
     pending.set(index,Promise.resolve(task).then(value=>({value,ms:performance.now()-before}),error=>({error})));
    };
    for(currentIndex=0;currentIndex<candidates.length&&accepted.length<MAX_RESULTS&&considered<maxCandidates;currentIndex++){
     signal?.throwIfAborted();for(let n=0;n<lookahead;n++)prepare(currentIndex+n);
     const outcome=await pending.get(currentIndex);pending.delete(currentIndex);considered++;
     if(outcome.error)throw outcome.error;
     metrics.enrichmentMs+=Math.round(outcome.ms);detailErrors.push(...(outcome.value.errors||[]));
     const product=hardFilter(outcome.value.items,effective)[0];if(!product){filteredOut++;continue;}
     // A failed public detail request is not a verified listing. Never infer from a partial search card.
     if(enrich&&(product.detailError||product.provider==='wallapop'&&product.detailComplete!==true)){
      if(!detailErrors.some(error=>error.id===product.id))detailErrors.push({id:product.id,error:'No se ha podido verificar la ficha pública.'});
      filteredOut++;continue;
     }
     const listing={id:1,title:product.title,spec:product.spec,description:product.description,price:product.price,condition:product.condition,city:product.city};
     const decisionKey=hash([CACHE_VERSION,MODELS.decision,product.id,query,effective,listing]);
     let decision=identityRejection(identity,listing),attempt=0;
     if(!decision){decision=this.cache.get(decisionKey);if(validDecision(decision))metrics.cacheHits++;else decision=null;}
     while(!decision){
      signal?.throwIfAborted();attempt++;
      report(`Evaluando anuncio ${evaluated+1} · ${accepted.length}/${MAX_RESULTS} coincidencias${attempt>1?` · reintento ${attempt-1}`:''}…`);
      try{
       const before=performance.now();
       const verdict=this.ollama.decide?await this.ollama.decide(MODELS.decision,{request:query,plan,constraints:effective,listing},{signal}):await this.ollama.chat(MODELS.decision,DECISION_PROMPT,{request:query,plan,listing,...(attempt>1?{validation_feedback:'Solo JSON: id=1, accept booleano, score entero 0–100, reason breve no vacío.'}:{})},decisionSchema,{signal,tokens:Math.min(1000,180+(attempt-1)*150),seed:42+(attempt-1)%1000000});
       metrics.decisionMs+=Math.round(performance.now()-before);
       if(!validDecision(verdict))throw new InvalidModelOutputError('El modelo devolvió una decisión inválida.');
       decision=verdict;this.cache.set(decisionKey,decision);
      }catch(error){
       if(signal?.aborted)throw error;if(!(error instanceof InvalidModelOutputError))throw error;
       retries++;report(`Decisión inválida. Reintentando anuncio ${evaluated+1} (intento ${attempt+1})…`);await delay(Math.max(0,retryDelayMs),undefined,{signal});
      }
     }
     const item={...product,match:decision.score,reason:decision.reason,analyzed:true,accepted:decision.accept,analysisQuery:query,decisionModel:decision.source==='identity_rule'?null:MODELS.decision,decisionSource:decision.source||'model',decisionCategory:decision.category,decisionConfidence:decision.confidence};
     (decision.accept?accepted:rejected).push(item);evaluated++;
     if(decision.accept&&metrics.firstResultMs===null)metrics.firstResultMs=Math.round(performance.now()-start);
     await onUpdate({type:'decision',item,evaluated,retries,acceptedCount:accepted.length,rejectedCount:rejected.length,cacheHit:attempt===0&&decision.source!=='identity_rule',durationMs:Math.round(performance.now()-start)});
    }
    if(accepted.length>=MAX_RESULTS||considered>=maxCandidates)break;
   }
  }finally{detailController.abort();}
  report('Selección terminada.');
  return{...base,items:accepted.sort((a,b)=>b.match-a.match||a.price-b.price),rejected,evaluated,retries,filteredOut,limitReached:accepted.length===MAX_RESULTS,notEvaluated:Math.max(0,base.eligible-evaluated-filteredOut),detailErrors,metrics,durationMs:Math.round(performance.now()-start)};
 }
}
