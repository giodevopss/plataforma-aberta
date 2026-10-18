import {relocateRestoredAssets} from './restore-relocation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {LocalRuntime,commandRunner} from './local-runtime.mjs';
import {affineImages} from './affine-stack.mjs';
import {serverApps,createServerStack,stackImages} from './server-stacks.mjs';
import {fileURLToPath} from 'node:url';
export {serverApps};
export const affineApp={id:'affine',image:affineImages.application,port:3010,memoryMB:2048,volumes:[],healthPath:'/',compose:true};
const secretKeys=['secret','secret2','secret3','storageSecret','queueSecret','analyticsSecret','hubSecret','authzPassword','authzSecret'];
export class CompleteRuntime extends LocalRuntime {
 constructor(options){super(options);this.hasComposeTransport=Boolean(options.runCompose);this.composeBinary=options.composeBinary;this.runCompose=options.runCompose||commandRunner(this.composeBinary||'missing-compose-runtime');}
 composeArgs(id,args){const dir=path.join(this.directory,id);return ['--project-directory',dir,'--project-name','pa-'+this.identity.id+'-'+id,'--file',path.join(dir,'compose.json'),...args];}
 async checkStackOwnership(id,specHash,stack){
  const prefix='pa-'+this.identity.id+'-'+id;
  const saved=path.join(this.directory,id,'compose.json');
  const compose=stack?.compose||(fs.existsSync(saved)?JSON.parse(fs.readFileSync(saved)):null);
  if(!compose)return;
  for(const [role,service] of Object.entries(compose.services)){
   if(service.container_name!==prefix+'-'+role)throw Error('Identidade de contêiner inválida.');
   const resource=await this.owned('container',service.container_name);
   if(specHash&&resource&&resource.Config.Labels['app.plataforma-aberta.spec']!==specHash)throw Error('A atualização deste aplicativo exige backup e migração explícita.');
  }
  await this.owned('network',prefix+'-network');
  for(const volume of Object.values(compose.volumes||{})){if(!volume.name.startsWith(prefix+'-'))throw Error('Identidade de volume inválida.');await this.owned('volume',volume.name);}
 }
 async startOnce(id){
  if(!this.specs.get(id)?.compose)return super.startOnce(id);
  if(!serverApps.some(app=>app.id===id))throw Error('Stack local desconhecida.');
  if(!this.hasComposeTransport&&(!this.composeBinary||!fs.existsSync(this.composeBinary)))throw Error('O componente local Docker Compose ainda não foi incluído para este sistema.');
  const probe=await this.probe();if(!probe.available)throw Error(probe.reason);
  const dir=path.join(this.directory,id);fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const settingsFile=path.join(dir,'runtime.json');const settings=fs.existsSync(settingsFile)?JSON.parse(fs.readFileSync(settingsFile)):{port:await this.allocatePort(),token:crypto.randomBytes(32).toString('hex'),postgresPassword:crypto.randomBytes(32).toString('hex')};
  for(const key of secretKeys)settings[key]??=crypto.randomBytes(32).toString('hex');
  const temporary=settingsFile+'.tmp';fs.writeFileSync(temporary,JSON.stringify(settings)+'\n',{mode:0o600});fs.renameSync(temporary,settingsFile);
  const specHash=crypto.createHash('sha256').update(JSON.stringify(id==='affine'?{images:affineImages,port:settings.port,postgresPassword:settings.postgresPassword}:createServerStack(id,{...settings,prefix:'pa-'+this.identity.id+'-'+id,owner:this.identity.id,specHash:'a'.repeat(64)}).compose)).digest('hex');
  const stack=createServerStack(id,{prefix:'pa-'+this.identity.id+'-'+id,owner:this.identity.id,...settings,specHash});
  await this.checkStackOwnership(id,specHash,stack);
  fs.writeFileSync(path.join(dir,'compose.json'),JSON.stringify(stack.compose,null,2)+'\n',{mode:0o600});
  fs.writeFileSync(path.join(dir,'gateway.conf'),stack.config,{mode:0o644});for(const service of Object.values(stack.compose.services))for(const mount of service.volumes||[]){const source=typeof mount==='string'?mount.split(':')[0]:mount.type==='bind'?mount.source:null;if(source&&!source.startsWith('/')&&(source.startsWith('./')||typeof mount==='object')){const relative=source.replace(/^\.\//,'');if(relative==='gateway.conf')continue;if(relative.startsWith('stack-config/')){const resource=fileURLToPath(new URL('../resources/stack-config/'+id+'/'+relative.slice(13),import.meta.url));const target=path.join(dir,relative);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.cpSync(resource,target,{recursive:true});}else fs.mkdirSync(path.join(dir,relative),{recursive:true,mode:0o700});}}
  this.setStatus(id,'downloading','Verificando os componentes completos de '+id+'…');
  for(const image of new Set(stackImages(id)))await this.ensureImage(image);
  if(id==='postiz'){const manifest=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../resources/stack-config/postiz/PROVENANCE.json',import.meta.url)))),original=(await this.run(['run','--rm','--label','app.plataforma-aberta.workspace='+this.identity.id,'--network','none','--user','65534:65534','--read-only','--cap-drop','ALL','--entrypoint','sha256sum',manifest.image,manifest.target])).trim().split(/\s+/)[0];if(original!==manifest.original_sha256)throw Error('A configuração original Postiz difere da fonte auditada. Nenhum arquivo foi substituído.');}
  if(dir.includes(','))throw Error('O caminho de dados não pode conter vírgulas para este runtime.');
  await this.run(['run','--rm','--name','pa-'+this.identity.id+'-'+id+'-gateway-config-check','--label','app.plataforma-aberta.workspace='+this.identity.id,'--network','none','--user','65534:65534','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--cap-drop','ALL','--mount',`type=bind,source=${path.join(dir,'gateway.conf')},target=/etc/pa-gateway.conf,readonly`,'--entrypoint','nginx',affineImages.gateway,'-c','/etc/pa-gateway.conf','-t']);
  if(settings.assetRelocation){this.started.add(id);await relocateRestoredAssets(this,id,stack,settings);const relocated=settingsFile+'.tmp';fs.writeFileSync(relocated,JSON.stringify(settings)+'\n',{mode:0o600});fs.renameSync(relocated,settingsFile);}
  this.setStatus(id,'starting','Iniciando banco local e migrações de '+id+'…');
  this.started.add(id);await this.runCompose(this.composeArgs(id,['up','--detach','--pull','never']),{timeout:180000});
  const origin='http://127.0.0.1:'+settings.port;
  let stableResponses=0;
  for(let attempt=0;attempt<(['plane','postiz','baserow'].includes(id)?600:120);attempt++){
   try{const response=await fetch(origin+(this.specs.get(id).healthPath||'/'),{headers:{'X-PA-Session':settings.token},signal:AbortSignal.timeout(3000)});let healthy=response.ok;if(id==='postiz')healthy=healthy&&String(response.headers.get('content-type')).includes('application/json')&&typeof(await response.json()).register==='boolean';else await response.body?.cancel();stableResponses=healthy?stableResponses+1:0;if(stableResponses>=(id==='postiz'?3:1)){this.setStatus(id,'ready');return {id,origin,token:settings.token};}}catch{stableResponses=0;}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw Error('O aplicativo não ficou pronto. Os dados locais foram preservados.');
 }
 async stop(id){
  if(!this.specs.get(id)?.compose)return super.stop(id);
  if(this.pending.has(id))throw Error('Aguarde a inicialização antes de parar o aplicativo.');
  await this.checkStackOwnership(id);await this.runCompose(this.composeArgs(id,['stop','--timeout','30']),{timeout:180000});this.started.delete(id);this.setStatus(id,'stopped');
 }
}
