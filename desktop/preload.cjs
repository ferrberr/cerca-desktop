const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('cercaDesktop', {
  bootstrap: () => ipcRenderer.invoke('cerca:bootstrap'),
  mapInfo: kind => ipcRenderer.invoke('cerca:map-info',kind),
  geocode: query => ipcRenderer.invoke('cerca:geocode',query),
  detail: (id,options) => ipcRenderer.invoke('cerca:detail',id,options),
  health: () => ipcRenderer.invoke('cerca:health'),
  openSupport: kind => ipcRenderer.invoke('cerca:support',kind),
  installModels: () => ipcRenderer.invoke('cerca:install-models'),
  cancelModels: () => ipcRenderer.invoke('cerca:cancel-models'),
  onModelProgress: callback => {const listener=(_event,update)=>callback(update);ipcRenderer.on('cerca:model-progress',listener);return ()=>ipcRenderer.removeListener('cerca:model-progress',listener);},
  search: request => ipcRenderer.invoke('cerca:search', request),
  cancelSearch: () => ipcRenderer.invoke('cerca:cancel'),
  setPreference: (key, value) => ipcRenderer.invoke('cerca:preference', key, value),
  importCatalog: () => ipcRenderer.invoke('cerca:import'),
  openListing: id => ipcRenderer.invoke('cerca:open-listing', id),
  openLocation: id => ipcRenderer.invoke('cerca:open-location', id),
  openSearch: query => ipcRenderer.invoke('cerca:open-search', query),
  checkAlerts: () => ipcRenderer.invoke('cerca:check-alerts'),
  testNotification: () => ipcRenderer.invoke('cerca:test-notification'),
  windowAction: action => ipcRenderer.invoke('cerca:window', action),
  onSearchUpdate: callback => {
    const listener=(_event,update)=>callback(update);
    ipcRenderer.on('cerca:search-update',listener);
    return ()=>ipcRenderer.removeListener('cerca:search-update',listener);
  },
  onProgress: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('cerca:progress', listener);
    return () => ipcRenderer.removeListener('cerca:progress', listener);
  },
});
