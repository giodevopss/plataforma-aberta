import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {BrowserWindow,session} from 'electron';
import {BrowserStorageSnapshot} from './browser-storage.mjs';
import {UnifiedBackup} from './unified-backup.mjs';
import {UnifiedRestore} from './unified-restore.mjs';
import {NativeAppLauncher} from './native-app-launcher.mjs';
import {startService} from './service.mjs';
import {verifyManagedApplications} from './verify-managed-applications.mjs';

export const profilePartition=id=>id==='legacy'?'persist:plataforma-suite':'persist:plataforma-suite-'+id;
export function nativeForProfile({directory,resources,id='openwhispr',nativeResources=path.join(resources,'native'),extension=path.join(resources,'screenity-extension'),onStatus}){
 const manifestFile=path.join(nativeResources,id,'native-launcher.json');
 return new NativeAppLauncher({id,extension,directory:path.join(directory,'native'),resources:path.join(nativeResources,id),manifest:fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):null,onStatus});
}
function configureLocalSession(partition,origin,token){
 const isolated=session.fromPartition(partition);
 isolated.webRequest.onBeforeSendHeaders((details,callback)=>{const url=new URL(details.url);if(url.origin===origin)callback({requestHeaders:{...details.requestHeaders,'X-PA-Session':token}});else callback({cancel:!['devtools:','blob:','data:'].includes(url.protocol)});});
 isolated.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 return isolated;
}
async function openBridge({partition,origin}){
 const window=new BrowserWindow({show:false,webPreferences:{partition,contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
 try{await window.loadURL(origin+'/shell/storage-bridge.html');return {window,browser:new BrowserStorageSnapshot(script=>window.webContents.executeJavaScript(script))};}catch(error){window.destroy();throw error;}
}
export class DesktopRecovery {
 constructor({profileStore,active,service,runtime,native,screenity,nativeOptions={},resources,ids,createRuntime,quiesce,resume}){Object.assign(this,{profileStore,active,service,runtime,native,screenity,nativeOptions,resources,ids,createRuntime,quiesce,resume});this.busy=false;this.stagingDirectory=path.join(profileStore.root,'recovery-staging');}
 async save({destination,passphrase}){
  if(this.busy)throw Error('Aguarde a operação de recuperação atual.');this.busy=true;let bridge;
  try{
   const browser={exportInto:async directory=>{bridge=await openBridge({partition:profilePartition(this.active.id),origin:this.service.origin});return bridge.browser.exportInto(directory);}};
   const backup=new UnifiedBackup({runtime:this.runtime,workspace:this.service.workspace,browser,native:[this.native,...(this.screenity?[this.screenity]:[])].map(manager=>manager.provider()),stagingDirectory:this.stagingDirectory,quiesce:async()=>{const state=await this.quiesce();try{await this.service.pauseWrites();return state;}catch(error){await this.resume(state);throw error;}},resume:async state=>{this.service.resumeWrites();await this.resume(state);}});
   return await backup.save({destination,passphrase});
  }finally{bridge?.window.destroy();this.busy=false;}
 }
 async prepare({source,passphrase}){
  if(this.busy)throw Error('Aguarde a operação de recuperação atual.');this.busy=true;
  try{
   const restore=new UnifiedRestore({stagingDirectory:this.stagingDirectory,ids:this.ids,createTarget:async manifest=>{
    const candidate=this.profileStore.create(),runtime=this.createRuntime(path.join(candidate.directory,'applications')),native=nativeForProfile({directory:candidate.directory,resources:this.resources,...this.nativeOptions}),screenity=nativeForProfile({id:'screenity',directory:candidate.directory,resources:this.resources,...this.nativeOptions});let targetService,bridge,isolated;
    const ensureBridge=async()=>{
     if(bridge)return bridge;
     const token=crypto.randomBytes(32).toString('hex');targetService=await startService({resources:this.resources,directory:path.join(candidate.directory,'workspace'),token});isolated=configureLocalSession(profilePartition(candidate.id),targetService.origin,token);
     const settings=path.join(candidate.directory,'settings');fs.mkdirSync(settings,{recursive:true,mode:0o700});fs.writeFileSync(path.join(settings,'desktop-port.json'),JSON.stringify({port:Number(new URL(targetService.origin).port)})+'\n',{mode:0o600});bridge=await openBridge({partition:profilePartition(candidate.id),origin:targetService.origin});return bridge;
    };
    return {...candidate,runtime,native:[native.provider(),screenity.provider()],browser:{restoreFrom:async directory=>(await ensureBridge()).browser.restoreFrom(directory)},verify:async()=>{
     const checks=['Consistent workspace restored into a new profile; active workspace preserved'];
     const original=await ensureBridge();const state=await original.browser.call('describe');
     if(state.databases.some(db=>db.stores.some(store=>store.records.length))){
      await original.window.loadURL(targetService.origin+'/graphite/');
      const result=await original.window.webContents.executeJavaScript('(async()=>{const deadline=Date.now()+60000;while(typeof window.suiteDocument?.flush!=="function"){if(Date.now()>deadline)throw Error("Original Graphite did not initialize in restored profile");await new Promise(resolve=>setTimeout(resolve,100));}await window.suiteDocument.flush();return true;})()');if(result!==true)throw Error('O editor original não confirmou a recuperação.');checks.push('Original complete Graphite engine opens and confirms restored document persistence');
     }
     checks.push(...await verifyManagedApplications(runtime,manifest.applications));
     return checks;
    },dispose:async()=>{await runtime.close();bridge?.window.destroy();bridge=null;await isolated?.flushStorageData();await targetService?.close();targetService=null;},markVerified:checks=>this.profileStore.markVerified(candidate.id,checks),rollback:async()=>{
     // Keep a failed candidate if it owns service volumes; deleting only its
     // directory would orphan recovery data. It can never become active.
     if(!manifest.applications.length&&!manifest.native.some(record=>record.installed))this.profileStore.discard(candidate.id);
    }};
   }});
   return await restore.prepare({source,passphrase});
  }finally{this.busy=false;}
 }
 activate(id){if(this.busy)throw Error('Aguarde a operação de recuperação atual.');return this.profileStore.activate(id,{expectedActive:this.active.id});}
}
