import {LruCache} from '../shared/lru-cache.js';
import {validCoordinates} from '../shared/geo.js';
export class Geocoder {
 constructor({fetchImpl=fetch}={}){this.fetch=fetchImpl;this.cache=new LruCache(256);}
 async search(query){
  if(typeof query!=='string'||query.trim().length<2||query.length>120)throw new Error('Introduce una localidad o código postal de entre 2 y 120 caracteres.');
  const key=query.trim().toLowerCase();if(this.cache.has(key))return this.cache.get(key);
  const url=new URL('https://geocoding-api.open-meteo.com/v1/search');url.search=new URLSearchParams({name:query.trim(),count:'8',language:'es',format:'json'});
  const response=await this.fetch(url,{headers:{'User-Agent':'Cerca/0.3 desktop product finder'},signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error('El buscador de localidades no está disponible. Puedes elegir el centro directamente en el mapa.');
  const data=await response.json();
  const results=(data.results||[]).filter(p=>validCoordinates(p.latitude,p.longitude)).map(p=>({latitude:p.latitude,longitude:p.longitude,label:p.name,description:[p.admin1,p.country].filter(Boolean).join(', ')}));
  this.cache.set(key,results);return results;
 }
}
