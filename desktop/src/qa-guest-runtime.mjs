import fs from 'node:fs';import path from 'node:path';import {WslInstaller} from './wsl-installer.mjs';import {ManagedRuntimeHost} from './managed-runtime-host.mjs';
// An attached QA shell borrows the parent test's guest transport. Its lifetime
// is owned by that parent, which stops the actual disposable distro at the end.
export function borrowedQAGuest(file,{specs,onStatus}={}){
 if(process.env.CI!=='true'||process.platform!=='win32'||!path.isAbsolute(process.env.RUNNER_TEMP||''))throw Error('Guest QA transport requires disposable Windows CI.');
 const base=fs.realpathSync(process.env.RUNNER_TEMP),resolved=fs.realpathSync(file),inside=value=>value.toLowerCase().startsWith((base+path.sep).toLowerCase());if(!inside(resolved)||fs.lstatSync(file).isSymbolicLink())throw Error('Guest QA configuration must be owned by this runner.');
 const config=JSON.parse(fs.readFileSync(resolved));if(config.version!==1||!['directory','mountRoot'].every(key=>path.isAbsolute(config[key])&&inside(fs.realpathSync(config[key]))&&!fs.lstatSync(config[key]).isSymbolicLink()))throw Error('Invalid isolated QA guest paths.');
 const installer=new WslInstaller(config);if(installer.identity.owner!==config.owner||installer.state().status!=='ready')throw Error('The parent QA runtime must already be prepared.');
 const host=new ManagedRuntimeHost({installer,sharedDirectory:config.mountRoot,onStatus});return {host,release:()=>installer.releaseLease(),create(directory){const requested=path.resolve(directory),profileId=path.basename(requested);if(path.dirname(requested)!==host.profiles||(profileId!=='legacy'&&!/^[a-f0-9]{32}$/.test(profileId)))throw Error('QA application data must stay in the prepared guest profile.');return host.create({profileId,specs});}};
}
