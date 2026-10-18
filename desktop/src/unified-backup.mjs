import fs from 'node:fs/promises';
import path from 'node:path';
import {RuntimeBackup} from './runtime-backup.mjs';
import {writeArchive,readArchive} from './backup-archive.mjs';

// Product coordination is explicit: no raw copy of live Chromium databases or
// live native SQLite profiles. Every provider must flush/close before snapshot.
export class UnifiedBackup {
 constructor({runtime,workspace,browser,native=[],quiesce,resume,stagingDirectory}){
  this.runtime=runtime;this.workspace=workspace;this.browser=browser;this.native=native;this.quiesce=quiesce;this.resume=resume;this.stagingDirectory=path.resolve(stagingDirectory);for(const original of [runtime.directory,workspace.directory]){const resolved=path.resolve(original);if(this.stagingDirectory===resolved||this.stagingDirectory.startsWith(resolved+path.sep))throw Error('O staging do backup deve ficar fora dos dados copiados.');}this.busy=false;
 }
 async save({destination,passphrase}){
  if(this.busy)throw Error('Um backup já está em andamento.');if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)throw Error('Use uma senha de backup com pelo menos 12 caracteres.');this.busy=true;
  let stage,releaseUI,uiFrozen=false,primaryError;const frozen=[];let runtimeFrozen=false;const manager=new RuntimeBackup(this.runtime);
  try{
   await fs.mkdir(this.stagingDirectory,{recursive:true,mode:0o700});stage=await fs.mkdtemp(path.join(this.stagingDirectory,'snapshot-'));
   if(typeof this.quiesce!=='function'||typeof this.resume!=='function')throw Error('A gravação dos editores deve ser coordenada antes do backup.');releaseUI=await this.quiesce();uiFrozen=true;
   for(const provider of this.native){if(!/^[a-z][a-z0-9-]+$/.test(provider.id)||typeof provider.freeze!=='function'||typeof provider.snapshot!=='function'||typeof provider.resume!=='function')throw Error('Aplicativo nativo sem contrato de backup.');await provider.freeze();frozen.push(provider);}
   await manager.freeze();runtimeFrozen=true;
   const metadata=await manager.snapshot(stage);metadata.workspace=await this.workspace.snapshotTo(path.join(stage,'workspace'));metadata.browser=await this.browser.exportInto(path.join(stage,'browser'));metadata.native=[];
   for(const provider of this.native){const record=await provider.snapshot(path.join(stage,'native',provider.id));metadata.native.push({id:provider.id,...record});}
   metadata.productSnapshotVersion=1;metadata.scope='Persisted workspace, original Graphite IndexedDB/OPFS, installed managed local service data and registered native providers';
   // Compression/encryption do not require keeping writers paused once the
   // consistent private staging snapshot has been materialized.
   await manager.resume();runtimeFrozen=false;while(frozen.length){await frozen.at(-1).resume();frozen.pop();}await this.resume(releaseUI);uiFrozen=false;
   return await writeArchive({directory:stage,destination,passphrase,metadata});
  }catch(error){primaryError=error;throw error;}finally{
   const failures=[];if(runtimeFrozen)await manager.resume().catch(error=>failures.push(error));for(const provider of frozen.reverse())await provider.resume().catch(error=>failures.push(error));if(uiFrozen)await this.resume(releaseUI).catch(error=>failures.push(error));try{if(stage)await fs.rm(stage,{recursive:true,force:true});}catch(error){failures.push(error);}this.busy=false;if(failures.length)throw new AggregateError([...(primaryError?[primaryError]:[]),...failures],'Os dados originais foram preservados, mas a operação de backup ou retomada falhou.');
  }
 }
 static async verify({source,passphrase,directory}){
  const manifest=await readArchive({source,passphrase,directory});if(manifest.productSnapshotVersion!==1||manifest.workspace?.version!==1||!manifest.browser||!Array.isArray(manifest.native))throw Error('Este arquivo não contém um snapshot unificado do produto.');return manifest;
 }
}
