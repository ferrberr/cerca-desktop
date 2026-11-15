# Componentes de terceros

Cerca utiliza Electron (licencia MIT), Chromium y los componentes incluidos en su distribución. Sus avisos y licencias se incluyen en `LICENSE.electron.txt` y `LICENSES.chromium.html` junto al ejecutable.

- Leaflet 1.9.4: BSD-2-Clause. https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE
- Leaflet.markercluster 1.5.3: MIT. https://github.com/Leaflet/Leaflet.markercluster/blob/v1.5.3/MIT-LICENCE.txt

Los mapas proceden de OpenStreetMap y muestran su atribución. La búsqueda de localidades utiliza Open-Meteo/GeoNames. Los anuncios e imágenes pertenecen a sus respectivas fuentes y no se incluyen en el instalador.

Los pesos de los modelos no se incluyen en el instalador. Se descargan con Ollama, con sus licencias originales: Nimble 9B, Qwen3.5 9B y Qwen3 Embedding 0.6B (Apache-2.0). Los identificadores y fuentes están en `ai/models.lock.json`.

El código específico de Cerca no tiene asignada una licencia de código abierto. Este archivo conserva los avisos de los componentes distribuidos y no modifica sus licencias.
