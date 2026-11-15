import fs from 'node:fs';
import path from 'node:path';
export class SearchCache {
 constructor({file=null,now=Date.now,maxEntries=2000}={}){this.file=file;this.now=now;this.maxEntries=maxEntries;this.entries=new Map();if(file){try{const data=JSON.parse(fs.readFileSync(file,'utf8'));for(const [key,value]of data.entries||[])if(value.until>this.now())this.entries.set(key,value);}catch{}}}
 get(key){const item=this.entries.get(key);if(!item||item.until<=this.now()){this.entries.delete(key);return undefined;}return item.value;}
 set(key,value,ttl=15*60_000){this.entries.delete(key);this.entries.set(key,{value,until:this.now()+ttl});while(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value);if(this.file&&!this.timer){this.timer=setTimeout(()=>this.flush(),500);this.timer.unref();}}
 flush(){clearTimeout(this.timer);this.timer=null;if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({entries:[...this.entries]}),{mode:0o600});fs.renameSync(tmp,this.file);}
}
