import fs from 'node:fs/promises';
import path from 'node:path';
export async function runPackageSmoke(window,root,app){
 let report;
 try{
  if(process.env.CI==='true')window.showInactive();
  const ui=await window.webContents.executeJavaScript(`(async()=>{
   await window.cercaReady;
   const bootstrap=await window.cercaDesktop.bootstrap();
   if(!bootstrap.ok)throw new Error(bootstrap.error);
   if(typeof window.require!=='undefined')throw new Error('Renderer sin aislamiento');
   if(!window.L?.map||!window.L?.markerClusterGroup)throw new Error('Faltan las librerías locales del mapa');
   if(document.styleSheets.length<3)throw new Error('No se han cargado los estilos incluidos');
   document.querySelector('#settings-button').click();
   const target=document.querySelector('#match-target');
   if(target?.value!=='100'||Array.from(target.options,option=>option.value).join(',')!=='100,150,200')throw new Error('Faltan los objetivos de 100, 150 y 200 coincidencias');
   if(!document.querySelector('#configure-models'))throw new Error('Falta la configuración multiplataforma de IA');
   document.querySelector('#configure-models').click();
   if(!document.querySelector('#install-local-models')||!document.querySelector('#get-ollama'))throw new Error('Falta el asistente de modelos');
   document.querySelector('#close-modal').click();
   document.querySelector('#price-filter').click();
   document.querySelector('#price-form input[name="min"]').value='200';
   document.querySelector('#price-form input[name="max"]').value='500';
   document.querySelector('#price-form').requestSubmit();
   if(!document.querySelector('#price-label').textContent.includes('200'))throw new Error('No funciona el filtro de precio mínimo');
   return {isolated:true,mapLibraries:true,styles:true,modelSetup:true,minimumPrice:true,matchTargets:true,title:document.title,url:location.href,appInfo:bootstrap.value.appInfo};
  })()`);
  await fs.access(path.join(root,'desktop/preload.cjs'));
  await fs.access(path.join(root,'catalog/demo.json'));
  report={ok:true,packaged:app.isPackaged,platform:process.platform,arch:process.arch,electron:process.versions.electron,version:app.getVersion(),profile:app.getPath('userData'),ui};
  await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  if(process.env.CERCA_PACKAGE_SCREENSHOT)await fs.writeFile(process.env.CERCA_PACKAGE_SCREENSHOT,(await window.webContents.capturePage()).toPNG());
 }catch(error){report={ok:false,error:error.message};}
 if(process.env.CERCA_PACKAGE_SMOKE_REPORT)await fs.writeFile(process.env.CERCA_PACKAGE_SMOKE_REPORT,JSON.stringify(report,null,2));
 console.log('CERCA_PACKAGE_SMOKE',JSON.stringify(report));
 app.exit(report.ok?0:1);
}
