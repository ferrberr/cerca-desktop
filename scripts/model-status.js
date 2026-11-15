import {Ollama} from '../ai/ollama.js';
const status = await new Ollama().health();
console.log(JSON.stringify(status, null, 2));
process.exitCode = status.ready ? 0 : 1;
