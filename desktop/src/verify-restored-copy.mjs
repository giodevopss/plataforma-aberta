import path from 'node:path';
import {RuntimeBackup} from './runtime-backup.mjs';
import {verifyManagedApplications} from './verify-managed-applications.mjs';

// Restored workers may contain schedules and provider credentials. Only an
// isolated sacrificial copy is started before explicit profile activation.
export async function verifyRestoredCopy({profileStore,createRuntime,snapshot,manifest,restore=async(runtime,value)=>new RuntimeBackup(runtime).restoreIntoEmpty(value),verify=verifyManagedApplications}){
 if(!manifest.applications.length)return [];
 const copy=profileStore.create();let runtime,primary,checks;
 try{
  runtime=createRuntime(path.join(copy.directory,'applications'));
  runtime.enableVerification();
  await restore(runtime,{snapshot,manifest});
  checks=await verify(runtime,manifest.applications);
 }catch(error){primary=error;}
 try{
  if(runtime){if(!runtime.verificationMode)throw Error('Cópia de verificação sem isolamento; dados preservados para diagnóstico.');await runtime.destroyVerification();}
  profileStore.discard(copy.id);
 }catch(error){throw new AggregateError([...(primary?[primary]:[]),error],'A cópia de verificação foi preservada porque sua limpeza não pôde ser confirmada.');}
 if(primary)throw primary;
 return [...checks,'Original restored services verified in a disposable isolated copy; activation candidate data never started or modified by verification'];
}
