import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {CompleteRuntime} from '../../desktop/src/complete-runtime.mjs';import {commandRunner} from '../../desktop/src/local-runtime.mjs';import {WslInstaller} from '../../desktop/src/wsl-installer.mjs';import {ManagedRuntimeHost} from '../../desktop/src/managed-runtime-host.mjs';
export async function cloudServiceRuntime({temporary,specs,onStatus}){
 if(process.env.CI!=='true'||!['linux','win32'].includes(process.platform))throw Error('Disposable service runner required.');
 if(process.platform==='linux'){const docker=execFileSync('which',['docker'],{encoding:'utf8'}).trim(),run=commandRunner(docker),options={specs,run,runCompose:(args,options)=>run(['compose',...args],options),onStatus};return {run,runtime:new CompleteRuntime({...options,directory:path.join(temporary,'source')}),restored:new CompleteRuntime({...options,directory:path.join(temporary,'restored')}),closeGuest:async()=>{}};}
 if(process.env.PA_OWN_VM_ACCEPTANCE!=='1')throw Error('Actual private WSL acceptance must be explicitly enabled.');
 const directory=path.join(temporary,'control'),mountRoot=path.join(temporary,'shared'),installer=new WslInstaller({directory,mountRoot,onProgress:detail=>{if(!detail.includes('%'))console.log('WSL',detail);}}),host=new ManagedRuntimeHost({installer,sharedDirectory:mountRoot,onStatus});
 const prerequisite=await installer.prerequisites();if(!prerequisite.available){await installer.installPrerequisites();if(!(await installer.prerequisites()).available)throw Error('The disposable runner requires Windows features/restart before actual WSL acceptance.');}
 try{await host.connection();}catch(error){await installer.stop().catch(()=>{});throw error;}
 const file=path.join(temporary,'guest-qa.json');fs.writeFileSync(file,JSON.stringify({version:1,directory,mountRoot,owner:installer.identity.owner})+'\n',{mode:0o600});process.env.PA_DESKTOP_TEST_GUEST_CONFIG=file;
 return {run:(args,options)=>host.run(args,options),runtime:host.create({profileId:'legacy',specs}),restored:host.create({profileId:crypto.randomBytes(16).toString('hex'),specs}),closeGuest:async()=>{delete process.env.PA_DESKTOP_TEST_GUEST_CONFIG;await host.stop();}};
}
