import fs from 'node:fs/promises';
import {SearchEngine} from '../ai/engine.js';
const engine = new SearchEngine();
const status = await engine.ollama.health();
if (!status.ready) throw new Error('Faltan modelos: ' + JSON.stringify(status));
const catalog = JSON.parse(await fs.readFile(new URL('../catalog/demo.json', import.meta.url), 'utf8'));
const negatives = [
  {...catalog[0],id:91,title:'Funda para MacBook Air M2',spec:'Solo funda de plástico. No incluye portátil.',description:'Accesorio compatible con MacBook Air M2. No se vende ordenador.',price:15},
  {...catalog[0],id:92,title:'MacBook Air M1 2020',spec:'8 GB RAM · 256 GB SSD · Chip M1',description:'Portátil completo con procesador M1, no M2.',price:450},
  {...catalog[0],id:93,title:'MacBook Air M2 para piezas',spec:'Averiado, no enciende',description:'Se vende solo para piezas. Placa base rota. No funciona.',price:300,condition:'Para piezas'},
];
const result = await engine.search('Busco un MacBook Air M2 completo y funcionando, por menos de 900 euros. No quiero fundas, piezas ni modelos M1.', [...catalog, ...negatives], {maxPrice:900,condition:'Cualquiera',zone:'Barcelona',radius:50}, {onProgress: console.log});
const ids = result.items.map(p=>p.id).sort((a,b)=>a-b);
if (JSON.stringify(ids) !== JSON.stringify([1,2,3,4,5,6])) throw new Error(`Clasificación inesperada: ${JSON.stringify(result)}`);
if (negatives.some(p => !result.rejected.some(r => r.id === p.id))) throw new Error('Algún accesorio/modelo incorrecto no fue rechazado');
await fs.mkdir('test-results',{recursive:true});
await fs.writeFile('test-results/models-integration.json',JSON.stringify({status,result},null,2));
console.log('CERCA_MODELS_OK',JSON.stringify({accepted:ids,rejected:result.rejected.map(p=>({id:p.id,reason:p.reason})),durationMs:result.durationMs,models:result.models}));
