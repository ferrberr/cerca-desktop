import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const files=['app.js','map.js',...['ai','shared','providers','desktop','scripts','test'].flatMap(dir=>fs.readdirSync(dir).filter(name=>/\.(js|cjs)$/.test(name)).map(name=>path.join(dir,name)))];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log(`Sintaxis correcta: ${files.length} archivos.`);
