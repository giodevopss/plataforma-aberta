import fs from 'node:fs';import path from 'node:path';

// The original start.js intentionally skips env-to-file setup when keys are
// immutable. Its backend reads env, but the original Next.js UI reads this file.
// Run the original image's own builder before any application writer starts.
const script=`const fs=require('node:fs');
const path='/app_data/userConfig.json';
const stat=fs.lstatSync(path,{throwIfNoEntry:false});
if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error('Invalid provider configuration file');
const existing=stat?JSON.parse(fs.readFileSync(path,'utf8')):{};
if(!existing||typeof existing!=='object'||Array.isArray(existing))throw Error('Invalid provider configuration');
if(existing.LLM){console.log('Existing original provider configuration preserved');process.exit(0);}
if(Object.keys(existing).length)throw Error('Existing incomplete provider settings require explicit recovery');
const {buildUserConfigFromEnv}=require('/app/scripts/user-config-env.cjs');
const value=buildUserConfigFromEnv(existing,process.env);
if(value.LLM!=='ollama'||value.OLLAMA_URL!=='http://ollama:11434'||!value.OLLAMA_MODEL||value.DISABLE_IMAGE_GENERATION!==true)throw Error('Original local provider builder did not produce complete settings');
const temporary=path+'.plataforma-'+require('node:crypto').randomUUID()+'.tmp';
try{const fd=fs.openSync(temporary,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,path);}finally{fs.rmSync(temporary,{force:true});}
console.log('Original local provider configuration initialized');`;

export async function preparePresentonConfiguration(runtime,{directory,prefix,envFile,image}){
 const data=path.join(directory,'data');if(fs.lstatSync(data).isSymbolicLink())throw Error('Pasta de configuração Presenton inválida.');const file=path.join(data,'userConfig.json'),stat=fs.lstatSync(file,{throwIfNoEntry:false});
 if(stat){if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('Configuração original Presenton inválida; os dados foram preservados.');const existing=JSON.parse(fs.readFileSync(file));if(existing&&typeof existing==='object'&&!Array.isArray(existing)&&existing.LLM)return;}
 if((await runtime.owned('container',prefix+'-application'))?.State.Running)throw Error('Encerre o Presenton antes de preparar sua configuração local.');
 const helper=prefix+'-provider-configuration';runtime.verificationHelpers?.add(helper);
 await runtime.run(['run','--rm','--name',helper,'--label','app.plataforma-aberta.workspace='+runtime.identity.id,'--network','none','--user','0:0','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--env-file',envFile,'--mount',`type=bind,source=${data},target=/app_data`,'--entrypoint','node',image,'-e',script],{timeout:30000});
}
