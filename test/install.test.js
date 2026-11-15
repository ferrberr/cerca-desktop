import test from 'node:test';
import assert from 'node:assert/strict';
import {installModels,pullModel} from '../ai/install.js';
import {Ollama,LocalModelError} from '../ai/ollama.js';
import {MODELS} from '../ai/config.js';

const streamed=parts=>new Response(new ReadableStream({start(controller){for(const part of parts)controller.enqueue(new TextEncoder().encode(part));controller.close();}}),{status:200});

test('model downloads parse split progress records and require confirmed success',async()=>{
 const events=[];
 await pullModel({fetch:async()=>streamed(['{"status":"pull','ing","completed":5,"total":10}\n{"status":"success"}'])},MODELS.decision,{onProgress:p=>events.push(p)});
 assert.equal(events[0].completed,5);assert.equal(events.at(-1).status,'success');
 await assert.rejects(pullModel({fetch:async()=>streamed(['{"status":"pulling"}\n'])},MODELS.decision),/sin confirmar/);
});

test('model download errors and cancellation never become a successful installation',async()=>{
 await assert.rejects(pullModel({fetch:async()=>streamed(['{"error":"model unavailable"}\n'])},MODELS.decision),/model unavailable/);
 const abort=new AbortController();abort.abort();
 await assert.rejects(pullModel({fetch:async()=>{throw abort.signal.reason;}},MODELS.decision,{signal:abort.signal}),/cancelada/);
 await assert.rejects(pullModel({fetch:async()=>{throw new Error('Must not fetch');}},'not-allowed'),/no permitido/);
});

test('installation reuses existing planner weights, copies the alias and pulls only missing official models',async()=>{
 const installed=new Set(['qwen3.5:9b',MODELS.embedding]),copies=[],pulls=[];
 const client={
  health:async()=>({connected:true,compatible:true,ready:Object.values(MODELS).every(name=>installed.has(name))}),
  request:async(endpoint,body,options)=>{
   if(endpoint==='/api/tags')return{models:[...installed].map(name=>({name}))};
   assert.equal(endpoint,'/api/copy');assert.equal(options.expectJSON,false);copies.push(body);installed.add(body.destination);
  },
  fetch:async(_url,options)=>{const {model}=JSON.parse(options.body);pulls.push(model);installed.add(model);return streamed(['{"status":"success"}\n']);},
 };
 const health=await installModels(client);
 assert.equal(health.ready,true);
 assert.deepEqual(copies,[{source:'qwen3.5:9b',destination:MODELS.planner}]);
 assert.deepEqual(pulls,[MODELS.decision]);
 await installModels(client);assert.equal(pulls.length,1);assert.equal(copies.length,1);
});

test('an unavailable or outdated Ollama stops before downloading model weights',async()=>{
 for(const health of [{connected:false},{connected:true,compatible:false}])await assert.rejects(installModels({health:async()=>health,fetch:()=>{throw new Error('Must not fetch');}}),LocalModelError);
});

test('the copy endpoint accepts an empty successful response and health checks decision API compatibility',async()=>{
 const client=new Ollama({fetchImpl:async url=>{
  if(url.endsWith('/api/copy'))return new Response(null,{status:200});
  if(url.endsWith('/api/version'))return Response.json({version:'0.40.15'});
  return Response.json({models:Object.values(MODELS).map(name=>({name,size:1}))});
 }});
 assert.equal(await client.request('/api/copy',{source:'one',destination:'two'},{expectJSON:false}),null);
 assert.equal((await client.health()).ready,true);
 const old=new Ollama({fetchImpl:async url=>url.endsWith('/api/version')?Response.json({version:'0.20.0'}):Response.json({models:Object.values(MODELS).map(name=>({name}))})});
 assert.equal((await old.health()).compatible,false);assert.equal((await old.health()).ready,false);
});
