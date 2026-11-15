import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export async function publishRelease({token,repository,sha,directory='dist',version,notes,fetchImpl=fetch}){
 if(!token||!/^[-\w.]+\/[-\w.]+$/.test(repository||'')||!/^[a-f0-9]{40}$/.test(sha||'')||!/^\d+\.\d+\.\d+$/.test(version||''))throw new Error('Faltan datos válidos para publicar la release.');
 const required=[`Cerca-${version}-windows-x64-setup.exe`,`Cerca-${version}-linux-x64.AppImage`,`Cerca-${version}-linux-x64.deb`];
 const files=await Promise.all(required.map(async name=>{const data=await fs.readFile(path.join(directory,name));if(!data.length)throw new Error('Artefacto vacío: '+name);return{name,data,digest:createHash('sha256').update(data).digest('hex')};}));
 const checksums=Buffer.from(files.map(file=>`${file.digest}  ${file.name}`).join('\n')+'\n');
 await fs.writeFile(path.join(directory,'SHA256SUMS'),checksums);
 files.push({name:'SHA256SUMS',data:checksums,digest:createHash('sha256').update(checksums).digest('hex')});
 const request=async(endpoint,{method='GET',body}={})=>{
  const response=await fetchImpl(`https://api.github.com/repos/${repository}${endpoint}`,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(response.status===404&&method==='GET')return null;
  if(!response.ok)throw new Error(`GitHub respondió ${response.status} en ${endpoint}`);
  return response.status===204?null:response.json();
 };
 const tag=`v${version}`;
 let release=await request(`/releases/tags/${tag}`);
 if(!release){const releases=await request('/releases?per_page=100');release=releases?.find(item=>item.tag_name===tag)||null;}
 if(release&&!release.draft)throw new Error('La versión ya está publicada; incrementa la versión para publicar otro contenido.');
 if(release&&release.target_commitish!==sha)throw new Error('La release pendiente pertenece a otra revisión. No se sobrescribe.');
 if(!release){
  const ref=await request(`/git/ref/tags/${tag}`);
  if(ref&&ref.object.sha!==sha)throw new Error('La etiqueta ya apunta a otra revisión. No se sobrescribe.');
  release=await request('/releases',{method:'POST',body:{tag_name:tag,target_commitish:sha,name:`Cerca ${version}`,body:notes,draft:true,prerelease:false}});
 }
 const uploaded=await request(`/releases/${release.id}/assets?per_page=100`);
 const uploadURL=new URL(release.upload_url.replace(/\{.*$/,''));
 if(uploadURL.origin!=='https://uploads.github.com')throw new Error('Destino de subida de GitHub no válido.');
 for(const file of files){
  const existing=uploaded.find(asset=>asset.name===file.name);
  if(existing){if(existing.digest===`sha256:${file.digest}`&&existing.state==='uploaded')continue;throw new Error(`El archivo ${file.name} ya existe con contenido diferente. No se sobrescribe.`);}
  const url=new URL(uploadURL);url.searchParams.set('name',file.name);
  const response=await fetchImpl(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/octet-stream'},body:file.data});
  if(!response.ok)throw new Error(`No se pudo subir ${file.name}: ${response.status}`);
 }
 const assets=await request(`/releases/${release.id}/assets?per_page=100`);
 if(files.some(file=>!assets.some(asset=>asset.name===file.name&&asset.state==='uploaded'&&asset.size===file.data.length)))throw new Error('No se han confirmado todos los archivos. La release se conserva como borrador.');
 const published=await request(`/releases/${release.id}`,{method:'PATCH',body:{draft:false,make_latest:'true'}});
 console.log(`Cerca publicada: ${published.html_url}`);
 return published;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {version}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
 if(process.env.GITHUB_REF_TYPE==='tag'&&process.env.GITHUB_REF_NAME!==`v${version}`)throw new Error('La etiqueta no coincide con la versión de package.json.');
 const notes=await fs.readFile(new URL(`../docs/releases/v${version}.md`,import.meta.url),'utf8');
 await publishRelease({token:process.env.GITHUB_TOKEN,repository:process.env.GITHUB_REPOSITORY,sha:process.env.GITHUB_SHA,version,notes});
}
