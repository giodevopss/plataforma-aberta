import fs from 'node:fs/promises';import path from 'node:path';import {UnifiedBackup} from './unified-backup.mjs';import {RuntimeBackup} from './runtime-backup.mjs';import {Workspace} from './storage.mjs';
// Restoring never mutates the current profile. The target factory must produce
// an independent browser, runtime, workspace and registered native providers.
export class UnifiedRestore {
 constructor({stagingDirectory,createTarget,ids}){this.stagingDirectory=path.resolve(stagingDirectory);this.createTarget=createTarget;this.ids=ids;this.busy=false;}
 async prepare({source,passphrase}){
  if(this.busy)throw Error('Uma restauração já está em andamento.');this.busy=true;let stage,target,success=false,primary;
  try{
   await fs.mkdir(this.stagingDirectory,{recursive:true,mode:0o700});stage=await fs.mkdtemp(path.join(this.stagingDirectory,'restore-'));const snapshot=path.join(stage,'authenticated');
   const manifest=await UnifiedBackup.verify({source,passphrase,directory:snapshot});const nativeIds=new Set();for(const record of manifest.native){if(!/^[a-z][a-z0-9-]+$/.test(record.id)||nativeIds.has(record.id))throw Error('Aplicativo nativo ausente ou duplicado no snapshot.');nativeIds.add(record.id);}
   target=await this.createTarget(manifest);if(!target?.directory||!target.runtime||!target.browser||!Array.isArray(target.native)||typeof target.verify!=='function'||typeof target.dispose!=='function'||typeof target.rollback!=='function'||typeof target.markVerified!=='function')throw Error('Destino sem contrato completo de restauração.');
   const destination=path.resolve(target.directory);if(source===destination||this.stagingDirectory===destination||this.stagingDirectory.startsWith(destination+path.sep)||destination.startsWith(stage+path.sep))throw Error('Destino da restauração não está isolado.');
   const providers=new Map();for(const provider of target.native){if(providers.has(provider.id)||typeof provider.restoreIntoEmpty!=='function'||typeof provider.freeze!=='function'||typeof provider.resume!=='function')throw Error('Provider nativo inválido.');providers.set(provider.id,provider);}for(const id of nativeIds)if(!providers.has(id))throw Error('Aplicativo nativo incompatível no snapshot: '+id);
   const checks=['Encrypted archive authenticated; every payload verified'];
   const workspace=await Workspace.restoreSnapshotIntoEmpty({source:path.join(snapshot,'workspace'),destination:path.join(destination,'workspace'),ids:this.ids});if(workspace.files!==manifest.workspace.files)throw Error('Inventário do espaço diverge do snapshot.');checks.push('Consistent SQLite documents, revision history and byte-identical immutable originals restored');
   await new RuntimeBackup(target.runtime).restoreIntoEmpty({snapshot,manifest});checks.push('Managed local service data restored into an independent runtime identity');
   await target.browser.restoreFrom(path.join(snapshot,'browser'));checks.push('Original typed Graphite metadata, preferences and OPFS restored into an independent browser profile');
   for(const record of manifest.native){const provider=providers.get(record.id);await provider.freeze();try{await provider.restoreIntoEmpty(path.join(snapshot,'native',record.id),record);}finally{await provider.resume();}}checks.push('All registered native data and model caches restored into fresh owned locations');
   const evidence=await target.verify(manifest);if(!Array.isArray(evidence)||!evidence.length||evidence.some(item=>typeof item!=='string'||!item))throw Error('A restauração exige validação dos aplicativos originais.');checks.push(...evidence);
   await target.dispose();await target.markVerified(checks);success=true;return {id:target.id,directory:destination,checks,applications:manifest.applications,native:[...nativeIds]};
  }catch(error){primary=error;throw error;}finally{
   const failures=[];if(target&&!success){await target.dispose?.().catch(error=>failures.push(error));await target.rollback?.().catch(error=>failures.push(error));}if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(error=>failures.push(error));this.busy=false;if(failures.length)throw new AggregateError([...(primary?[primary]:[]),...failures],'Os dados ativos foram preservados, mas a limpeza do destino de recuperação falhou.');
  }
 }
}
