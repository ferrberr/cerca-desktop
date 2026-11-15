import { MODELS, OLLAMA_URL } from './config.js';

export class LocalModelError extends Error {}
export class InvalidModelOutputError extends LocalModelError {}
export class Ollama {
  constructor({fetchImpl = fetch} = {}) { this.fetch = fetchImpl; }

  async request(endpoint, body, {signal, timeout = 240_000, expectJSON = true} = {}) {
    try {
      const response = await this.fetch(`${OLLAMA_URL}${endpoint}`, {
        method: body ? 'POST' : 'GET',
        headers: {'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new LocalModelError(response.status === 404
          ? 'Falta un modelo local. Abre Preferencias → Configurar IA local.'
          : `Ollama: ${String(error.error || response.status).slice(0, 300)}`);
      }
      if(!expectJSON){await response.text();return null;}
      try{return await response.json();}catch{throw new InvalidModelOutputError('Ollama devolvió una respuesta JSON inválida.');}
    } catch (error) {
      if (signal?.aborted) throw new LocalModelError('Búsqueda cancelada.');
      if (error instanceof LocalModelError) throw error;
      if (error.name === 'TimeoutError') throw new LocalModelError('El modelo ha tardado demasiado. Reduce el catálogo o vuelve a intentarlo.');
      throw new LocalModelError('No se puede conectar con Ollama en este equipo. Inicia Ollama y vuelve a intentarlo.');
    }
  }

  async health() {
    try {
      const [{models=[]},{version=''}]=await Promise.all([this.request('/api/tags',undefined,{timeout:5000}),this.request('/api/version',undefined,{timeout:5000})]);
      const numbers=version.split('.').map(Number);
      const compatible=numbers.length>=2&&Number.isFinite(numbers[0])&&Number.isFinite(numbers[1])&&(numbers[0]>0||numbers[1]>=35);
      const roles = Object.entries(MODELS).map(([role, name]) => ({role, name, installed: models.some(m => m.name === name), size: models.find(m => m.name === name)?.size || 0}));
      return {connected:true,compatible,version,ready:compatible&&roles.every(m=>m.installed),models:roles,...(!compatible?{error:'Actualiza Ollama a la versión 0.35.0 o posterior.'}:{})};
    } catch (error) { return {connected: false, ready: false, models: [], error: error.message}; }
  }

  async chat(model, system, data, schema, {signal, tokens = 700, seed = 42, context = 4096} = {}) {
    const reply = await this.request('/api/chat', {
      model, think: false, stream: false, format: schema,
      keep_alive: '15m',
      options: {temperature: 0, seed, num_ctx: context, num_predict: tokens, num_thread: 8},
      messages: [{role: 'system', content: system}, {role: 'user', content: JSON.stringify(data)}],
    }, {signal});
    if (reply.done_reason === 'length') throw new InvalidModelOutputError('El modelo no completó la respuesta. Prueba una búsqueda más concreta.');
    try { return JSON.parse(reply.message.content); }
    catch { throw new InvalidModelOutputError('El modelo devolvió una respuesta inválida. Vuelve a intentarlo.'); }
  }

  async decide(model,data,options={}){const {systemDecision}=await import('./systemone.js');return systemDecision(this,model,data,options);}

  async warmup(model=MODELS.decision){if(model===MODELS.decision){return this.request('/v1/systemone',{model,state:'Preparando Cerca.',questions:{ready:{type:'choice',instructions:'Selecciona listo.',criteria:{listo:'El servicio está listo.',otro:'Cualquier otro caso.'}}},keep_alive:'15m'},{timeout:60000});}return this.request('/api/chat',{model,messages:[],keep_alive:'15m',options:{num_ctx:4096,num_predict:0}},{timeout:60000});}

  async embed(input, signal) {
    const reply = await this.request('/api/embed', {
      model: MODELS.embedding, input, truncate: false, keep_alive: '15m', options: {num_ctx: 2048, num_thread: 8},
    }, {signal});
    if (!Array.isArray(reply.embeddings) || reply.embeddings.length !== input.length || reply.embeddings.some(v => !Array.isArray(v) || !v.length || v.some(n => !Number.isFinite(n)))) {
      throw new LocalModelError('El modelo de similitud devolvió vectores inválidos.');
    }
    return reply.embeddings;
  }
}
