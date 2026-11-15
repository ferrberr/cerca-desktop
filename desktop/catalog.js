import {createHash} from 'node:crypto';

const text = (value, fallback = '', max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const assets = new Set(['laptop-1','laptop-2','laptop-3','laptop-4','laptop-5','laptop-6','headphones','phone']);
export function validateCatalog(input) {
  const rows = Array.isArray(input) ? input : input?.products;
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error('El archivo debe contener entre 1 y 1000 anuncios en un array JSON o en {products: [...]} .');
  const ids = new Set();
  return rows.map((row, i) => {
    if (!row || typeof row.title !== 'string' || !row.title.trim() || !Number.isFinite(row.price) || row.price <= 0 || row.price > 1e8) throw new Error(`Anuncio ${i + 1}: title y price positivo son obligatorios.`);
    let url = null;
    if (row.url) {
      try { const parsed = new URL(row.url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(); url = parsed.href; }
      catch { throw new Error(`Anuncio ${i + 1}: el enlace debe ser HTTPS y no incluir credenciales.`); }
    }
    const id = 1000 + createHash('sha256').update(url || `${row.title}\n${row.source || ''}\n${row.city || ''}\n${row.description || ''}`).digest().readUIntBE(0, 6);
    if (ids.has(id)) throw new Error(`Anuncio ${i + 1}: está duplicado.`);
    ids.add(id);
    const latitude = Number.isFinite(row.latitude) && Math.abs(row.latitude) <= 90 ? row.latitude : null;
    const longitude = Number.isFinite(row.longitude) && Math.abs(row.longitude) <= 180 ? row.longitude : null;
    return {
      id, title: text(row.title, '', 200), spec: text(row.spec, 'Características no indicadas', 300),
      price: row.price, previous: Number.isFinite(row.previous) && row.previous > row.price ? row.previous : null,
      condition: ['Como nuevo', 'Buen estado', 'Nuevo', 'Aceptable', 'Para piezas'].includes(row.condition) ? row.condition : 'Sin indicar',
      city: text(row.city, 'Ubicación no indicada', 100), district: text(row.district, '', 100),
      distance: Number.isFinite(row.distance) && row.distance >= 0 ? row.distance : null,
      source: text(row.source, 'Importado', 60), description: text(row.description, '', 2000),
      asset: assets.has(row.asset) ? row.asset : 'laptop-1', illustration: true,
      badge: 'Importado', keywords: text(row.keywords), latitude, longitude,
      pos: null, url, demo: false,
    };
  });
}
