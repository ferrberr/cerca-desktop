import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {publishRelease} from '../scripts/publish-release.js';
const version='0.6.0',sha='a'.repeat(40);
const names=[`Cerca-${version}-windows-x64-setup.exe`,`Cerca-${version}-linux-x64.AppImage`,`Cerca-${version}-linux-x64.deb`];
async function setup(run){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cerca-release-'));try{for(const name of names)await fs.writeFile(path.join(directory,name),'Test artifact: '+name);await run(directory);}finally{await fs.rm(directory,{recursive:true,force:true});}}
function mock({failUpload=false,published=false}={}){
 const actions=[],assets=[];let created=false,finalized=false;
 const fetchImpl=async(input,options={})=>{
  const url=new URL(input),method=options.method||'GET';actions.push([method,url.pathname]);
  if(url.hostname==='uploads.github.com'){
   if(failUpload)return new Response(null,{status:500});
   const data=Buffer.from(options.body),name=url.searchParams.get('name');assets.push({name,state:'uploaded',size:data.length,digest:'sha256:'+createHash('sha256').update(data).digest('hex')});return Response.json({id:assets.length},{status:201});
  }
  if(url.pathname.includes('/releases/tags/'))return published?Response.json({id:1,draft:false,target_commitish:sha}):new Response(null,{status:404});
  if(url.pathname.endsWith('/releases')&&method==='GET')return Response.json([]);
  if(url.pathname.includes('/git/ref/'))return new Response(null,{status:404});
  if(url.pathname.endsWith('/releases')&&method==='POST'){const body=JSON.parse(options.body);assert.equal(body.draft,true);created=true;return Response.json({id:1,draft:true,target_commitish:sha,upload_url:'https://uploads.github.com/repos/owner/cerca/releases/1/assets{?name,label}'});}
  if(url.pathname.endsWith('/assets'))return Response.json(assets);
  if(method==='PATCH'){assert.equal(assets.length,4);finalized=true;return Response.json({html_url:'https://github.com/owner/cerca/releases/tag/v0.6.0'});}
  throw new Error('Unexpected request '+url);
 };
 return {fetchImpl,actions,get created(){return created;},get finalized(){return finalized;}};
}
const options=(directory,fetchImpl)=>({token:'test-token',repository:'owner/cerca',sha,version,notes:'Test release',directory,fetchImpl});
test('release publication verifies both platforms, uploads SHA256 checksums and publishes only when complete',async()=>setup(async directory=>{const remote=mock();await publishRelease(options(directory,remote.fetchImpl));assert.equal(remote.finalized,true);const sums=await fs.readFile(path.join(directory,'SHA256SUMS'),'utf8');for(const name of names)assert.ok(sums.includes(name));assert.equal(remote.actions.at(-1)[0],'PATCH');}));
test('a missing platform artifact stops release creation before any network write',async()=>setup(async directory=>{await fs.rm(path.join(directory,names[0]));const remote=mock();await assert.rejects(publishRelease(options(directory,remote.fetchImpl)));assert.equal(remote.actions.length,0);}));
test('a failed binary upload leaves the release unpublished',async()=>setup(async directory=>{const remote=mock({failUpload:true});await assert.rejects(publishRelease(options(directory,remote.fetchImpl)),/No se pudo subir/);assert.equal(remote.created,true);assert.equal(remote.finalized,false);}));
test('an existing published release is never overwritten',async()=>setup(async directory=>{const remote=mock({published:true});await assert.rejects(publishRelease(options(directory,remote.fetchImpl)),/ya está publicada/);assert.equal(remote.created,false);assert.equal(remote.finalized,false);}));
