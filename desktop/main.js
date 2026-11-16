import {installModels} from '../ai/install.js';
import {app, BrowserWindow, Menu, ipcMain, dialog, shell, Notification} from 'electron';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {priceRange} from '../shared/prices.js';
import {SearchCache} from '../ai/search-cache.js';
import {SearchEngine} from '../ai/engine.js';
import {Store} from './store.js';
import {validateCatalog} from './catalog.js';
import {MODELS,MODEL_LABELS} from '../ai/config.js';
import {WallapopProvider} from '../providers/wallapop.js';
import {Geocoder} from '../providers/geocoding.js';
import {DEFAULT_CENTER,validCoordinates} from '../shared/geo.js';
import {SearchService} from './search-service.js';
import {notifyNewMatches} from './alert-matches.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = pathToFileURL(path.join(root, 'index.html')).href;
app.setName('Cerca');
if(process.platform==='linux')app.setDesktopName('cerca.desktop');
if(process.platform==='win32')app.setAppUserModelId('com.ferrberr.cerca');
const packageSmoke=process.argv.includes('--package-smoke-test');
// CI runners have no physical GPU; exercise the regular software renderer in that test only.
if(packageSmoke&&process.env.CI==='true'&&process.platform==='linux')app.disableHardwareAcceleration();
const mapSmoke=!app.isPackaged&&process.argv.includes('--map-smoke-test');
const smoke=packageSmoke||!app.isPackaged&&process.argv.includes('--smoke-test')||mapSmoke;
if(smoke)app.setPath('userData',packageSmoke?path.join(app.getPath('temp'),'cerca-package-'+process.pid+'-'+Date.now()):path.join(root,'.test-data',String(Date.now())));
let window, store, catalog, service, controller, checking = false, interval;
let modelInstallController=null;
let shuttingDown = false;
const engine = new SearchEngine();
const provider=new WallapopProvider();
const geocoder=new Geocoder();

function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== entry) throw new Error('Origen no permitido.');
    try { return {ok: true, value: await handler(...args)}; }
    catch (error) { return {ok: false, error: error.message || 'No se pudo completar la operación.'}; }
  });
}
function notify(title, body) {
  if (!Notification.isSupported()) throw new Error('Las notificaciones no están disponibles en esta sesión.');
  const notification = new Notification({title, body, icon: path.join(root, 'assets/icon.png')});
  notification.on('click', () => {window?.show(); window?.focus();});
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('El escritorio no ha confirmado la notificación.')),8000);
    notification.once('show',()=>{clearTimeout(timer);resolve(true);});
    notification.once('failed',(_event,error)=>{clearTimeout(timer);reject(new Error(String(error||'El escritorio ha rechazado la notificación.')));});
    notification.show();
  });
}
function constraints(input = {}) {
  return {
    ...priceRange(input),
    condition: ['Cualquiera','Nuevo','Como nuevo','Buen estado','Aceptable','Para piezas'].includes(input.condition) ? input.condition : 'Cualquiera',
    radius: Number.isFinite(input.radius) && input.radius >= 1 && input.radius <= 500 ? input.radius : 50,
    zone: typeof input.zone==='string'&&input.zone.length<=150?input.zone:'Barcelona',
    center:input.center&&validCoordinates(input.center.latitude,input.center.longitude)?{latitude:input.center.latitude,longitude:input.center.longitude,label:String(input.center.label||'Zona del mapa').slice(0,150)}:store.data.preferences['cerca-center']||DEFAULT_CENTER,
    source: typeof input.source === 'string' && input.source.length < 100 ? input.source : 'Todos',
  };
}
function activeDataset(){return store.data.preferences['cerca-dataset']||'live';}
async function checkAlerts() {
  if (checking || controller || modelInstallController) throw new Error('Hay una búsqueda en curso. Espera a que termine.');
  if((store.data.preferences['cerca-alerts']||[]).filter(a=>a.enabled).every(a=>(a.dataset||activeDataset())==='demo')&&activeDataset()==='demo')throw new Error('No se notifican productos de demostración. Activa la búsqueda real o el catálogo importado.');
  checking = true;
  let count = 0;
  try {
    for (const alert of (store.data.preferences['cerca-alerts'] || []).filter(a => a.enabled)) {
      if (shuttingDown) break;
      controller = new AbortController();
      const dataset=alert.dataset||activeDataset();
      if(dataset==='demo')continue;
      const result = await service.search(alert.query,constraints({minPrice:alert.minPrice??0,maxPrice:alert.price,condition:alert.condition,radius:alert.radius,zone:alert.zone,center:alert.center}),dataset,{signal:controller.signal});
      count+=await notifyNewMatches(alert,result.items,store,notify);
      if(result.sourceError)return {count,sourceError:result.sourceError};
    }
    return {count};
  } finally {controller = null; checking = false;}
}

