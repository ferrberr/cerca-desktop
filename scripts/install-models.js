import {Ollama} from '../ai/ollama.js';
import {installModels} from '../ai/install.js';
const signal=AbortSignal.timeout(2*60*60*1000);
try{await installModels(new Ollama(),{signal,onProgress:p=>console.log(`${p.name} · ${p.status}${p.total?' · '+Math.floor(p.completed/p.total*100)+'%':''}`)});console.log('Los modelos de Cerca están listos.');}
catch(error){console.error(error.message);process.exitCode=1;}
