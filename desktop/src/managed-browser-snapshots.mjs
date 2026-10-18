import fs from 'node:fs/promises';
import path from 'node:path';
import {modulePartition} from './module-partition.mjs';

function ownOrigin(value) {
 const address=new URL(value);
 if(address.protocol!=='http:'||address.hostname!=='127.0.0.1'||!address.port||address.pathname!=='/'||address.search||address.hash||address.username||address.password)throw Error('Origem de aplicativo inválida no backup.');
 return address.origin;
}
export function validateManagedBrowserInventory(metadata,applications) {
 if(metadata?.version!==1||!Array.isArray(metadata.applications)||metadata.applications.length!==applications.length)throw Error('Inventário dos navegadores incompleto.');
 if(applications.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(id))||new Set(applications).size!==applications.length)throw Error('Identidades dos aplicativos inválidas.');
 const remaining=new Set(applications);
 for(const record of metadata.applications){if(!remaining.delete(record.id)||!record.browser||record.browser.version!==1||!Number.isSafeInteger(record.cookies)||record.cookies<0||record.cookies>10000)throw Error('Navegador de aplicativo ausente ou duplicado.');ownOrigin(record.origin);}
 if(remaining.size)throw Error('Dados locais do navegador ausentes no backup.');
}
export function portableCookie(cookie,origin) {
 ownOrigin(origin);
 if(typeof cookie.name!=='string'||typeof cookie.value!=='string'||!['127.0.0.1','.127.0.0.1'].includes(cookie.domain)||typeof cookie.path!=='string'||!cookie.path.startsWith('/')||/[\r\n\0]/.test(cookie.path)||!['unspecified','no_restriction','lax','strict'].includes(cookie.sameSite)||typeof cookie.secure!=='boolean'||typeof cookie.httpOnly!=='boolean'||(cookie.expirationDate!==undefined&&!Number.isFinite(cookie.expirationDate))||cookie.partitionKey)throw Error('Cookie local incompatível no backup.');
 if(cookie.name==='pa_session')return null;
 return {url:origin,name:cookie.name,value:cookie.value,path:cookie.path,secure:cookie.secure,httpOnly:cookie.httpOnly,sameSite:cookie.sameSite,...(cookie.hostOnly===false?{domain:cookie.domain}:{}),...(cookie.expirationDate!==undefined?{expirationDate:cookie.expirationDate}:{})};
}

// Each session is closed by the UI coordinator before entering this provider.
// The bridge runs a trusted offline page; servers and application scripts do
// not run while IndexedDB, OPFS, preferences and account cookies are copied.
export class ManagedBrowserSnapshots {
 constructor({runtime,profileId,openBridge}){Object.assign(this,{runtime,profileId,openBridge});}
 async origin(id){
  if(!this.runtime.specs.has(id))throw Error('Aplicativo de navegador desconhecido.');
  const file=path.join(this.runtime.directory,id,'runtime.json'),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw Error('Configuração de navegador inválida.');
  const settings=JSON.parse(await fs.readFile(file,'utf8'));
  if(!Number.isInteger(settings.port)||settings.port<1024||settings.port>65535)throw Error('Porta de aplicativo inválida.');
  return 'http://127.0.0.1:'+settings.port;
 }
 async exportInto(destination,applications){
  const records=[];await fs.mkdir(destination,{recursive:true,mode:0o700});
  if((await fs.readdir(destination)).length)throw Error('Snapshot de navegadores exige uma pasta nova.');
  for(const id of applications){
   const origin=await this.origin(id),directory=path.join(destination,id);await fs.mkdir(directory,{mode:0o700});
   const bridge=await this.openBridge({partition:modulePartition(this.profileId,id),origin});
   try{
    const cookies=(await bridge.session.cookies.get({url:origin})).filter(cookie=>cookie.name!=='pa_session');
    if(cookies.length>10000)throw Error('Inventário de cookies excessivo.');for(const cookie of cookies)portableCookie(cookie,origin);
    const browser=await bridge.browser.exportInto(path.join(directory,'storage'));
    await fs.writeFile(path.join(directory,'cookies.json'),JSON.stringify(cookies)+'\n',{mode:0o600,flag:'wx'});
    records.push({id,origin,browser,cookies:cookies.length});
   }finally{await bridge.dispose();}
  }
  const metadata={version:1,applications:records};validateManagedBrowserInventory(metadata,applications);return metadata;
 }
 async restoreFrom(source,metadata,applications){
  validateManagedBrowserInventory(metadata,applications);const planned=[];
  // Check cookies and the original origin inventories before opening a target.
  for(const record of metadata.applications){
   const directory=path.join(source,record.id),file=path.join(directory,'cookies.json'),stat=await fs.lstat(file);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16777216)throw Error('Inventário de cookies inválido.');
   const cookies=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(cookies)||cookies.length!==record.cookies)throw Error('Cookies incompletos no backup.');
   const origin=await this.origin(record.id),portable=cookies.map(cookie=>portableCookie(cookie,origin));
   if(portable.some(cookie=>cookie===null))throw Error('Token antigo do gateway no backup de navegador.');
   const inventory=path.join(directory,'storage','manifest.json'),header=await fs.lstat(inventory);
   if(!header.isFile()||header.isSymbolicLink()||header.size>67108864)throw Error('Inventário local de navegador inválido.');
   if(JSON.parse(await fs.readFile(inventory,'utf8')).origin!==record.origin)throw Error('A origem original do navegador diverge do inventário.');
   planned.push({record,directory,origin,cookies:portable});
  }
  for(const item of planned){
   const bridge=await this.openBridge({partition:modulePartition(this.profileId,item.record.id),origin:item.origin});
   try{
    if((await bridge.session.cookies.get({url:item.origin})).length)throw Error('A recuperação exige cookies de destino vazios.');
    const result=await bridge.browser.restoreFrom(path.join(item.directory,'storage'));
    if(result.records!==item.record.browser.records||result.files!==item.record.browser.files||result.databases!==item.record.browser.databases)throw Error('Inventário do navegador restaurado diverge do original.');
    for(const cookie of item.cookies)if(cookie.expirationDate===undefined||cookie.expirationDate>Date.now()/1000)await bridge.session.cookies.set(cookie);
   }finally{await bridge.dispose();}
  }
  return metadata.applications.map(record=>record.id);
 }
}
