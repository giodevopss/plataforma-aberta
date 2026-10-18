import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {affineImages} from './affine-stack.mjs';
import {validateTar} from './backup-archive.mjs';
import {copyPortableTree} from './snapshot-files.mjs';
const OWNER='app.plataforma-aberta.workspace';
export class RuntimeBackup {
 constructor(runtime){this.runtime=runtime;this.resumeContainers=[];}
 async resources(){
  const result=[];
  for(const id of this.runtime.specs.keys()){
   const dir=path.join(this.runtime.directory,id),file=path.join(dir,'compose.json');if(!fs.existsSync(path.join(dir,'runtime.json')))continue;
   if(this.runtime.specs.get(id).compose){
    if(!fs.existsSync(file))continue;
    const compose=JSON.parse(fs.readFileSync(file));await this.runtime.checkStackOwnership(id);
    result.push({id,compose,containers:Object.values(compose.services).map(s=>s.container_name),volumes:Object.entries(compose.volumes||{}).map(([key,value])=>({key,name:value.name}))});
   }else result.push({id,containers:[...(this.runtime.specs.get(id).localAI?['ollama']:[]),'application','gateway'].map(s=>'pa-'+this.runtime.identity.id+'-'+id+'-'+s),volumes:[]});
  }
  return result;
 }
 async freeze(){
  if(this.runtime.maintenance)throw Error('Já existe uma operação de manutenção em andamento.');
  if(this.runtime.pending.size)throw Error('Aguarde os aplicativos terminarem a inicialização antes do backup.');
  this.runtime.maintenance=true;this.resumeContainers=[];
  try{this.items=await this.resources();}catch(e){this.runtime.maintenance=false;throw e;}
  try{
   for(const item of this.items){
    const running=[];for(const name of item.containers){const c=await this.runtime.owned('container',name);if(c?.State.Running)running.push(name);}
    this.resumeContainers.push(...running);
    if(running.length){if(item.compose)await this.runtime.runCompose(this.runtime.composeArgs(item.id,['stop','--timeout','60']),{timeout:240000});else for(const name of running.reverse())await this.runtime.run(['stop','--time','60',name],{timeout:90000});}
   }
   for(const item of this.items)for(const name of item.containers){const c=await this.runtime.owned('container',name);if(c?.State.Running)throw Error('Não foi possível pausar todas as gravações.');}
   return this.items.map(i=>i.id);
  }catch(e){await this.resume();throw e;}
 }
 async resume(){
  const errors=[],failed=[];
  for(const name of this.resumeContainers){try{await this.runtime.owned('container',name);await this.runtime.run(['start',name],{timeout:180000});}catch(e){errors.push(e);failed.push(name);}}
  this.resumeContainers=failed;this.items=null;this.runtime.maintenance=errors.length>0;if(errors.length)throw new AggregateError(errors,'Os dados foram preservados, mas alguns serviços não reiniciaram.');
 }
 async withVolume({name,archive,mode}){
  if(!await this.runtime.owned('volume',name))throw Error('Volume local ausente.');
  const originalArchive=archive;let transfer;
  if(this.runtime.volumeTransferDirectory){
   const root=this.runtime.volumeTransferDirectory;if(fs.lstatSync(root).isSymbolicLink())throw Error('Pasta de transferência inválida.');transfer=await fsp.mkdtemp(path.join(root,'volume-'));archive=path.join(transfer,path.basename(archive));
  }
  try{
  if(transfer&&mode==='import')await fsp.copyFile(originalArchive,archive);
  const destination=path.dirname(archive);if(destination.includes(',')||name.includes(','))throw Error('Caminho de backup incompatível com o runtime.');
  await fsp.mkdir(destination,{recursive:true,mode:0o700});
  await this.runtime.ensureImage(affineImages.gateway);
  const helper='pa-'+this.runtime.identity.id+'-backup-'+crypto.randomBytes(6).toString('hex');
  const outputName=path.basename(archive);if(!/^[a-z0-9-]+\.tar\.gz$/.test(outputName))throw Error('Nome de arquivo inválido.');
  const command=mode==='export'?['tar','czf','/backup/'+outputName,'--directory=/data','--exclude=./lost+found','.']:['tar','xzf','/backup/'+outputName,'--directory=/data','--numeric-owner'];
  await this.runtime.run(['run','--rm','--name',helper,'--label',OWNER+'='+this.runtime.identity.id,'--network','none','--user','0:0','--read-only','--cap-drop','ALL','--cap-add','DAC_OVERRIDE',...(mode==='import'?['--cap-add','CHOWN','--cap-add','FOWNER']:[]),'--security-opt','no-new-privileges:true','--mount',`type=volume,source=${name},target=/data${mode==='export'?',readonly':''}`,'--mount',`type=bind,source=${destination},target=/backup${mode==='import'?',readonly':''}`,'--entrypoint',command[0],affineImages.gateway,...command.slice(1)],{timeout:1800000});
  if(transfer&&mode==='export'){const stat=await fsp.lstat(archive);if(!stat.isFile()||stat.isSymbolicLink())throw Error('O runtime produziu um arquivo de backup inválido.');await fsp.mkdir(path.dirname(originalArchive),{recursive:true,mode:0o700});await fsp.copyFile(archive,originalArchive);}
  }finally{if(transfer)await fsp.rm(transfer,{recursive:true,force:true});}
 }
 async snapshot(destination){
  if(!this.runtime.maintenance||!this.items)throw Error('Pause os serviços antes de copiar os dados.');
  const volumes=[];
  for(const item of this.items){
   const source=path.join(this.runtime.directory,item.id);const target=path.join(destination,'applications',item.id);
   await fsp.mkdir(path.dirname(target),{recursive:true,mode:0o700});
   await copyPortableTree(source,target);
   for(const volume of item.volumes){
    const filename=item.id+'-'+volume.key.replaceAll('_','-')+'.tar.gz';const archive=path.join(destination,'volumes',filename);
    await this.withVolume({name:volume.name,archive,mode:'export'});await validateTar(archive,{volumeRoot:true});
    volumes.push({application:item.id,key:volume.key,file:'volumes/'+filename});
   }
  }
  const engine=this.items.length?await this.runtime.probe():{available:true,architecture:null};if(!engine.available)throw Error('Runtime indisponível durante o backup.');
  return {applications:this.items.map(i=>i.id),volumes,engineArchitecture:engine.architecture};
 }
 async restoreIntoEmpty({snapshot,manifest}){
  if(this.runtime.maintenance||this.runtime.pending?.size)throw Error('Aguarde a operação de manutenção ou inicialização atual.');
  this.runtime.maintenance=true;
  try{
  const entries=await fsp.readdir(this.runtime.directory);
  if(entries.some(name=>name!=='identity.json'))throw Error('Restauração exige uma pasta de aplicativos nova; o ambiente atual será preservado.');
  if(!Array.isArray(manifest.applications)||!Array.isArray(manifest.volumes))throw Error('Manifesto dos aplicativos inválido.');
  const volumes=[];const apps=new Set();
  for(const id of manifest.applications){
   if(!this.runtime.specs.has(id)||apps.has(id))throw Error('Aplicativo incompatível no backup.');apps.add(id);
   const source=path.join(snapshot,'applications',id);if(!fs.statSync(source,{throwIfNoEntry:false})?.isDirectory())throw Error('Dados de aplicativo ausentes.');
   const settings=JSON.parse(fs.readFileSync(path.join(source,'runtime.json')));
   if(!/^[a-f0-9]{64}$/.test(settings.token)||!Number.isInteger(settings.port)||settings.port<1024||settings.port>65535)throw Error('Configuração de aplicativo inválida.');
   if(this.runtime.specs.get(id).compose){
    const {createServerStack}=await import('./server-stacks.mjs');
    const stack=createServerStack(id,{...settings,prefix:'pa-'+this.runtime.identity.id+'-'+id,owner:this.runtime.identity.id,specHash:'a'.repeat(64)});
    const saved=JSON.parse(await fsp.readFile(path.join(source,'compose.json'),'utf8'));
    if(Object.keys(saved.services||{}).length!==Object.keys(stack.compose.services).length||Object.entries(stack.compose.services).some(([role,service])=>saved.services[role]?.image!==service.image))throw Error('As versões dos aplicativos diferem do backup. A migração exige um procedimento explícito.');
    for(const [key,volume]of Object.entries(stack.compose.volumes||{})){
     const records=manifest.volumes.filter(v=>v.application===id&&v.key===key);
     if(records.length!==1||records[0].file!=='volumes/'+id+'-'+key.replaceAll('_','-')+'.tar.gz')throw Error('Volume ausente ou duplicado no backup.');
     const archive=path.join(snapshot,records[0].file);await validateTar(archive,{volumeRoot:true});
     volumes.push({name:volume.name,archive,labels:volume.labels});
    }
   }
  }
  if(volumes.length!==manifest.volumes.length)throw Error('Volume inesperado no backup.');
  // Authenticate and validate application identities and volume archives before
  // intentionally preparing a fresh private guest. Editor-only imports stay light.
  if(apps.size)await this.runtime.prepare?.();
  const engine=apps.size?await this.runtime.probe():{available:true,architecture:null};if(!engine.available)throw Error('Runtime local indisponível.');
  if(volumes.length&&(!manifest.engineArchitecture||manifest.engineArchitecture!==engine.architecture))throw Error('Este snapshot binário exige a mesma arquitetura Linux. A restauração lógica entre ARM e Intel ainda precisa ser validada.');
  for(const volume of volumes)if(await this.runtime.owned('volume',volume.name))throw Error('O destino já contém um volume. Nenhum dado será substituído.');
  const created=[];const copied=[];
  try{
   for(const volume of volumes){await this.runtime.run(['volume','create','--label',OWNER+'='+this.runtime.identity.id,volume.name]);created.push(volume.name);await this.withVolume({...volume,mode:'import'});}
   for(const id of apps){const destination=path.join(this.runtime.directory,id);copied.push(destination);await fsp.cp(path.join(snapshot,'applications',id),destination,{recursive:true});const settingsPath=path.join(destination,'runtime.json');const settings=JSON.parse(await fsp.readFile(settingsPath,'utf8'));const previousPort=settings.port;settings.port=await this.runtime.allocatePort();if(id==='postiz'&&settings.port!==previousPort)settings.assetRelocation={from:'http://127.0.0.1:'+previousPort,to:'http://127.0.0.1:'+settings.port};settings.token=crypto.randomBytes(32).toString('hex');await fsp.writeFile(settingsPath,JSON.stringify(settings)+'\n',{mode:0o600});for(const file of ['compose.json','gateway.conf','application.env','endpoint.json'])await fsp.rm(path.join(destination,file),{force:true});}
   return {applications:[...apps],volumeCount:created.length};
  }catch(e){
   for(const name of created.reverse()){try{await this.runtime.owned('volume',name);await this.runtime.run(['volume','rm',name]);}catch{}}
   for(const dir of copied)await fsp.rm(dir,{recursive:true,force:true});throw e;
  }
  }finally{this.runtime.maintenance=false;}
 }

}