async function createWindow() {
  window = new BrowserWindow({
    title: 'Cerca', width: 1440, height: 960, minWidth: 850, minHeight: 650,
    backgroundColor: '#141518', icon: path.join(root, 'assets/icon.png'),
    frame: false, show: false,
    webPreferences: {preload: path.join(root, 'desktop/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true},
  });
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    let allowed=true;
    if(/^https?:/i.test(details.url)){
      const url=new URL(details.url);
      allowed=details.resourceType==='image'&&url.protocol==='https:'&&!url.username&&!url.password&&((url.hostname==='tile.openstreetmap.org'&&/^\/\d{1,2}\/\d+\/\d+\.png$/.test(url.pathname))||(url.hostname==='cdn.wallapop.com'&&url.pathname.startsWith('/images/')));
    }
    callback({cancel:!allowed});
  });
  window.webContents.session.webRequest.onBeforeSendHeaders((details,callback)=>{if(new URL(details.url).hostname==='tile.openstreetmap.org'){details.requestHeaders['User-Agent']='Cerca/0.3 (Linux desktop product finder)';delete details.requestHeaders['Cache-Control'];delete details.requestHeaders['Pragma'];}callback({requestHeaders:details.requestHeaders});});
  window.once('ready-to-show', () => {if (!smoke) window.show();});
  window.on('closed', () => {window = null;});
  await window.loadFile(path.join(root, 'index.html'));
  if(process.argv.includes('--initial-search')&&!smoke){
    window.webContents.executeJavaScript("(async()=>{await window.cercaReady;document.querySelector('#search-form').requestSubmit();const r=await window.cercaLastSearch;return r?{accepted:r.items.length,rejected:r.rejected.length,total:r.total,source:r.source,durationMs:r.durationMs}:null;})()").then(async result=>{
      if(!result)throw new Error('La búsqueda inicial no ha terminado correctamente.');
      await window.webContents.executeJavaScript(`(async()=>{await Promise.all([...document.images].filter(img=>img.getBoundingClientRect().top<innerHeight).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{const timer=setTimeout(resolve,12000);const done=()=>{clearTimeout(timer);resolve();};img.addEventListener('load',done,{once:true});img.addEventListener('error',done,{once:true});})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()`);
      await fs.mkdir(path.join(root,'test-results'),{recursive:true});
      await fs.writeFile(path.join(root,'test-results/initial-search.json'),JSON.stringify(result,null,2));
      const image=await window.webContents.capturePage();await fs.writeFile(path.join(root,'test-results/live-desktop.png'),image.toPNG());
      console.log('CERCA_INITIAL_SEARCH_DONE',JSON.stringify(result));
    }).catch(error=>console.error('CERCA_INITIAL_SEARCH_FAILED',error));
  }
  if(packageSmoke){const {runPackageSmoke}=await import('./package-smoke.js');await runPackageSmoke(window,root,app);}
  else if(smoke){const tests=await import('./smoke-tests.js');await (mapSmoke?tests.runMapSmoke:tests.runSmoke)(window,root,app);}
}


