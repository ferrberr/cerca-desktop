import fs from 'node:fs';
import path from 'node:path';
import {priceRange} from '../shared/prices.js';
import {validCoordinates} from '../shared/geo.js';
import {DEFAULT_MATCH_TARGET, MATCH_TARGETS} from '../shared/limits.js';

export const KEYS = new Set(['cerca-theme', 'cerca-favorites', 'cerca-recent', 'cerca-alerts', 'cerca-dataset', 'cerca-center', 'cerca-target']);
export class Store {
  constructor(directory) {
    fs.mkdirSync(directory, {recursive: true});
    this.file = path.join(directory, 'cerca-data.json');
    this.data = {preferences: {'cerca-alerts': [], 'cerca-dataset': 'live', 'cerca-center':{latitude:41.3851,longitude:2.1734,label:'Barcelona'}, 'cerca-target':DEFAULT_MATCH_TARGET}, imported: [], live:[], notified: {}, version:4};
    if (fs.existsSync(this.file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (!parsed.preferences || !Array.isArray(parsed.imported)) throw new Error();
        this.data = {...this.data, ...parsed,preferences:{...this.data.preferences,...parsed.preferences}};
        if(!parsed.version||parsed.version<3)this.data.preferences['cerca-dataset']='live';
        delete this.data.preferences['cerca-pages'];
        if(!MATCH_TARGETS.includes(this.data.preferences['cerca-target']))this.data.preferences['cerca-target']=DEFAULT_MATCH_TARGET;
        this.data.version=Math.max(4,parsed.version||0);
      } catch { throw new Error('El archivo de datos locales no se puede leer. Se conserva sin sobrescribirlo.'); }
    }
  }
  scheduleFlush(){if(this.flushTimer)return;this.flushTimer=setTimeout(()=>this.flush(),3000);this.flushTimer.unref();}
  flush(data = this.data) {
    clearTimeout(this.flushTimer);this.flushTimer=null;
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), {mode: 0o600});
    fs.renameSync(temp, this.file);
    this.data = data;
  }
  setPreference(key, value) {
    if (!KEYS.has(key)) throw new Error('Preferencia no permitida.');
    const serialized=JSON.stringify(value);
    if(typeof serialized!=='string')throw new Error('Valor de preferencia no válido.');
    if (serialized.length > 200_000) throw new Error('Demasiados datos para esta preferencia.');
    if (key === 'cerca-alerts') {
      if (!Array.isArray(value) || value.length > 100 || value.some(a => !a || typeof a!=='object' || !Number.isSafeInteger(a.id) || typeof a.query !== 'string' || !a.query.trim() || a.query.length > 500 || !Number.isFinite(a.price) || a.price < 0 || a.price > 1e8 || !Number.isFinite(a.radius) || a.radius < 1 || a.radius > 500 || !['Cualquiera','Nuevo','Como nuevo','Buen estado','Aceptable','Para piezas'].includes(a.condition) || (typeof a.zone!=='string'||a.zone.length>150) || typeof a.enabled !== 'boolean')) throw new Error('Alerta inválida.');
    }
    if (key === 'cerca-dataset' && !['demo', 'imported', 'live'].includes(value)) throw new Error('Catálogo no válido.');
    if (key === 'cerca-theme' && !['light', 'dark'].includes(value)) throw new Error('Tema no válido.');
    if (key === 'cerca-favorites' && (!Array.isArray(value) || value.length > 2000 || value.some(n => !Number.isSafeInteger(n)))) throw new Error('Guardados no válidos.');
    if (key === 'cerca-recent' && (!Array.isArray(value) || value.length > 5 || value.some(s => typeof s !== 'string' || s.length > 500))) throw new Error('Historial no válido.');
    if(key==='cerca-alerts')for(const alert of value)priceRange({minPrice:alert.minPrice,maxPrice:alert.price});
    if(key==='cerca-center'&&(!value||!validCoordinates(value.latitude,value.longitude)||typeof value.label!=='string'||value.label.length>150))throw new Error('Centro de búsqueda inválido.');
    if(key==='cerca-target'&&!MATCH_TARGETS.includes(value))throw new Error('Objetivo de coincidencias no válido.');
    if(key==='cerca-alerts'&&value.some(a=>a.center&&!validCoordinates(a.center.latitude,a.center.longitude)||a.dataset&&!['live','imported'].includes(a.dataset)))throw new Error('Zona o fuente de alerta inválida.');
    const next = {...this.data, preferences: {...this.data.preferences, [key]: value}};
    if(key==='cerca-alerts'){
      const ids=new Set(value.map(alert=>String(alert.id)));
      next.notified=Object.fromEntries(Object.entries(this.data.notified).filter(([id])=>ids.has(id)));
    }
    this.flush(next);
  }
}
