import {DEFAULT_CENTER, validCoordinates} from './shared/geo.js';

let active = null;
let lastView = null;
let lastKey = null;
let nextInstanceId = 0;
const located = item => validCoordinates(item.latitude, item.longitude);

export function destroyMap() {
  if (!active) return;
  lastView = {center: active.map.getCenter(), zoom: active.map.getZoom()};
  lastKey = active.key;
  active.map.remove();
  active = null;
  delete window.cercaMapDebug;
}

// Results and filters update layers in place. Tiles, pan, popups and form input survive streaming.
export function renderRealMap(container, items, options) {
  const key = options.key || '';
  if (active?.container === container && active.key === key && container.contains(active.map.getContainer())) {
    active.update(items, options);
    return;
  }
  destroyMap();
  const center = options.center || DEFAULT_CENTER;
  container.innerHTML = `<div class="real-map-toolbar"><form id="map-place-form"><span>${options.icon('search')}</span><input id="map-place-query" placeholder="Buscar localidad o código postal" aria-label="Localidad para el mapa" maxlength="120"><button class="secondary-button">Ir</button></form><button id="map-fit-results" class="secondary-button">Ver todos</button><button id="map-pick-center" class="secondary-button">Elegir centro</button><button id="map-search-area" class="primary-button">Buscar en esta zona</button></div><div id="map-place-results" class="map-place-results" hidden></div><div class="real-map-layout"><div class="real-map-list"><div class="real-map-list-header"></div><div class="real-map-rows"></div></div><div class="real-map-wrap"><div id="real-map" role="region" aria-label="Mapa interactivo de anuncios"></div><div id="map-tile-error" class="map-tile-error" hidden>No se ha podido cargar la cartografía. Comprueba tu conexión. <button id="map-retry-tiles">Reintentar</button></div><div class="map-area-chip" id="map-area-label"></div></div></div><div class="real-map-footer"><span id="cartography-state">Cargando cartografía…</span><span>Las posiciones corresponden a las ubicaciones publicadas. Pueden ser aproximadas.</span><button id="map-report-issue" class="text-button">Informar de un error del mapa</button></div>`;
  const L = window.L;
  if (!L) {
    container.querySelector('#cartography-state').textContent = 'No se ha podido cargar el motor del mapa.';
    return;
  }
  const sameKey = lastKey === key;
  const map = L.map(container.querySelector('#real-map'), {
    center: sameKey && lastView ? lastView.center : [center.latitude, center.longitude],
    zoom: sameKey && lastView ? lastView.zoom : 10,
    minZoom: 3, maxZoom: 19, zoomControl: true, preferCanvas: true,
  });
  const view = {container, map, key, options, items: [], markers: new Map(), area: null, selected: null, choosing: false, geocoding: false, id: ++nextInstanceId};
  active = view;
  const q = selector => container.querySelector(selector);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, keepBuffer: 1, updateWhenIdle: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" data-map-attribution>OpenStreetMap contributors</a>',
  }).addTo(map);
  tiles.on('tileerror', () => {if (active === view) q('#map-tile-error').hidden = false;});
  tiles.on('tileload', () => {if (active === view) q('#cartography-state').textContent = 'Cartografía OpenStreetMap';});
  q('#map-retry-tiles').onclick = () => {q('#map-tile-error').hidden = true; tiles.redraw();};
  map.attributionControl.setPrefix(false);
  L.control.scale({imperial: false, position: 'bottomleft'}).addTo(map);
  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true,
    iconCreateFunction: c => L.divIcon({className: 'cerca-cluster', html: `<span>${c.getChildCount()}</span>`, iconSize: [35, 35]}),
  }).addTo(map);
  L.circleMarker([center.latitude, center.longitude], {radius: 5, color: '#fff', weight: 2, fillColor: '#778afb', fillOpacity: 1})
    .addTo(map).bindTooltip('Centro de búsqueda');

  function select(id) {
    view.selected = id;
    container.querySelectorAll('.real-map-result').forEach(row => row.classList.toggle('selected', Number(row.dataset.mapRow) === id));
    q(`[data-map-row="${id}"]`)?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }

  function makeMarker(item) {
    const marker = L.marker([item.latitude, item.longitude], {
      title: item.title, keyboard: true,
      icon: L.divIcon({className: 'cerca-price-marker', html: `<span>${item.price.toLocaleString('es-ES')} €</span>`, iconSize: [76, 30], iconAnchor: [38, 15]}),
    });
    const popup = document.createElement('div');
    popup.className = 'real-map-popup';
    const title = document.createElement('strong'); title.textContent = item.title;
    const price = document.createElement('b'); price.textContent = item.price.toLocaleString('es-ES') + ' €';
    const caption = document.createElement('p'); caption.textContent = `${item.city} · ${item.condition} · ${item.locationApproximate ? 'Ubicación aproximada' : 'Ubicación publicada'}`;
    const detail = document.createElement('button'); detail.className = 'secondary-button'; detail.textContent = 'Ver ficha del producto';
    detail.onclick = () => view.options.onDetail(item.id);
    popup.append(title, price, caption, detail);
    marker.bindPopup(popup, {maxWidth: 260, minWidth: 190});
    marker.on('click', () => select(item.id));
    return marker;
  }

  function updateRows(newItems) {
    const rows = q('.real-map-rows');
    const existing = new Map([...rows.querySelectorAll('[data-map-row]')].map(node => [Number(node.dataset.mapRow), node]));
    rows.querySelector('.map-list-empty')?.remove();
    let cursor = rows.firstElementChild;
    const {escapeHTML: e, imageFor} = view.options;
    for (const item of newItems) {
      const signature = JSON.stringify([item.title, imageFor(item), item.price, item.city, item.locationApproximate, located(item)]);
      let node = existing.get(item.id);
      existing.delete(item.id);
      if (!node || node.cercaSignature !== signature) {
        const template = document.createElement('template');
        template.innerHTML = `<article class="real-map-result" data-map-row="${item.id}"><button class="map-row-select" data-map-select="${item.id}" ${located(item) ? '' : 'disabled'} aria-label="Localizar ${e(item.title)}"><img src="${e(imageFor(item))}" alt="" loading="lazy"><span><strong>${e(item.title)}</strong><b>${item.price.toLocaleString('es-ES')} €</b><small>${e(item.city)}${item.locationApproximate ? ' · aprox.' : ''}</small></span></button><button class="text-button" data-map-detail="${item.id}">Ver ficha</button></article>`;
        const fresh = template.content.firstElementChild;
        fresh.cercaSignature = signature;
        if (node) {if (node === cursor) cursor = fresh; node.replaceWith(fresh);}
        node = fresh;
      }
      node.classList.toggle('selected', item.id === view.selected);
      if (node !== cursor) rows.insertBefore(node, cursor);
      cursor = node.nextElementSibling;
    }
    for (const node of existing.values()) node.remove();
    if (!newItems.length) rows.innerHTML = '<div class="map-list-empty">Busca un producto para ver sus anuncios en el mapa.</div>';
  }

  view.update = (newItems, newOptions) => {
    view.items = newItems;
    view.options = newOptions;
    const positioned = newItems.filter(located), wanted = new Set(positioned.map(item => item.id));
    for (const [id, {marker}] of view.markers) {
      if (!wanted.has(id)) {cluster.removeLayer(marker); view.markers.delete(id);}
    }
    for (const item of positioned) {
      const signature = JSON.stringify([item.latitude, item.longitude, item.title, item.price, item.condition, item.city, item.locationApproximate]);
      const old = view.markers.get(item.id);
      if (old?.signature === signature) continue;
      const wasOpen = old?.marker.isPopupOpen();
      if (old) cluster.removeLayer(old.marker);
      const marker = makeMarker(item);
      cluster.addLayer(marker);
      view.markers.set(item.id, {marker, signature});
      if (wasOpen) marker.openPopup();
    }
    if (!newItems.some(item => item.id === view.selected)) view.selected = null;
    q('.real-map-list-header').textContent = `${positioned.length} con ubicación${newItems.length > positioned.length ? ` · ${newItems.length - positioned.length} sin coordenadas` : ''}`;
    updateRows(newItems);
    const radius = newOptions.radius ?? 50;
    if (newOptions.allZones) {view.area?.remove(); view.area = null;}
    else if (view.area) view.area.setRadius(radius * 1000);
    else view.area = L.circle([center.latitude, center.longitude], {radius: radius * 1000, color: '#8193fc', weight: 1.5, fillColor: '#8193fc', fillOpacity: .035, interactive: false}).addTo(map);
    q('#map-area-label').textContent = `${newOptions.center?.label || 'Centro seleccionado'} · ${newOptions.allZones ? 'sin límite de distancia' : radius + ' km'}`;
    q('#map-pick-center').disabled = !!newOptions.busy;
    q('#map-search-area').disabled = !!newOptions.busy;
    q('#map-place-form button').disabled = !!newOptions.busy || view.geocoding;
    q('#map-place-query').disabled = !!newOptions.busy;
    if (newOptions.busy) setChoosing(false);
  };

  const fit = () => {
    const positioned = view.items.filter(located);
    if (positioned.length) map.fitBounds(L.latLngBounds(positioned.map(p => [p.latitude, p.longitude])), {padding: [38, 38], maxZoom: 14, animate: false});
    else if (view.area) map.fitBounds(view.area.getBounds(), {padding: [20, 20], animate: false});
    else map.setView([center.latitude, center.longitude], 9, {animate: false});
  };
  q('#map-fit-results').onclick = fit;
  function setChoosing(choosing) {
    view.choosing = choosing;
    q('#map-pick-center').classList.toggle('active', choosing);
    q('#map-pick-center').textContent = choosing ? 'Haz clic en el mapa' : 'Elegir centro';
    map.getContainer().classList.toggle('picking-center', choosing);
  }
  q('#map-pick-center').onclick = () => setChoosing(!view.choosing);
  map.on('click', event => {
    if (!view.choosing || view.options.busy) return;
    setChoosing(false);
    view.options.onCenter({latitude: event.latlng.lat, longitude: event.latlng.lng, label: 'Zona del mapa'});
  });
  q('#map-search-area').onclick = () => {
    const c = map.getCenter();
    view.options.onSearch({latitude: c.lat, longitude: c.lng, label: 'Zona del mapa'});
  };
  q('.real-map-rows').onclick = event => {
    const detail = event.target.closest('[data-map-detail]');
    if (detail) {view.options.onDetail(Number(detail.dataset.mapDetail)); return;}
    const id = Number(event.target.closest('[data-map-select]')?.dataset.mapSelect);
    const marker = view.markers.get(id)?.marker;
    if (marker) cluster.zoomToShowLayer(marker, () => {if (active === view) {marker.openPopup(); select(id);}});
  };
  q('#map-place-form').onsubmit = async event => {
    event.preventDefault();
    if (view.geocoding || view.options.busy) return;
    const results = q('#map-place-results');
    view.geocoding = true;
    q('#map-place-form button').disabled = true;
    results.hidden = false;
    results.textContent = 'Buscando localidad…';
    try {
      const places = await view.options.geocode(q('#map-place-query').value);
      if (active !== view) return;
      const e = view.options.escapeHTML;
      results.innerHTML = places.length ? places.map((p, i) => `<button class="place-option" data-place="${i}"><strong>${e(p.label)}</strong><span>${e(p.description)}</span></button>`).join('') : 'No se ha encontrado la localidad. Puedes elegir un punto en el mapa.';
      results.querySelectorAll('[data-place]').forEach(button => button.onclick = () => {
        if (view.options.busy) return;
        results.hidden = true;
        view.options.onCenter(places[Number(button.dataset.place)]);
      });
    } catch (error) {if (active === view) results.textContent = error.message;}
    finally {view.geocoding = false; if (active === view) q('#map-place-form button').disabled = !!view.options.busy;}
  };
  q('#map-report-issue').onclick = () => view.options.openMapInfo('issue');
  q('[data-map-attribution]').onclick = event => {event.preventDefault(); view.options.openMapInfo('copyright');};
  requestAnimationFrame(() => {if (active === view) map.invalidateSize();});
  const observer = new ResizeObserver(() => {if (active === view) map.invalidateSize({pan: false});});
  observer.observe(map.getContainer());
  map.on('unload', () => observer.disconnect());
  window.cercaMapDebug = () => ({
    instanceId: view.id,
    center: {latitude: map.getCenter().lat, longitude: map.getCenter().lng}, zoom: map.getZoom(),
    markers: view.markers.size, circleMeters: view.area?.getRadius() || 0,
    tiles: [...map.getContainer().querySelectorAll('.leaflet-tile')].filter(i => i.complete && i.naturalWidth > 0).length,
  });
  view.update(items, options);
  if (!sameKey) fit();
}
