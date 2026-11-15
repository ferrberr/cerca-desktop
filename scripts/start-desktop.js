import {spawn, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
let binary=process.env.CERCA_ELECTRON;
if(!binary&&existsSync(path.join(root,'node_modules/electron/package.json')))binary=require('electron');
if(!binary){
 const choices=process.platform==='win32'?['electron.exe']:['/usr/bin/electron42','/usr/bin/electron','electron'];
 binary=choices.find(value=>value.startsWith('/')?existsSync(value):spawnSync(process.platform==='win32'?'where':'which',[value]).status===0);
}
if(!binary){console.error('Electron no está instalado. Ejecuta npm install o utiliza el instalador de Cerca.');process.exit(1);}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(binary,[root,...process.argv.slice(2)],{stdio:'inherit',env});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
