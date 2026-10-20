import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {setTimeout as delay} from 'node:timers/promises';
// NSIS completes removal of the product before its temporary helper releases
// directory handles. A transient root-directory EPERM is not retried by every
// fs.rm path on Windows. Require verified removal within a bounded deadline.
export async function removeOwnedInstallation(directory,{timeout=60000,retryDelay=500,remove=fs.rm,inspect=fs.lstat,wait=delay,now=Date.now}={}){
 const root=path.resolve(os.tmpdir()),target=path.resolve(directory);if(path.dirname(target)!==root||!/^pa-installer-validation-[a-zA-Z0-9]{6}$/.test(path.basename(target)))throw Error('Cleanup requires the recorded disposable installer directory.');
 const deadline=now()+timeout;let last;
 while(true){
  try{const stat=await inspect(target);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Installer cleanup target is not an owned directory.');await remove(target,{recursive:true,force:true,maxRetries:0});try{await inspect(target);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error('Installer directory still exists after cleanup.');}
  catch(error){if(error.code==='ENOENT')return;if(!['EPERM','EACCES','EBUSY','ENOTEMPTY'].includes(error.code))throw error;last=error;}
  if(now()>=deadline)throw new Error('Installer cleanup did not release its directory within the deadline.',{cause:last});await wait(Math.min(retryDelay,deadline-now()));
 }
}
