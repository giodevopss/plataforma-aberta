import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Runs only in a blank, trusted page of the suite's own isolated browser partition.
// The editor must already be flushed and unloaded. Host payload names are opaque,
// so POSIX OPFS names never become Windows/macOS filesystem paths.
export async function browserStorageOperation(operation,input={}){
 const valid=segments=>{if(!Array.isArray(segments)||segments.length>128||segments.some(s=>typeof s!=='string'||!s||s==='.'||s==='..'||s.includes('/')||s.includes('\0')))throw Error('Invalid browser storage path');return segments;};
 const encode=(value,ancestors=new Set())=>{
  if(value===undefined)return ['undefined'];if(value===null)return ['null'];if(typeof value==='bigint')return ['bigint',String(value)];if(['string','boolean'].includes(typeof value))return [typeof value,value];if(typeof value==='number')return ['number',Number.isFinite(value)?value:String(value)];
  if(typeof value!=='object'||ancestors.has(value))throw Error('Unsupported or cyclic Graphite state; backup stopped without deleting data');const next=new Set(ancestors);next.add(value);
  if(Array.isArray(value))return ['array',value.map(v=>encode(v,next))];if(value instanceof Date)return ['date',value.toISOString()];if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('Unsupported Graphite state object; backup stopped without deleting data');return ['object',Object.entries(value).map(([key,v])=>[key,encode(v,next)])];
 };
 const decode=value=>{if(!Array.isArray(value))throw Error('Invalid Graphite value');const [type,data]=value;switch(type){case 'undefined':return undefined;case 'null':return null;case 'bigint':return BigInt(data);case 'string':if(typeof data!=='string')break;return data;case 'boolean':if(typeof data!=='boolean')break;return data;case 'number':if(typeof data==='number')return data;if(['NaN','Infinity','-Infinity'].includes(data))return Number(data);break;case 'date':return new Date(data);case 'array':return data.map(decode);case 'object':return Object.fromEntries(data.map(([key,v])=>[key,decode(v)]));}throw Error('Invalid encoded Graphite state');};
 const open=(name,version,upgrade)=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade?.(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Browser database still open; close the editor before restoring'));});
 const root=await navigator.storage.getDirectory();
 const directory=async(segments,create=false)=>{let current=root;for(const name of valid(segments))current=await current.getDirectoryHandle(name,{create});return current;};
 if(operation==='describe'){
  const entries=[];async function walk(dir,segments){for await(const [name,handle]of dir.entries()){const parts=[...segments,name];valid(parts);if(handle.kind==='directory'){entries.push({kind:'directory',path:parts});await walk(handle,parts);}else{const file=await handle.getFile();entries.push({kind:'file',path:parts,size:file.size});}}}await walk(root,[]);
  const databases=[];for(const dbInfo of await indexedDB.databases()){
   if(dbInfo.name!=='graphite')continue;const db=await open(dbInfo.name,dbInfo.version),stores=[];
   try{for(const name of db.objectStoreNames){const tx=db.transaction(name),store=tx.objectStore(name),records=[];const indexes=Array.from(store.indexNames).map(n=>{const i=store.index(n);return {name:n,keyPath:i.keyPath,unique:i.unique,multiEntry:i.multiEntry};});await new Promise((resolve,reject)=>{const r=store.openCursor();r.onsuccess=()=>{try{const cursor=r.result;if(!cursor)return;records.push({key:encode(cursor.key),value:encode(cursor.value)});cursor.continue();}catch(e){tx.abort();reject(e);}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Graphite metadata export aborted'));});stores.push({name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes,records});}}finally{db.close();}databases.push({name:dbInfo.name,version:dbInfo.version,stores});
  }return {format:1,databases,entries,localStorage:Object.entries(localStorage)};
 }
 if(operation==='read'){
  const parts=valid(input.path),dir=await directory(parts.slice(0,-1)),file=await(await dir.getFileHandle(parts.at(-1))).getFile();if(!Number.isSafeInteger(input.offset)||input.offset<0||!Number.isInteger(input.length)||input.length<1||input.length>1048576)throw Error('Invalid browser read range');const bytes=new Uint8Array(await file.slice(input.offset,input.offset+input.length).arrayBuffer());if(bytes.toBase64)return bytes.toBase64();let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);
 }
 if(operation==='restore-metadata'){
  const m=input.manifest;if(m?.format!==1||!Array.isArray(m.databases)||!Array.isArray(m.entries)||!Array.isArray(m.localStorage))throw Error('Invalid browser snapshot');if((await indexedDB.databases()).some(db=>db.name==='graphite'))throw Error('Restore requires empty Graphite browser storage');for await(const _entry of root.entries())throw Error('Restore requires empty OPFS storage');
  for(const entry of m.entries)if(entry.kind==='directory')await directory(valid(entry.path),true);
  for(const item of m.databases){if(item.name!=='graphite'||!Number.isInteger(item.version)||item.version<1)throw Error('Invalid browser database');const db=await open(item.name,item.version,db=>{for(const store of item.stores){const object=db.createObjectStore(store.name,{keyPath:store.keyPath,autoIncrement:store.autoIncrement});for(const index of store.indexes)object.createIndex(index.name,index.keyPath,{unique:index.unique,multiEntry:index.multiEntry});}});try{for(const store of item.stores){const tx=db.transaction(store.name,'readwrite'),object=tx.objectStore(store.name);const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Graphite metadata import aborted'));});for(const record of store.records){if(store.keyPath===null)object.put(decode(record.value),decode(record.key));else object.put(decode(record.value));}await done;}}finally{db.close();}}
  for(const [key,value]of m.localStorage){if(typeof key!=='string'||typeof value!=='string')throw Error('Invalid local preference');localStorage.setItem(key,value);}return true;
 }
 if(operation==='write-begin'){
  const parts=valid(input.path),dir=await directory(parts.slice(0,-1),true),file=await dir.getFileHandle(parts.at(-1),{create:true}),writer=await file.createWritable();const id=crypto.randomUUID();(globalThis.__paStorageWriters??=new Map()).set(id,writer);return id;
 }
 if(['write-chunk','write-end','write-abort'].includes(operation)){
  const writers=globalThis.__paStorageWriters,writer=writers?.get(input.id);if(!writer)throw Error('Unknown browser storage writer');
  if(operation==='write-end'||operation==='write-abort'){try{await writer[operation==='write-end'?'close':'abort']();}finally{writers.delete(input.id);}return true;}
  if(!Number.isSafeInteger(input.offset)||input.offset<0||typeof input.base64!=='string'||input.base64.length>1398104||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw Error('Invalid browser write chunk');const bytes=Uint8Array.fromBase64?Uint8Array.fromBase64(input.base64):Uint8Array.from(atob(input.base64),char=>char.charCodeAt(0));if(bytes.length>1048576)throw Error('Browser chunk exceeds 1 MB');await writer.write({type:'write',position:input.offset,data:bytes});return true;
 }
 throw Error('Unknown browser storage operation');
}
export class BrowserStorageSnapshot {
 constructor(execute,{timeout=120000}={}){this.execute=execute;this.timeout=timeout;}
 async call(operation,input){let timer;try{return await Promise.race([this.execute('('+browserStorageOperation.toString()+')('+JSON.stringify(operation)+','+JSON.stringify(input||{})+')'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser storage operation timed out: '+operation)),this.timeout);})]);}finally{clearTimeout(timer);}}
 async exportInto(destination){
  await fs.mkdir(path.join(destination,'files'),{recursive:true,mode:0o700});const manifest=await this.call('describe');let sequence=0;
  for(const entry of manifest.entries){if(entry.kind!=='file')continue;if(!Number.isSafeInteger(entry.size)||entry.size<0)throw Error('Invalid OPFS file size');entry.payload='files/'+String(++sequence).padStart(8,'0')+'.bin';const file=await fs.open(path.join(destination,entry.payload),'wx',0o600),hash=crypto.createHash('sha256');try{for(let offset=0;offset<entry.size;){const bytes=Buffer.from(await this.call('read',{path:entry.path,offset,length:Math.min(1048576,entry.size-offset)}),'base64');if(!bytes.length||bytes.length>entry.size-offset)throw Error('OPFS file changed during backup');await file.writeFile(bytes);hash.update(bytes);offset+=bytes.length;}await file.sync();}finally{await file.close();}entry.sha256=hash.digest('hex');}
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest)+'\n',{mode:0o600});return {files:sequence,databases:manifest.databases.length};
 }
 async restoreFrom(source){
  const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));if(manifest.format!==1||!Array.isArray(manifest.entries))throw Error('Invalid browser snapshot');const seen=new Set();
  // Authenticate every payload before making any writes to the empty browser target.
  for(const entry of manifest.entries){if(entry.kind!=='file')continue;if(!/^files\/[0-9]{8}\.bin$/.test(entry.payload)||seen.has(entry.payload)||!/^[a-f0-9]{64}$/.test(entry.sha256)||!Number.isSafeInteger(entry.size)||entry.size<0)throw Error('Invalid browser payload');seen.add(entry.payload);const filename=path.join(source,entry.payload),stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.size)throw Error('Invalid browser payload size/type');const file=await fs.open(filename,'r'),hash=crypto.createHash('sha256');try{for await(const bytes of file.createReadStream())hash.update(bytes);}finally{await file.close();}if(hash.digest('hex')!==entry.sha256)throw Error('Browser payload checksum differs');}
  await this.call('restore-metadata',{manifest});
  for(const entry of manifest.entries){if(entry.kind!=='file')continue;const file=await fs.open(path.join(source,entry.payload),'r');let id;try{id=await this.call('write-begin',{path:entry.path});for(let offset=0;offset<entry.size;){const bytes=Buffer.alloc(Math.min(1048576,entry.size-offset)),{bytesRead}=await file.read(bytes,0,bytes.length,offset);if(bytesRead!==bytes.length)throw Error('Browser payload truncated');await this.call('write-chunk',{id,offset,base64:bytes.toString('base64')});offset+=bytesRead;}await this.call('write-end',{id});id=null;}finally{if(id)await this.call('write-abort',{id}).catch(()=>{});await file.close();}}
  return {files:seen.size,databases:manifest.databases.length};
 }
}
