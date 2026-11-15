import fs from 'node:fs/promises';
import {Resvg} from '@resvg/resvg-js';
const svg=await fs.readFile(new URL('../assets/favicon.svg',import.meta.url),'utf8');
await fs.mkdir('build',{recursive:true});
const render=size=>new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();
await fs.writeFile('build/icon.png',render(512));
// An ICO directory can contain a PNG-compressed 256px image.
const png=render(256),header=Buffer.alloc(22);
header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);
header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
await fs.writeFile('build/icon.ico',Buffer.concat([header,png]));
console.log('Iconos de Cerca generados desde el SVG original.');
