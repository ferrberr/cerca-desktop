import {MODELS, OLLAMA_URL} from './config.js';
import {LocalModelError} from './ollama.js';

export const MODEL_DOWNLOADS=Object.freeze([
 {role:'planner',source:'qwen3.5:9b',destination:MODELS.planner},
 {role:'decision',source:MODELS.decision,destination:MODELS.decision},
 {role:'embedding',source:MODELS.embedding,destination:MODELS.embedding},
]);

export async function pullModel(client,model,{signal,onProgress=()=>{}}={}){
 if(!MODEL_DOWNLOADS.some(entry=>entry.source===model))throw new LocalModelError('Modelo de descarga no permitido.');
 let response;
 try{
  response=await client.fetch(`${OLLAMA_URL}/api/pull`,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:true}),
   signal:AbortSignal.any([AbortSignal.timeout(2*60*60*1000),...(signal?[signal]:[])]),
  });
 }catch(error){if(signal?.aborted)throw new LocalModelError('Descarga cancelada.');throw new LocalModelError('No se puede conectar con Ollama. Ábrelo y vuelve a intentarlo.');}
 if(!response.ok||!response.body)throw new LocalModelError(`Ollama no pudo iniciar la descarga (${response.status}).`);
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',succeeded=false;
 const consume=line=>{
  if(!line.trim())return;
  let update;try{update=JSON.parse(line);}catch{throw new LocalModelError('Ollama envió un progreso de descarga inválido.');}
  if(update.error)throw new LocalModelError(String(update.error).slice(0,300));
  if(update.status==='success')succeeded=true;
  onProgress({status:String(update.status||'Descargando…').slice(0,200),completed:Number.isFinite(update.completed)?update.completed:0,total:Number.isFinite(update.total)?update.total:0});
 };
 try{
  while(true){
   signal?.throwIfAborted();const {done,value}=await reader.read();
   pending+=done?decoder.decode():decoder.decode(value,{stream:true});
   let newline;while((newline=pending.indexOf('\n'))!==-1){consume(pending.slice(0,newline));pending=pending.slice(newline+1);}
   if(pending.length>64*1024)throw new LocalModelError('La respuesta de descarga de Ollama es demasiado grande.');
   if(done)break;
  }
  consume(pending);
  if(!succeeded)throw new LocalModelError('La descarga terminó sin confirmar que el modelo esté completo. Vuelve a intentarlo para reanudarla.');
 }catch(error){if(signal?.aborted)throw new LocalModelError('Descarga cancelada.');throw error;}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export async function installModels(client,{signal,onProgress=()=>{}}={}){
 const health=await client.health();
 if(!health.connected)throw new LocalModelError('Instala o abre Ollama antes de descargar los modelos.');
 if(health.compatible===false)throw new LocalModelError('Actualiza Ollama para utilizar el modelo de decisión de Cerca.');
 const {models=[]}=await client.request('/api/tags',undefined,{signal});
 const installed=new Set(models.map(model=>model.name));
 for(const step of MODEL_DOWNLOADS){
  signal?.throwIfAborted();
  const progress=update=>onProgress({role:step.role,name:step.destination,...update});
  if(installed.has(step.destination)){progress({status:'Ya instalado',completed:0,total:0});continue;}
  let source=step.source;
  if(step.role==='planner'&&installed.has('cerca-decision:9b'))source='cerca-decision:9b';
  if(!installed.has(source)){
   progress({status:'Preparando descarga',completed:0,total:0});
   await pullModel(client,source,{signal,onProgress:progress});installed.add(source);
  }
  if(source!==step.destination)await client.request('/api/copy',{source,destination:step.destination},{signal,expectJSON:false});
  installed.add(step.destination);progress({status:'Instalado',completed:0,total:0});
 }
 const result=await client.health();
 if(!result.ready)throw new LocalModelError('No se han podido verificar todos los modelos. Comprueba Ollama y reintenta la configuración.');
 return result;
}