if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {window?.show();window?.focus();});
  app.whenReady().then(async () => {
    try {
      Menu.setApplicationMenu(null);
      store = new Store(app.getPath('userData'));
      engine.cache=new SearchCache({file:path.join(app.getPath('userData'),'inference-cache.json')});
      catalog = JSON.parse(await fs.readFile(path.join(root, 'catalog/demo.json'), 'utf8'));
      service=new SearchService({engine,provider,store,demo:catalog});
      if(mapSmoke){const sample=JSON.parse(await fs.readFile(path.join(root,'test-results/live-search.json'),'utf8'));store.data.live=sample.items.map(p=>({...p,accepted:true}));store.data.preferences['cerca-dataset']='live';}
      else if(smoke&&!packageSmoke){
       store.data.preferences['cerca-dataset']='demo';
       const cases=JSON.parse(await fs.readFile(path.join(root,'test/fixtures/strict-matching.json'),'utf8'));
       store.data.imported=cases.filter(c=>c.request==='play 5 consola').map((c,index)=>({...c.listing,id:8000+index,price:200,condition:'Buen estado',source:'Prueba local',latitude:DEFAULT_CENTER.latitude,longitude:DEFAULT_CENTER.longitude,distance:0,city:'Barcelona'}));
      }
      handle('cerca:bootstrap', () => ({preferences: store.data.preferences, products: service.allProducts(), models: MODELS, modelLabels:MODEL_LABELS, catalogCount:store.data.imported.length,appInfo:{version:app.getVersion(),platform:process.platform,packaged:app.isPackaged,testing:smoke}}));
      handle('cerca:geocode',query=>geocoder.search(query));
      handle('cerca:map-info',kind=>{const url={copyright:'https://www.openstreetmap.org/copyright',issue:'https://www.openstreetmap.org/fixthemap'}[kind];if(!url)throw new Error('Enlace de mapa no válido.');return shell.openExternal(url);});
      handle('cerca:detail',(id,options={})=>service.detail(id,{center:constraints(options).center,force:options.force===true}));
      handle('cerca:health', () => engine.ollama.health());
      handle('cerca:support',kind=>{
        const url={ollama:process.platform==='win32'?'https://ollama.com/download/windows':'https://ollama.com/download/linux',releases:'https://github.com/ferrberr/cerca-desktop/releases/latest'}[kind];
        if(!url)throw new Error('Enlace de ayuda no válido.');
        return shell.openExternal(url);
      });
      handle('cerca:install-models',async()=>{
        if(controller||checking||modelInstallController)throw new Error('Espera a que termine la operación en curso.');
        modelInstallController=new AbortController();
        try{return await installModels(engine.ollama,{signal:modelInstallController.signal,onProgress:update=>window?.webContents.send('cerca:model-progress',update)});}
        finally{modelInstallController=null;}
      });
      handle('cerca:cancel-models',()=>{modelInstallController?.abort();return true;});
      handle('cerca:search', async request => {
        if (controller || checking || modelInstallController) throw new Error('Hay otra búsqueda en curso.');
        if (!request || typeof request.query !== 'string') throw new Error('Búsqueda inválida.');
        controller = new AbortController();
        try {
          return await service.search(request.query, constraints(request.constraints), activeDataset(), {
            signal: controller.signal, onProgress: message => window?.webContents.send('cerca:progress', message),
            onUpdate: update => window?.webContents.send('cerca:search-update',{...update,searchId:request.searchId}),
          });
        } catch (error) {
          if (controller.signal.aborted) throw new Error('Búsqueda cancelada.');
          throw error;
        } finally {controller = null;}
      });
      handle('cerca:cancel', () => {controller?.abort();return true;});
      handle('cerca:preference', (key, value) => store.setPreference(key, value));
      handle('cerca:import', async () => {
        if (controller || checking || modelInstallController) throw new Error('Espera a que termine la búsqueda antes de importar.');
        const result = await dialog.showOpenDialog(window, {title:'Importar anuncios', filters:[{name:'Catálogo JSON', extensions:['json']}], properties:['openFile']});
        if (result.canceled) return null;
        const file = result.filePaths[0];
        if ((await fs.stat(file)).size > 5 * 1024 * 1024) throw new Error('El catálogo no puede superar 5 MB.');
        const imported = validateCatalog(JSON.parse(await fs.readFile(file, 'utf8')));
        store.data.imported = imported;
        store.data.preferences['cerca-dataset'] = 'imported';
        store.flush();
        return {products:[...catalog, ...imported], count:imported.length};
      });
      handle('cerca:open-listing', async id => {
        const item = service.allProducts().find(p => p.id === id);
        if (!item?.url || !item.url.startsWith('https://')) throw new Error('Este anuncio no tiene un enlace real.');
        await shell.openExternal(item.url);
      });
      handle('cerca:open-location', async id => {
        const item=service.allProducts().find(p=>p.id===id);
        if(!item || item.latitude===null || item.longitude===null)throw new Error('El anuncio no incluye coordenadas.');
        await shell.openExternal(`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=15/${item.latitude}/${item.longitude}`);
      });
      handle('cerca:open-search', async query => {
        if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Búsqueda inválida.');
        const url = new URL('https://es.wallapop.com/search');
        url.searchParams.set('keywords', query);
        await shell.openExternal(url.href);
      });
      handle('cerca:check-alerts', checkAlerts);
      handle('cerca:test-notification', () => notify('Cerca', 'Las notificaciones de escritorio están listas.'));
      handle('cerca:window', action => {
        if (action === 'close') window.close();
        else if (action === 'minimize') window.minimize();
        else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
      });
      await createWindow();
      if(!smoke)engine.ollama.warmup().catch(error=>console.warn('Precarga de IA:',error.message));
      if (!smoke) interval = setInterval(() => {
        if ((store.data.preferences['cerca-alerts']||[]).some(a=>a.enabled&&(a.dataset||activeDataset())!=='demo') && !controller && !checking && !modelInstallController) checkAlerts().catch(error => console.warn('Alertas:', error.message));
      }, 15 * 60 * 1000);
    } catch (error) {console.error(error);dialog.showErrorBox('Cerca', error.message);app.exit(1);}
  });
}
app.on('activate', () => {if (!window && store) createWindow();});
app.on('before-quit', () => {engine.cache.flush();store?.flush();shuttingDown = true;modelInstallController?.abort();controller?.abort();clearInterval(interval);});
app.on('window-all-closed', () => app.quit());

