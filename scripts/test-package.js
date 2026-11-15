import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const binary=path.resolve(process.argv[2]||(process.platform==='win32'?'dist/win-unpacked/cerca.exe':'dist/linux-unpacked/cerca'));
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'cerca-package-test-'));
const reportFile=path.join(temporary,'report.json');
await fs.mkdir('dist',{recursive:true});
const env={...process.env,CERCA_PACKAGE_SMOKE_REPORT:reportFile,CERCA_PACKAGE_SCREENSHOT:path.resolve(`dist/package-smoke-${process.platform}.png`)};
delete env.ELECTRON_RUN_AS_NODE;
try{
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(binary,['--package-smoke-test'],{env,stdio:'inherit'});
  const timer=setTimeout(()=>{child.kill();reject(new Error('El paquete no inició correctamente en 90 segundos.'));},90000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',code=>{clearTimeout(timer);resolve(code);});
 });
 const report=JSON.parse(await fs.readFile(reportFile,'utf8'));
 if(result!==0||!report.ok||!report.packaged)throw new Error(`El paquete no supera la comprobación: ${JSON.stringify(report)}`);
 await fs.writeFile(`dist/package-smoke-${process.platform}.json`,JSON.stringify(report,null,2));
 console.log(`CERCA_PACKAGE_OK ${report.platform} ${report.arch} ${report.version} · Electron ${report.electron}`);
 if(report.profile&&path.dirname(report.profile)===os.tmpdir()&&path.basename(report.profile).startsWith('cerca-package-'))await fs.rm(report.profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}finally{await fs.rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
