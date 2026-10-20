// Internal installer acceptance; never a professional release or gate override.
import {removeOwnedInstallation} from './remove-owned-installation.mjs';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createRequire} from 'node:module';
if(process.env.CI!=='true'||process.env.PA_INTERNAL_INSTALLER_VALIDATION!=='1'||!['giodevopss/plataforma-aberta-suite','giodevopss/plataforma-aberta'].includes(process.env.GITHUB_REPOSITORY))throw Error('Internal installer validation is restricted to this disposable CI workflow.');
const root=path.resolve('.'),desktop=path.join(root,'desktop'),evidence=path.join(desktop,'research'),run=promisify(execFile),mode=process.argv[2],stateFile=path.join(evidence,'internal-installation.json');fs.mkdirSync(evidence,{recursive:true});
const target=process.platform+'-'+process.arch;
if(mode==='build'){
 if(!['darwin-arm64','darwin-x64','win32-x64'].includes(target))throw Error('Unsupported native installer target.');
 const resources=path.join(desktop,'resources/runtime');for(const name of fs.readdirSync(resources))if(fs.statSync(path.join(resources,name)).isDirectory()&&name!==target)fs.rmSync(path.join(resources,name),{recursive:true});
 const binary=createRequire(path.join(desktop,'package.json')).resolve('electron-builder/cli.js');
 const args=[binary,...(process.platform==='darwin'?['--mac','dmg',process.arch==='arm64'?'--arm64':'--x64']:['--win','nsis','--x64']),'--publish','never'];
 const result=await run(process.execPath,args,{cwd:desktop,env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'},timeout:900000,maxBuffer:10_000_000});fs.writeFileSync(path.join(evidence,'internal-builder.log'),result.stdout+result.stderr);
 await run(process.execPath,[path.join(desktop,'scripts/checksums.mjs')],{cwd:desktop});console.log('Internal unsigned installer built for',target,'; final release gate remains closed.');
}else if(mode==='install'){
 const release=path.join(desktop,'release'),extension=process.platform==='darwin'?'.dmg':'.exe',files=fs.readdirSync(release).filter(name=>name.endsWith(extension));if(files.length!==1)throw Error('Expected exactly one native installer.');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pa-installer-validation-'));let executable,installation;
 if(process.platform==='darwin'){
  const mount=path.join(temporary,'mounted');fs.mkdirSync(mount);await run('/usr/bin/hdiutil',['attach','-nobrowse','-readonly','-mountpoint',mount,path.join(release,files[0])]);
  try{const applications=fs.readdirSync(mount).filter(n=>n.endsWith('.app'));if(applications.length!==1)throw Error('Installer application missing.');installation=path.join(temporary,applications[0]);await run('/usr/bin/ditto',[path.join(mount,applications[0]),installation]);executable=path.join(installation,'Contents/MacOS/Plataforma Aberta');}finally{await run('/usr/bin/hdiutil',['detach',mount]);}
 }else{
  installation=path.join(temporary,'installed');await run(path.join(release,files[0]),['/S','/currentuser','/D='+installation],{timeout:180000,windowsHide:true});executable=path.join(installation,'Plataforma Aberta.exe');
 }
 for(let attempt=0;attempt<120&&!fs.existsSync(executable);attempt++)await new Promise(r=>setTimeout(r,500));if(!fs.statSync(executable,{throwIfNoEntry:false})?.isFile())throw Error('Installed executable missing.');
 fs.writeFileSync(stateFile,JSON.stringify({checked_at:new Date().toISOString(),target,temporary,installation,executable,installer:files[0],scope:'Internal unsigned installer acceptance of currently integrated features; complete managed runtime and final suite release gates remain pending'},null,2)+'\n');
 const nativeRoot=process.platform==='darwin'?path.join(installation,'Contents/Resources'):path.join(installation,'resources');
 fs.appendFileSync(process.env.GITHUB_ENV,'PA_DESKTOP_EXECUTABLE='+executable+'\nPA_SUITE_NATIVE_RESOURCES='+path.join(nativeRoot,'native')+'\nPA_SUITE_EXTENSION_RESOURCES='+path.join(nativeRoot,'extensions/screenity')+'\n');console.log('Installed internal package into its isolated QA directory.');
}else if(mode==='uninstall'){
 if(!fs.existsSync(stateFile))throw Error('No internal installation was recorded.');const state=JSON.parse(fs.readFileSync(stateFile));
 if(!state.temporary.startsWith(path.join(os.tmpdir(),'pa-installer-validation-'))||!state.installation.startsWith(state.temporary+path.sep))throw Error('Unexpected installation path; cleanup refused.');
 if(process.platform==='win32'){const uninstall=path.join(state.installation,'Uninstall Plataforma Aberta.exe');if(!fs.existsSync(uninstall))throw Error('Original NSIS uninstaller missing.');await run(uninstall,['/S'],{timeout:180000,windowsHide:true});for(let attempt=0;attempt<120&&fs.existsSync(state.executable);attempt++)await new Promise(r=>setTimeout(r,500));if(fs.existsSync(state.executable))throw Error('NSIS uninstall did not remove the executable.');}
 await removeOwnedInstallation(state.temporary);state.uninstalled_at=new Date().toISOString();state.status='installed-tested-uninstalled';fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n');console.log('Internal installation removed; only CI evidence and package artifact remain.');
}else throw Error('Use build, install or uninstall.');
