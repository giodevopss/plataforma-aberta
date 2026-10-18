import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {verifiedDownload} from './download.mjs';import {hashFile} from './backup-archive.mjs';
export const localModel=JSON.parse(fs.readFileSync(new URL('./local-model.json',import.meta.url)));
export async function installLocalModel({directory,model=localModel,download=verifiedDownload,onProgress=()=>{}}){
 const bytes=model===localModel?fs.readFileSync(new URL('../resources/stack-config/local-ai/qwen3-4b-manifest.json',import.meta.url)):Buffer.from(model.manifestBytes);
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==model.manifestSHA256)throw Error('Manifesto do modelo local inválido.');
 if(!/^manifests\/registry\.ollama\.ai\/library\/[a-z0-9-]+\/[a-z0-9.-]+$/.test(model.manifestPath)||!/^https:\/\/registry\.ollama\.ai\/v2\/library\/[a-z0-9-]+\/blobs\/$/.test(model.registry))throw Error('Origem do modelo local inválida.');
 const manifest=JSON.parse(bytes),blobs=[manifest.config,...manifest.layers];
 if(blobs.some(item=>!/^sha256:[a-f0-9]{64}$/.test(item.digest)||!Number.isSafeInteger(item.size)||item.size<1))throw Error('Blocos do modelo local inválidos.');
 await fsp.mkdir(directory,{recursive:true,mode:0o700});if((await fsp.lstat(directory)).isSymbolicLink())throw Error('Pasta do modelo não pode ser um link.');
 // A restored or pre-existing nested directory must not redirect downloads.
 for(const relative of ['blobs',...model.manifestPath.split('/').slice(0,-1).map((_part,index,parts)=>parts.slice(0,index+1).join('/'))]){const child=path.join(directory,relative);await fsp.mkdir(child,{recursive:true,mode:0o700});const stat=await fsp.lstat(child);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Pasta do modelo não pode ser um link.');}
 const target=path.join(directory,model.manifestPath);
 // Never silently replace a user-selected or newer model under this name.
 if(fs.existsSync(target)&&((await fsp.lstat(target)).isSymbolicLink()||await hashFile(target)!==model.manifestSHA256))throw Error('O modelo instalado difere da versão verificada. Preserve um backup antes da migração.');
 for(const blob of blobs){const destination=path.join(directory,'blobs',blob.digest.replace(':','-'));if(fs.existsSync(destination)&&(await fsp.lstat(destination)).isSymbolicLink())throw Error('Bloco do modelo não pode ser um link.');await download({url:model.registry+blob.digest,sha256:blob.digest.slice(7),size:blob.size,destination,onProgress});}
 // Commit the usable tag only after every exact blob has been authenticated.
 const temporary=target+'.'+crypto.randomUUID()+'.tmp';await fsp.writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await fsp.rename(temporary,target);
 return {name:model.name,sha256:model.manifestSHA256,bytes:blobs.reduce((sum,item)=>sum+item.size,0)};
}
export async function startLocalAI(runtime,{spec,directory,prefix,network}){
 const model=spec.localAI;
 await runtime.ensureImage(model.engine.image);
 runtime.setStatus(spec.id,'downloading','Verificando o modelo de IA local…');
 const models=path.join(directory,'models');await installLocalModel({directory:models,model,onProgress:({received,total})=>runtime.setStatus(spec.id,'downloading','Modelo local: '+Math.floor(received/total*100)+'%')});
 const hash=crypto.createHash('sha256').update(JSON.stringify({image:model.engine.image,model:model.manifestSHA256,memoryMB:model.engine.memoryMB,context:2048})).digest('hex');
 await runtime.container(prefix+'-ollama',['--network',network,'--network-alias','ollama','--memory',model.engine.memoryMB+'m','--cpus','4','--cap-drop','ALL','--security-opt','no-new-privileges:true','--env','OLLAMA_HOST=0.0.0.0:11434','--env','OLLAMA_MODELS=/models','--env','OLLAMA_NO_CLOUD=1','--env','OLLAMA_CONTEXT_LENGTH=2048','--env','OLLAMA_NUM_PARALLEL=1','--env','OLLAMA_KEEP_ALIVE=0','--env','CUDA_VISIBLE_DEVICES=-1','--env','HOME=/tmp','--read-only','--tmpfs','/tmp:rw,nosuid,size=64m','--mount',`type=bind,source=${models},target=/models`,model.engine.image,'serve'],hash);
 for(let attempt=0;attempt<40;attempt++){try{await runtime.run(['exec',prefix+'-ollama','ollama','show',model.name],{timeout:10000});return;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
 throw Error('O motor de IA local não iniciou. O modelo e seus dados foram preservados.');
}
