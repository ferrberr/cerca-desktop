# Cerca · Aplicación de escritorio

Aplicación de escritorio para Windows y Linux (x64, Intel/AMD de 64 bits) con ventana Electron propia, búsqueda de anuncios reales de Wallapop, selección mediante modelos locales, mapa navegable, favoritos y notificaciones nativas. No necesita un navegador abierto ni un servidor web para la interfaz.

## Descargar e instalar

Las descargas están en [GitHub Releases](https://github.com/ferrberr/cerca-desktop/releases/latest).

| Sistema | Descarga de Cerca 0.6.0 |
| --- | --- |
| Windows x64 | [Instalador EXE](https://github.com/ferrberr/cerca-desktop/releases/download/v0.6.0/Cerca-0.6.0-windows-x64-setup.exe) |
| Linux x64 | [AppImage](https://github.com/ferrberr/cerca-desktop/releases/download/v0.6.0/Cerca-0.6.0-linux-x64.AppImage) |
| Debian/Ubuntu x64 | [Paquete DEB](https://github.com/ferrberr/cerca-desktop/releases/download/v0.6.0/Cerca-0.6.0-linux-x64.deb) |

El instalador incluye Electron; no hace falta instalar Node.js. Windows permite elegir la carpeta y crea accesos directos. En Linux, el paquete DEB integra Cerca en el menú. Para AppImage:

```sh
chmod +x Cerca-0.6.0-linux-x64.AppImage
./Cerca-0.6.0-linux-x64.AppImage
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
4. Cerca empieza a procesar la primera página mientras las demás se recogen en segundo plano. Prioriza candidatos por coincidencia textual; recurre a embeddings si no hay coincidencias léxicas. Lee las fichas y decide qué anuncios encajan.
5. Los resultados se ordenan inicialmente por menor precio. Puedes ordenar por afinidad o distancia.
6. Abre un producto para ver su galería real, descripción, estado, disponibilidad, características, vendedor público, valoraciones y fecha de consulta. **Ver anuncio real** abre su página original en el navegador del sistema.

**Ver selección** muestra qué productos ha aceptado y rechazado el modelo y el motivo asociado a su categoría de decisión. Se aplican únicamente restricciones explícitas: no se supone un tamaño, RAM o color que no hayas indicado. Un equipo completo con una funda incluida no se trata automáticamente como un anuncio que vende solo una funda.

### Coincidencias estrictas

Se exige que el objeto vendido sea el producto solicitado, con su modelo/generación y todos los requisitos explícitos confirmados. Una relación de compatibilidad o una marca compartida no bastan. Las decisiones `match` con probabilidad interna inferior a 0,90 se descartan por falta de certeza; ese umbral no es una probabilidad de acierto calibrada. Los requisitos no especificados (RAM, almacenamiento, color, etc.) siguen siendo libres.

Los alias `play 5`, `PS5` y `PlayStation 5` se normalizan también en las consultas a la fuente y en los textos comparados por el modelo. Para una consola PlayStation con generación explícita se comprueba además la identidad con reglas: PS4 con cinco juegos no es PS5, y un mando, juego o caja para PS5 no es una consola PS5. Los anuncios con generación desconocida no se aceptan por suposición. Si se buscan expresamente juegos o mandos, se evalúa ese objeto. Un pack que sí incluye la consola puede incluir juegos y accesorios.

La IA recibe la descripción disponible completa, sin recortarla a 1200 caracteres. Si falla la lectura de la ficha pública, ese anuncio se excluye de la selección. Un cambio de precio, modelo, descripción o estado invalida la decisión anterior; una decisión nueva validada se conserva.

Cada descarte por identidad indica su causa y no se atribuye falsamente a una inferencia del modelo. La nueva versión de criterio invalida las claves de caché anteriores. Las pruebas de integración están en `test-results/strict-matching.json`; el conjunto de 38 casos combina coincidencias válidas, descartes y búsquedas explícitas de accesorios. La regresión general de 52 casos se guarda en `test-results/strict-general-regression.json`.

### Acceso a los anuncios

Se usa el flujo público actual de Wallapop en dos pasos:

- `/api/v3/search/components`: configuración y sesión de búsqueda.
- `/api/v3/search/section`: anuncios paginados, con `distance_in_km`, precio, estado y coordenadas.
- Las fichas públicas `/item/{slug}` aportan el JSON `__NEXT_DATA__`: descripción completa, fotos, estado, atributos, disponibilidad y datos públicos del vendedor.

No se necesitan credenciales. Cerca se identifica como aplicación propia; no usa proxies rotatorios, CAPTCHA automatizado ni ocultación de identidad. No se consultan chats, pagos, direcciones privadas ni datos de cuentas autenticadas.

La consulta anterior fallaba porque usaba el endpoint antiguo sin el contexto requerido por el flujo actual. El conector nuevo se ha probado con respuestas reales HTTP 200. Si la fuente limita consultas o cambia, se muestra un error explícito. No se sustituyen resultados reales por anuncios ficticios.

**Es una búsqueda acotada, no un inventario completo de todo Wallapop.** Se consultan hasta dos variantes y dos órdenes de resultados, con límites de páginas. Preferencias ofrece búsqueda rápida, normal o amplia (1, 2 o 4 páginas por consulta/orden). Los candidatos se evalúan individualmente hasta agotar los anuncios recogidos o alcanzar 200 coincidencias aceptadas. Se anticipa la lectura de hasta tres fichas, sin aumentar la frecuencia de solicitudes a Wallapop; cada decisión espera a los datos de su propia ficha y cada coincidencia aparece inmediatamente, sin esperar al resto. El máximo de 200 también se aplica a cuadrícula, mapa y guardados. Los anuncios descartados no consumen ese límite.

Se deja una separación de al menos 550 ms entre solicitudes, las búsquedas se cachean durante un minuto y las fichas durante 15 minutos. La cancelación interrumpe red e inferencia. Los códigos 403 y 429 detienen el proceso; no hay bucles de reintentos para evadir límites.

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

Los modelos utilizados tienen licencia Apache 2.0. Nimble es un modelo especializado en decisiones: se usa mediante `/v1/systemone` con una clasificación tipada, sin generar explicaciones palabra por palabra. Se ha elegido por su precisión en la comparación local: 51/52 casos frente a 50/52 de Tev1 0.8B y 49/52 de Tev1 4B. Esta muestra no garantiza resultados perfectos en otros anuncios. Las categorías distinguen producto compatible, accesorio, modelo distinto, avería y requisito ausente.

Qwen3.5 se conserva para interpretar peticiones complejas; las búsquedas literales no necesitan esa llamada. El alias `cerca-planner:9b` reutiliza los pesos de Qwen ya instalados. La aplicación utiliza Ollama exclusivamente en `127.0.0.1:11434`, sin claves ni suscripciones. El asistente no elimina otros modelos de Ollama. Los nombres, tamaños y digests están en `ai/models.lock.json`. La API tipada requiere una versión de Ollama compatible con decisiones (verificada aquí con 0.40.15). Fuentes: [Nimble](https://ollama.com/library/nimble:9b-q4_K_M) y [API de decisiones de Ollama](https://docs.ollama.com/capabilities/decision).

```sh
npm run models:status
npm run models:install
```

La inferencia es local. La búsqueda de anuncios, las fotos y la cartografía necesitan Internet. Los modelos pueden equivocarse: la afinidad de 0 a 100 es una valoración del modelo, no una probabilidad calibrada. Los filtros de presupuesto, radio, disponibilidad y estado se ejecutan también con código determinista. Si una decisión llega incompleta, con JSON inválido, identificador inventado o campos fuera de rango, se repite el mismo anuncio hasta obtener una decisión válida, sin límite de intentos. Se valida la categoría, las probabilidades y su normalización antes de publicar cada resultado. Los reintentos admiten cancelación durante la espera. Los fallos de red o la ausencia de Ollama se muestran como errores; no se confunden con una decisión inválida. Los resultados ya validados permanecen visibles al cancelar o ante un error posterior.

El precio mínimo y máximo se aplican de forma inclusiva a la consulta de la fuente, la validación local, la cuadrícula, el mapa y las alertas. Un mínimo vacío equivale a 0; el máximo vacío en el filtro general elimina el límite superior. Un rango con mínimo mayor que máximo se rechaza. Los límites explícitos escritos en la búsqueda se combinan con los de la interfaz usando el rango más estricto.

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
- Consultas literales usan un plan directo. Las peticiones complejas se interpretan con Qwen3.5 9B y los anuncios se clasifican con Nimble 9B.
- Se priorizan coincidencias léxicas sin indexar todos los anuncios antes de empezar. Los embeddings se usan cuando la búsqueda no tiene una coincidencia textual.
- La lectura anticipada de hasta tres fichas se solapa con la inferencia, respetando la separación de 550 ms entre peticiones. Las decisiones siguen siendo individuales y secuenciales.
- Clasificación tipada en lugar de generación de JSON y explicaciones por anuncio. Permanencia del modelo en memoria de 15 minutos. Cerca precarga Nimble al abrirse. No se han cambiado controladores ni la configuración global de Ollama.
- Caché persistente de decisiones válidas durante 15 minutos, ligada a versión del criterio, modelo, anuncio, consulta, restricciones y contenido. Antes de reutilizarla se comprueban los datos actuales de la ficha según la caché de la fuente. Si cambia precio, descripción o petición, se vuelve a evaluar. Los resultados inválidos nunca se guardan como decisiones válidas.
- Escrituras agrupadas a disco y reutilización de tarjetas y filas existentes. El mapa conserva su instancia, mosaicos, zoom y formulario mientras llegan resultados y cambian los filtros. Solo se actualizan los marcadores y filas que cambian.
- Cachés de embeddings y localidades limitadas a 2048 y 256 entradas, con expulsión de las menos utilizadas. Las lecturas simultáneas de una ficha reutilizan la respuesta de la primera petición encolada.

En la comparación de 52 casos, Nimble tuvo una mediana de 298 ms por decisión con el modelo cargado, frente a aproximadamente 1,5 s por anuncio del anterior decisor Qwen. En el catálogo fijo de ocho anuncios, la nueva integración mostró la primera coincidencia a los 362 ms y terminó en 2,84 s sin reutilizar decisiones. Evidencias: `test-results/decision-model-comparison.json` y `test-results/performance-nimble.json`. Los tiempos dependen del hardware y la carga; esta medición excluye descargas de anuncios y arranca con Nimble en memoria. Las referencias anteriores de 6,3 s hasta el primer resultado y 16,4 s totales incluían cargar Qwen, por lo que no son una comparación exclusiva de inferencia.

La mejora de inferencia no multiplica en la misma proporción la velocidad de Wallapop: se mantiene la separación de 550 ms entre peticiones y puede dominar el tiempo de lectura de fichas. Una repetición con datos idénticos reutiliza decisiones validadas. Las pruebas anteriores con anuncios reales están en `test-results/performance-live.json`.

```sh
node scripts/benchmark-search.js   # Catálogo fijo; datos detallados de carga, tokens y llegadas
node scripts/benchmark-live.js     # Wallapop real; primera y segunda pasada, ocho candidatos
```

El perfilado tiene un límite de ocho candidatos solo para comparar tiempos; la aplicación conserva el límite de 200 coincidencias, los descartes y los reintentos ilimitados de respuestas inválidas.

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

Para una prueba Linux sin pantalla puede usarse `xvfb-run -a npm run test:package`. Windows se compila y se prueba en Windows; Linux se compila y se prueba en Linux. El flujo **Build and release Cerca** de GitHub Actions genera ambos sistemas, prueba también la instalación silenciosa de Windows, calcula SHA-256 y publica la release únicamente cuando las dos compilaciones están verificadas. Puede ejecutarse manualmente desde Actions o al subir una etiqueta `vX.Y.Z` que coincida con `package.json` y `docs/releases/vX.Y.Z.md`.

Los paquetes contienen una lista explícita de archivos de la aplicación. Se excluyen perfiles, resultados de pruebas, consultas reales, logs, credenciales y pesos de modelos. Los avisos de los componentes distribuidos están en `THIRD_PARTY_NOTICES.md`.
