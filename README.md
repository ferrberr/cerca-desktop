# Cerca · Aplicación de escritorio

Aplicación de escritorio para Windows y Linux (x64, Intel/AMD de 64 bits) con ventana Electron propia, búsqueda de anuncios reales de Wallapop, selección mediante modelos locales, mapa navegable, favoritos y notificaciones nativas. No necesita un navegador abierto ni un servidor web para la interfaz.

## Descargar e instalar

Las descargas están en [GitHub Releases](https://github.com/ferrberr/cerca-desktop/releases/latest).

| Sistema | Descarga de Cerca 0.7.0 |
| --- | --- |
| Windows x64 | [Instalador EXE](https://github.com/ferrberr/cerca-desktop/releases/download/v0.7.0/Cerca-0.7.0-windows-x64-setup.exe) |
| Linux x64 | [AppImage](https://github.com/ferrberr/cerca-desktop/releases/download/v0.7.0/Cerca-0.7.0-linux-x64.AppImage) |
| Debian/Ubuntu x64 | [Paquete DEB](https://github.com/ferrberr/cerca-desktop/releases/download/v0.7.0/Cerca-0.7.0-linux-x64.deb) |

El instalador incluye Electron; no hace falta instalar Node.js. Windows permite elegir la carpeta y crea accesos directos. En Linux, el paquete DEB integra Cerca en el menú. Para AppImage:

```sh
chmod +x Cerca-0.7.0-linux-x64.AppImage
./Cerca-0.7.0-linux-x64.AppImage
```

El archivo `SHA256SUMS` de cada release permite comprobar las descargas. La distribución Windows todavía no dispone de un certificado comercial de firma de código. Las compilaciones oficiales de este repositorio se publican después de superar las pruebas en Windows y Linux.

### Preparar la IA local

Al abrir Cerca por primera vez, utiliza **Configurar IA local**. También está disponible en **Preferencias**:

1. Pulsa **Descargar Ollama**, instálalo desde su web oficial y déjalo abierto. Se necesita Ollama 0.35.0 o posterior.
2. Pulsa **Descargar modelos**. Cerca muestra el progreso y permite cancelar. Una nueva ejecución reutiliza los modelos completos ya instalados y Ollama puede reanudar las descargas.
3. Cuando aparezca «Todos los modelos están listos», empieza a buscar.

Los modelos ocupan aproximadamente 13 GB adicionales. Se recomienda disponer de 24–32 GB de RAM; una GPU compatible acelera las decisiones. La velocidad depende del equipo. Los pesos se descargan por separado para mantener los instaladores de la aplicación pequeños.

### Ejecutar desde el código

Requiere Node.js 22.12 o posterior (recomendado 24 LTS):

```sh
npm ci
npm start
```

Para preparar modelos desde la terminal, con Ollama abierto, ejecuta `npm run models:install`; funciona tanto en Windows como en Linux. `CERCA_ELECTRON` permite utilizar otro ejecutable de Electron en desarrollo. `npm run desktop:install` registra el proyecto en el menú de Linux; los instaladores ya incluyen su integración nativa.

## Buscar anuncios reales

1. Selecciona **Wallapop en directo** junto al buscador. Es la opción predeterminada.
2. Describe el producto que buscas; por ejemplo, «MacBook Air M2 completo y funcionando, hasta 900 euros».
3. Ajusta precio mínimo y máximo, estado y zona. Pulsa **Buscar**.
4. Cerca procesa la primera página en cuanto llega. Comprueba la ficha pública de cada candidato y muestra cada coincidencia inmediatamente. Mientras falten resultados, solicita otra página.
5. Los resultados se ordenan inicialmente por menor precio. Puedes ordenar por afinidad o distancia.
6. Abre un producto para ver su galería real, descripción, estado, disponibilidad, características, vendedor público, valoraciones y fecha de consulta. **Ver anuncio real** abre su página original en el navegador del sistema.

**Ver selección** muestra qué productos ha aceptado y rechazado el modelo y el motivo asociado a su categoría de decisión. Se aplican únicamente restricciones explícitas: no se supone un tamaño, RAM o color que no hayas indicado. Un equipo completo con una funda incluida no se trata automáticamente como un anuncio que vende solo una funda.

### Coincidencias estrictas

La misma evaluación se aplica a cualquier producto. El modelo comprueba por separado la identidad de lo vendido, los requisitos explícitos de la petición y el contenido real de la oferta. Reconoce abreviaturas, errores ortográficos, equivalencias de unidades y cantidades totales de un conjunto. Los atributos que el usuario no pide quedan libres.

Cada comprobación distingue un requisito satisfecho, una contradicción y la información que falta. Para aceptar el anuncio, las tres comprobaciones deben estar confirmadas. Una contradicción o información ausente en cualquiera de ellas descarta el candidato. La afinidad es una valoración del modelo y no representa una probabilidad de acierto calibrada.

La descripción completa permite contrastar el título, el precio por unidad, las unidades que siguen disponibles y los objetos excluidos de la venta. Un conjunto que incluye el objeto solicitado puede encajar. Un anuncio que solo lo menciona por compatibilidad o posibilidad de ampliación debe descartarse. Las decisiones de elegibilidad las toma el modelo con el mismo criterio para todas las categorías.

Los alias conocidos se normalizan para mejorar las consultas y la lectura de los textos. El plan de búsqueda mantiene las restricciones del usuario. Los filtros inferidos de precio y estado incluyen el fragmento de la petición que los justifica y se ignoran si ese fragmento no existe en ella.

Cada decisión conserva las tres comprobaciones. Un cambio en los criterios invalida la caché de decisiones anteriores. Los filtros deterministas de precio, estado, disponibilidad y radio continúan ejecutándose por separado.

### Acceso a los anuncios

Se usa el flujo público actual de Wallapop en dos pasos:

- `/api/v3/search/components`: configuración y sesión de búsqueda.
- `/api/v3/search/section`: anuncios paginados, con `distance_in_km`, precio, estado y coordenadas.
- Las fichas públicas `/item/{slug}` aportan el JSON `__NEXT_DATA__`: descripción completa, fotos, estado, atributos, disponibilidad y datos públicos del vendedor.

No se necesitan credenciales. Cerca se identifica como aplicación propia; no usa proxies rotatorios, CAPTCHA automatizado ni ocultación de identidad. No se consultan chats, pagos, direcciones privadas ni datos de cuentas autenticadas.

La consulta anterior fallaba porque usaba el endpoint antiguo sin el contexto requerido por el flujo actual. El conector nuevo se ha probado con respuestas reales HTTP 200. Si la fuente limita consultas o cambia, se muestra un error explícito. No se sustituyen resultados reales por anuncios ficticios.

El objetivo inicial es encontrar **100 productos que cumplan tus filtros**. Puedes elegir 100, 150 o 200 en **Preferencias → Objetivo de coincidencias**. Cerca alterna páginas ordenadas por relevancia y por precio, y utiliza la segunda formulación de la consulta cuando está disponible. Recuerda los anuncios ya vistos entre páginas. Los descartados, los duplicados y las fichas que no se pueden verificar no cuentan para el objetivo.

El progreso muestra los anuncios recibidos, las decisiones y las coincidencias. Cuando se alcanza el objetivo, se detienen las peticiones de páginas y fichas. Si Wallapop agota los anuncios o no permite seguir paginando, Cerca indica por qué ha terminado con menos resultados. Al cancelar, puedes seguir consultando los productos ya validados.

Se deja una separación inicial de al menos 1200 ms entre solicitudes, las búsquedas se cachean durante un minuto y las fichas durante 15 minutos. La cancelación interrumpe red e inferencia. Un 403 aislado al consultar una ficha excluye ese anuncio. Tres fichas denegadas consecutivas en un minuto detienen las peticiones pendientes. Las respuestas 429 y 503 activan hasta tres reintentos con pausas de 1, 2 y 4 minutos, ampliadas cuando Retry-After lo indica. Durante la pausa la cola de red queda detenida y puedes cancelar. Un 403 solo se reintenta automáticamente cuando el servidor proporciona Retry-After. Las denegaciones persistentes conservan el resultado parcial.

## Mapa real

La pestaña **Mapa** utiliza Leaflet y cartografía OpenStreetMap con atribución visible. Permite:

- Mover el mapa y acercar/alejar con ratón, teclado y controles.
- Ver marcadores de precio agrupados cuando se solapan, con expansión de los anuncios en una misma ubicación.
- Seleccionar anuncios desde la lista o el marcador y abrir su ficha.
- Buscar una localidad o código postal y centrar el mapa allí.
- **Elegir centro** y hacer clic en el mapa para fijar el centro de búsqueda.
- Introducir latitud/longitud manualmente desde el filtro de ubicación.
- Dibujar el radio y filtrar por distancia en línea recta, precio y estado.
- **Buscar en esta zona** para recoger anuncios nuevos alrededor del centro visible.
- **Ver todos** para encuadrar los anuncios disponibles.

El radio incluye municipios cercanos aunque su nombre no coincida con el centro elegido. La posición corresponde a las coordenadas publicadas por Wallapop. No se inventan ubicaciones de vendedores ni se presentan como domicilios exactos. Cuando la fuente indica una aproximación, se muestra como tal. Los anuncios sin coordenadas se contabilizan como no localizables y no reciben un marcador inventado.

Las localidades se consultan mediante Open-Meteo / GeoNames bajo su modalidad gratuita para uso personal no comercial. Solo se consulta al enviar una búsqueda; no hay autocompletado continuo ni geocodificación masiva. El punto del mapa también se puede seleccionar sin geocodificador.

Los mosaicos OSM se solicitan solo para la vista que el usuario está mostrando, se identifican como Cerca y utilizan la caché HTTP persistente del navegador de escritorio. No hay descargas de mapas para uso sin conexión ni precarga de regiones. La atribución y el enlace para informar de errores permanecen en el mapa.

Fuentes: [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html), [política de mosaicos OSM](https://operations.osmfoundation.org/policies/tiles/), [API de localidades Open-Meteo](https://open-meteo.com/en/docs/geocoding-api).

## Modelos locales gratuitos

| Función | Nombre instalado | Modelo original | Pesos |
| --- | --- | --- | --- |
| Interpretar peticiones complejas | `cerca-planner:9b` | Qwen3.5 9B Q4_K_M | 6,6 GB, pesos existentes |
| Aceptar o descartar anuncios | `nimble:9b-q4_K_M` | Nimble 9B Q4_K_M | 5,6 GB |
| Recuperación semántica | `qwen3-embedding:0.6b` | Qwen3 Embedding 0.6B Q8_0 | 639 MB |

Los modelos utilizados tienen licencia Apache 2.0. Qwen3.5 9B fija el objeto y los requisitos de la petición sin recibir anuncios. Cada requisito conserva un fragmento literal de la consulta. Esta interpretación se reutiliza para los candidatos de la misma consulta. Nimble compara cada anuncio con ese objetivo fijo, mediante comprobaciones separadas de identidad, requisitos y oferta. El procedimiento es idéntico para cualquier categoría.

El alias `cerca-planner:9b` reutiliza los pesos de Qwen ya instalados. La aplicación utiliza Ollama en `127.0.0.1:11434`. Los nombres, tamaños y digests están en `ai/models.lock.json`. Los modelos de instalaciones anteriores pueden conservarse.


## Alertas

Crea una alerta con producto, precio mínimo y máximo, estado, radio y fuente. Se conserva el centro geográfico elegido al crearla.

- Cada 15 minutos, mientras Cerca esté abierta, las alertas de **Wallapop en directo** vuelven a consultar anuncios nuevos y ejecutan la selección local.
- Las del catálogo importado revisan ese catálogo, sin descargar anuncios de otras fuentes.
- Solo se notifican anuncios disponibles y no reservados. Los ejemplos nunca generan notificaciones.
- El mismo producto al mismo precio no repite aviso. Un precio nuevo puede generar otro aviso.
- Una notificación fallida no se marca como entregada.
- Preferencias permite comprobar las alertas de inmediato y probar una notificación real del sistema.

Cerrar la ventana termina las comprobaciones. No se ha instalado inicio automático ni un servicio independiente. Una búsqueda y una comprobación de alertas no ejecutan inferencia simultáneamente.

## Importación y ejemplos

También puedes seleccionar **Catálogo importado** e importar un JSON desde Preferencias. `catalog/import-example.json` documenta el formato. Hasta 1000 filas y 5 MB; `title` y `price` positivo son obligatorios. Para un mapa correcto, añade `latitude` y `longitude` reales. Los anuncios importados sin foto muestran un marcador neutro; nunca una foto de otro producto.

El catálogo **De ejemplo** sigue disponible, con sus anuncios ficticios claramente identificados. Sus coordenadas no se inventan para poblar el mapa.

## Persistencia y seguridad

Favoritos, alertas, anuncios consultados y avisos se guardan mediante escritura atómica en `~/.config/Cerca/cerca-data.json` en Linux o `%APPDATA%\Cerca\cerca-data.json` en Windows. La caché HTTP de fotos y mosaicos está en el perfil de Electron.

La interfaz carga archivos locales mediante `file://`, con aislamiento de contexto, sandbox, CSP y Node.js desactivado en el renderer. El puente IPC expone operaciones específicas y valida su origen. Se permite cargar imágenes remotas únicamente de los hosts de fotos de Wallapop y de mosaicos OSM. La geocodificación, las consultas de anuncios y Ollama se gestionan desde el proceso principal. Los textos externos se escapan antes de mostrarse. El modelo no puede ejecutar comandos ni visitar enlaces.

## Optimización de latencia

- Las páginas se entregan progresivamente; el primer resultado no espera a recopilar todo el catálogo.
- Consultas literales usan un plan directo. Las peticiones complejas se interpretan con Qwen3.5 9B y los requisitos se fijan una vez con Qwen3.5 9B y cada anuncio se evalúa con Nimble.
- Se priorizan coincidencias léxicas sin indexar todos los anuncios antes de empezar. Los embeddings se usan cuando la búsqueda no tiene una coincidencia textual.
- La lectura anticipada de hasta tres fichas se solapa con la inferencia, respetando la separación de 550 ms entre peticiones. Las decisiones siguen siendo individuales y secuenciales.
- Interpretación de requisitos reutilizable por consulta y clasificación estructurada por anuncio. Permanencia de los modelos en memoria durante 15 minutos. Cerca precarga el evaluador al abrirse.
- Caché persistente de decisiones válidas durante 15 minutos, ligada a versión del criterio, modelo, anuncio, consulta, restricciones y contenido. Antes de reutilizarla se comprueban los datos actuales de la ficha según la caché de la fuente. Si cambia precio, descripción o petición, se vuelve a evaluar. Los resultados inválidos nunca se guardan como decisiones válidas.
- Escrituras agrupadas a disco y reutilización de tarjetas y filas existentes. El mapa conserva su instancia, mosaicos, zoom y formulario mientras llegan resultados y cambian los filtros. Solo se actualizan los marcadores y filas que cambian.
- Cachés de embeddings y localidades limitadas a 2048 y 256 entradas, con expulsión de las menos utilizadas. Las lecturas simultáneas de una ficha reutilizan la respuesta de la primera petición encolada.

La primera interpretación de una consulta añade una llamada local a Qwen. Las consultas repetidas reutilizan hasta 128 interpretaciones recientes. El coste por anuncio depende del equipo y de la longitud de la descripción. El primer resultado sigue apareciendo al quedar validado. `npm run benchmark:precision` mide decisiones reales en varias categorías y guarda aciertos, errores y tiempos en `test-results/general-precision.json`.

La mejora de inferencia no multiplica en la misma proporción la velocidad de Wallapop: se mantiene la separación de 550 ms entre peticiones y puede dominar el tiempo de lectura de fichas. Una repetición con datos idénticos reutiliza decisiones validadas. Las pruebas anteriores con anuncios reales están en `test-results/performance-live.json`.

```sh
node scripts/benchmark-search.js   # Catálogo fijo; datos detallados de carga, tokens y llegadas
node scripts/benchmark-live.js     # Wallapop real; primera y segunda pasada, ocho candidatos
```

El perfilado tiene un límite de ocho candidatos solo para comparar tiempos; la búsqueda normal usa el objetivo de coincidencias configurado y reintenta las decisiones inválidas hasta obtener una válida o cancelar.

## Verificación

```sh
npm run check          # Sintaxis de todos los módulos
npm test               # 67 pruebas: IA, fuentes, geografía, importación, caché, cancelación y alertas
npm run test:strict    # 38 casos con modelos reales: PS5, generaciones, juegos y accesorios
npm run test:models    # Modelos reales frente a accesorios, averías y modelos distintos
npm run test:live      # Wallapop real + fichas públicas + modelos locales
npm run test:desktop   # Aplicación nativa, búsqueda progresiva, precio mínimo/máximo, guardados, modelos y notificación real
npm run test:map       # Mapa nativo con el resultado real del test:live, galería, precios, radio y localidades
```

Los dos últimos necesitan una sesión gráfica; las búsquedas reales y modelos necesitan Ollama activo y conexión para los anuncios. `test:map` usa `test-results/live-search.json` generado por `test:live` para no repetir la búsqueda de anuncios al verificar el mapa.

La búsqueda y las fichas públicas se han verificado con anuncios reales. La comprobación de escritorio también verifica que el primer producto se ve mientras los modelos siguen procesando otros anuncios. El tiempo total depende de la carga, red, catálogo y modelos residentes; ya no se espera al final para mostrar coincidencias. La prueba del mapa verificó mosaicos reales, marcadores, galería de fotos, filtro de radio y desplazamiento a Madrid.

Las evidencias están en `test-results/` y los perfiles de prueba en `.test-data/`, ambos ignorados por Git. No se modifican los datos personales del perfil normal al ejecutar pruebas.

La revisión de código y las propuestas priorizadas están en [docs/revision-2026-11-15.md](docs/revision-2026-11-15.md).

## Compilar instaladores y publicar

```sh
npm ci
npm run dist:linux  # Linux: AppImage + DEB
npm run dist:win    # Windows: instalador NSIS
npm run test:package  # Comprobación del ejecutable empaquetado
```

Para una prueba Linux sin pantalla puede usarse `dbus-run-session -- xvfb-run -a npm run test:package`. En CI esa comprobación utiliza renderizado por software y una ventana de prueba visible en la pantalla virtual; el uso normal conserva la aceleración por GPU. Windows se compila y se prueba en Windows; Linux se compila y se prueba en Linux. El flujo **Build and release Cerca** de GitHub Actions genera ambos sistemas, prueba también la instalación silenciosa de Windows, calcula SHA-256 y publica la release únicamente cuando las dos compilaciones están verificadas. Puede ejecutarse manualmente desde Actions o al subir una etiqueta `vX.Y.Z` que coincida con `package.json` y `docs/releases/vX.Y.Z.md`.

Los paquetes contienen una lista explícita de archivos de la aplicación. Se excluyen perfiles, resultados de pruebas, consultas reales, logs, credenciales y pesos de modelos. Los avisos de los componentes distribuidos están en `THIRD_PARTY_NOTICES.md`.
