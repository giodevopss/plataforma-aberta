import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startLocalAI} from './local-ai.mjs';
const imageSizes=JSON.parse(fs.readFileSync(fileURLToPath(new URL('./image-sizes.json',import.meta.url))));

const OWNER='app.plataforma-aberta.workspace';
const SPEC='app.plataforma-aberta.spec';
export function validateSpec(spec){
  if(!/^[a-z][a-z0-9-]{1,40}$/.test(spec.id)||!/^[-.a-z0-9/]+@sha256:[a-f0-9]{64}$/.test(spec.image))throw Error('Aplicativo exige identificador e imagem fixada por SHA-256.');
  if(!Number.isInteger(spec.port)||spec.port<1||spec.port>65535)throw Error('Porta interna inválida.');
  if(!Number.isInteger(spec.memoryMB)||spec.memoryMB<256||spec.memoryMB>32768)throw Error('Limite de memória inválido.');
  if(!Array.isArray(spec.volumes)||spec.volumes.some(v=>!/^[-a-z0-9]+$/.test(v.name)||!/^\/[a-zA-Z0-9/._-]+$/.test(v.target)))throw Error('Volume inválido.');
  return spec;
}
export function gatewayConfig({token,port,upstreamPort,remoteUser,listenPort=8080,storageBucket}){
  if(!/^[a-f0-9]{64}$/.test(token)||![port,upstreamPort].every(n=>Number.isInteger(n)&&n>0&&n<=65535))throw Error('Configuração de sessão inválida.');
  if(remoteUser!==undefined&&!/^[a-z][a-z0-9-]{2,40}$/.test(remoteUser))throw Error('Identidade local inválida.');
  if(!Number.isInteger(listenPort)||listenPort<1||listenPort>65535||storageBucket!==undefined&&!/^[a-z][a-z0-9-]{2,62}$/.test(storageBucket))throw Error('Configuração de armazenamento inválida.');
  return `pid /tmp/nginx.pid;
worker_processes 1;
error_log /dev/stderr warn;
events { worker_connections 512; }
http {
  map_hash_bucket_size 128;
  access_log off;
  client_body_temp_path /tmp/client;
  proxy_temp_path /tmp/proxy;
  fastcgi_temp_path /tmp/fastcgi;
  uwsgi_temp_path /tmp/uwsgi;
  scgi_temp_path /tmp/scgi;
  resolver 127.0.0.11 valid=5s ipv6=off;
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  map $http_x_pa_session $header_session_ok { default 0; "${token}" 1; }
  map $cookie_pa_session $cookie_session_ok { default 0; "${token}" 1; }
  map "$header_session_ok$cookie_session_ok" $session_ok { default 1; "00" 0; }
  map $http_origin $origin_ok { default 0; '' 1; "http://127.0.0.1:${port}" 1; }
${storageBucket?`  # Only this private bucket delegates authentication to the S3 SigV4 server.
  map $uri $object_route { default 0; ~^/${storageBucket}(/|$) 1; }
  map "$session_ok$object_route" $gateway_access { default 1; "00" 0; }
`:''}
  server {
    listen ${listenPort};
    server_name 127.0.0.1;
    if (${storageBucket?'$gateway_access':'$session_ok'} = 0) { return 403; }
    if ($origin_ok = 0) { return 403; }
    if ($http_host != "127.0.0.1:${port}") { return 403; }
    client_max_body_size 512m;
${storageBucket?`    location ~ ^/${storageBucket}(/|$) {
      set $objects http://storage:9000;
      proxy_pass $objects;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header X-PA-Session "";
      proxy_set_header Cookie "";
      proxy_set_header Remote-User "";
      proxy_request_buffering off;
      proxy_buffering off;
      proxy_read_timeout 600s;
    }
`:''}
    location / {
      set $application http://application:${upstreamPort};
      proxy_pass $application;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header X-Forwarded-Host $http_host;
      proxy_set_header X-Forwarded-Proto http;
      proxy_set_header X-PA-Session "";
      proxy_set_header Remote-User "${remoteUser||''}";
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_request_buffering off;
      proxy_buffering off;
      proxy_read_timeout 600s;
    }
  }
}
`;
}
export function commandRunner(binary){
  return (args,{progress,timeout=120000}={})=>new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';
    const timer=setTimeout(()=>{child.kill();reject(Error('O serviço local excedeu o tempo de resposta.'));},timeout);
    child.stdout.on('data',chunk=>{output=(output+chunk).slice(-2000000);progress?.(chunk.toString());});
    child.stderr.on('data',chunk=>{error=(error+chunk).slice(-10000);progress?.(chunk.toString());});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(output);else{const e=Error('Runtime de contêineres: '+error.slice(-1200));e.code=code;reject(e);}});
  });
}
export function isLocalEngineEndpoint(value){
 if(typeof value!=='string')return false;
 if(value.startsWith('unix:///')||value.startsWith('npipe:////./pipe/'))return true;
 try{const url=new URL(value);return ['tcp:','http:','https:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!url.username&&!url.password;}catch{return false;}
}
async function unusedPort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function atomicJSON(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);}

// Own resources only: no global engine start/stop, prune or default networks/volumes.
export class LocalRuntime {
  constructor({directory,specs,run=commandRunner(process.platform==='win32'?'docker.exe':'docker'),allocatePort=unusedPort,availableBytes,engineEndpoint,onStatus=()=>{}}){
    this.directory=path.resolve(directory);if(engineEndpoint!==undefined&&!isLocalEngineEndpoint(engineEndpoint))throw Error("Endpoint gerenciado exige uma máquina local.");this.engineEndpoint=engineEndpoint;this.run=run;this.availableBytes=availableBytes||(()=>{const disk=fs.statfsSync(this.directory);return disk.bavail*disk.bsize;});this.allocatePort=allocatePort;this.onStatus=onStatus;
    this.specs=new Map(specs.map(spec=>[spec.id,validateSpec(spec)]));this.pending=new Map();this.started=new Set();this.states=new Map();
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});const identity=path.join(this.directory,'identity.json');
    this.identity=fs.existsSync(identity)?JSON.parse(fs.readFileSync(identity)): {id:crypto.randomBytes(12).toString('hex')};
    if(!/^[a-f0-9]{24}$/.test(this.identity.id))throw Error('Identidade local inválida.');if(!fs.existsSync(identity))atomicJSON(identity,this.identity);
  }
  setStatus(id,status,detail=''){const value={id,status,detail};const previous=this.states.get(id);this.states.set(id,value);if(previous?.status!==status||previous?.detail!==detail)this.onStatus(value);return value;}
  async probe(){try{
    const endpoint=this.engineEndpoint||(!process.env.DOCKER_CONTEXT&&process.env.DOCKER_HOST)||JSON.parse(await this.run(['context','inspect','--format','{{json .Endpoints.docker.Host}}'],{timeout:10000}));
    if(!isLocalEngineEndpoint(endpoint))return {available:false,reason:'O runtime selecionado aponta para outra máquina. Esta suíte exige um runtime no computador do usuário.'};
    const data=JSON.parse(await this.run(['info','--format','{{json .}}'],{timeout:10000}));if(data.OSType&&data.OSType!=='linux')return {available:false,reason:'A suíte exige contêineres Linux. Ative o runtime Linux/WSL2 antes de instalar os aplicativos.'};return {available:true,memoryBytes:data.MemTotal,cpus:data.NCPU,architecture:data.Architecture};
  }catch{return {available:false,reason:'Runtime local de contêineres não está disponível. A instalação automática ainda precisa ser validada para macOS e Windows.'};}}
  async owned(kind,name){
    const output=(await this.run([kind,'ls',...(kind==='container'?['--all']:[]),'--filter','name=^'+name+'$','--format','json'])).trim();
    if(!output)return null;
    const list=output.split(/\r?\n/).map(line=>JSON.parse(line));
    if(!list.flat().some(item=>item.Name===name||item.Names===name))return null;
    const [resource]=JSON.parse(await this.run([kind,'inspect',name]));
    const labels=resource.Config?.Labels||resource.Labels||{};
    if(labels[OWNER]!==this.identity.id)throw Error('Existe um recurso com este nome que não pertence à suíte. Nenhuma alteração foi feita.');
    return resource;
  }
  async container(name,args,specHash,{ephemeralGateway=false}={}){
    const existing=await this.owned('container',name);
    if(existing){
      if(existing.Config.Labels[SPEC]!==specHash){
        if(!ephemeralGateway||!name.endsWith('-gateway'))throw Error('A versão instalada difere da configuração. É necessário um backup e uma migração antes da atualização.');
        if(existing.State.Running)await this.run(['stop','--time','10',name]);
        await this.run(['rm',name]);
      }else{if(!existing.State.Running)await this.run(['start',name]);return;}
    }
    await this.run(['run','--detach','--name',name,'--label',OWNER+'='+this.identity.id,'--label',SPEC+'='+specHash,'--restart','no',...args]);
  }
  async ensureImage(image,{progress}={}){
    try{const id=(await this.run(['image','inspect','--format','{{.Id}}',image])).trim();if(/^sha256:[a-f0-9]{64}$/.test(id))return {cached:true};}catch{}
    const required=(imageSizes[image]||300_000_000)*5+1_000_000_000;if(this.availableBytes()<required)throw Error('Espaço livre insuficiente. Este componente requer aproximadamente '+Math.ceil(required/1e9)+' GB livres para instalação.');
    await this.run(['pull',image],{timeout:1800000,progress});return {cached:false};
  }
  start(id){if(this.maintenance)return Promise.reject(Error('Os aplicativos estão pausados para backup ou restauração.'));if(this.pending.has(id))return this.pending.get(id);const promise=this.startOnce(id).catch(e=>{this.setStatus(id,'error',e.message);throw e;}).finally(()=>this.pending.delete(id));this.pending.set(id,promise);return promise;}
  async startOnce(id){
    const spec=this.specs.get(id);if(!spec)throw Error('A integração completa deste aplicativo ainda não foi validada.');
    const probe=await this.probe();if(!probe.available)throw Error(probe.reason);
    if(spec.localAI&&probe.memoryBytes<(spec.memoryMB+spec.localAI.engine.memoryMB+384)*1024**2)throw Error('A geração de apresentações exige pelo menos 8 GB de memória na máquina Linux local. Aumente a memória do runtime antes de continuar.');
    const dir=path.join(this.directory,id);fs.mkdirSync(dir,{recursive:true,mode:0o700});if(dir.includes(','))throw Error('O caminho de dados não pode conter vírgulas para este runtime.');
    const settingsFile=path.join(dir,'runtime.json');let settings;
    if(fs.existsSync(settingsFile))settings=JSON.parse(fs.readFileSync(settingsFile));else{settings={port:await this.allocatePort(),token:crypto.randomBytes(32).toString('hex')};atomicJSON(settingsFile,settings);}
    if(!/^[a-f0-9]{64}$/.test(settings.token)||!Number.isInteger(settings.port)||settings.port<1024||settings.port>65535)throw Error('Configuração local inválida.');
    const origin='http://127.0.0.1:'+settings.port;const prefix='pa-'+this.identity.id+'-'+id;const network=prefix+'-network';
    this.setStatus(id,'downloading','Verificando o aplicativo completo…');
    await this.ensureImage(spec.image,{progress:()=>this.setStatus(id,'downloading','Baixando/verificando o aplicativo completo…')});
    if(!await this.owned('network',network))await this.run(['network','create','--label',OWNER+'='+this.identity.id,network]);
    // Track partial installation too, so shutdown also stops a started model.
    this.started.add(id);
    if(spec.localAI)await startLocalAI(this,{spec,directory:dir,prefix,network});
    const env=spec.environment({origin});
    if(Object.entries(env).some(([k,v])=>!/^[_A-Z0-9]+$/.test(k)||/[\r\n\0]/.test(String(v))))throw Error('Ambiente do aplicativo inválido.');
    const envFile=path.join(dir,'application.env');fs.writeFileSync(envFile,Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
    const mounts=spec.volumes.flatMap(v=>{const source=path.join(dir,v.name);fs.mkdirSync(source,{recursive:true,mode:0o700});return ['--mount',`type=bind,source=${source},target=${v.target}`];});
    const patches=(spec.patches||[]).map(patch=>{
      if(!/^\/[a-zA-Z0-9/._-]+$/.test(patch.target)||!fs.statSync(patch.source,{throwIfNoEntry:false})?.isFile())throw Error('Adaptação do aplicativo inválida.');
      const digest=crypto.createHash('sha256').update(fs.readFileSync(patch.source)).digest('hex');if(digest!==patch.sha256)throw Error('Checksum da adaptação do aplicativo inválido.');
      const patchDirectory=path.join(dir,'patches');fs.mkdirSync(patchDirectory,{recursive:true,mode:0o700});
      const materialized=path.join(patchDirectory,digest+path.extname(patch.source));fs.writeFileSync(materialized,fs.readFileSync(patch.source),{mode:0o644});
      return {...patch,source:materialized};
    });
    const hash=crypto.createHash('sha256').update(JSON.stringify({image:spec.image,environment:env,volumes:spec.volumes,memoryMB:spec.memoryMB,localAI:spec.localAI?{image:spec.localAI.engine.image,model:spec.localAI.manifestSHA256}:undefined,patches:patches.map(({target,sha256})=>({target,sha256}))})).digest('hex');
    this.setStatus(id,'starting','Iniciando aplicativo completo…');
    await this.container(prefix+'-application',['--network',network,'--network-alias','application','--memory',spec.memoryMB+'m','--cpus','2','--env-file',envFile,...mounts,...patches.flatMap(p=>['--mount',`type=bind,source=${p.source},target=${p.target},readonly`]),spec.image],hash);
    // The application's own port is never published. Its bundled nginx is used
    // as a small authenticated gateway with no additional image download.
    const config=gatewayConfig({token:settings.token,port:settings.port,upstreamPort:spec.port});const nginxFile=path.join(dir,'gateway.conf');fs.writeFileSync(nginxFile,config,{mode:0o644});fs.chmodSync(nginxFile,0o644);
    const gatewayHash=crypto.createHash('sha256').update(spec.image+config).digest('hex');
    await this.run(['run','--rm','--name',prefix+'-gateway-config-check','--label',OWNER+'='+this.identity.id,'--network','none','--user','65534:65534','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--cap-drop','ALL','--mount',`type=bind,source=${nginxFile},target=/etc/pa-gateway.conf,readonly`,'--entrypoint','nginx',spec.image,'-c','/etc/pa-gateway.conf','-t']);
    await this.container(prefix+'-gateway',['--network',network,'--publish',`127.0.0.1:${settings.port}:8080`,'--user','65534:65534','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--memory','128m','--cap-drop','ALL','--security-opt','no-new-privileges:true','--mount',`type=bind,source=${nginxFile},target=/etc/pa-gateway.conf,readonly`,'--entrypoint','nginx',spec.image,'-c','/etc/pa-gateway.conf','-g','daemon off;'],gatewayHash,{ephemeralGateway:true});
    this.started.add(id);
    for(let attempts=0;attempts<120;attempts++){
      try{const response=await fetch(origin+spec.healthPath,{headers:{'X-PA-Session':settings.token},signal:AbortSignal.timeout(3000)});await response.body?.cancel();if(response.ok){this.setStatus(id,'ready');return {id,origin,token:settings.token};}}catch{}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw Error('O aplicativo não ficou pronto. Seus dados foram preservados; consulte o diagnóstico local.');
  }
  async stop(id){
    if(!this.specs.has(id))throw Error('Ferramenta desconhecida.');if(this.pending.has(id))throw Error('Aguarde a inicialização antes de parar o aplicativo.');
    const prefix='pa-'+this.identity.id+'-'+id;
    for(const suffix of ['gateway','application',...(this.specs.get(id).localAI?['ollama']:[])]){const name=prefix+'-'+suffix;const item=await this.owned('container',name);if(item?.State.Running)await this.run(['stop','--time','30',name],{timeout:45000});}
    this.started.delete(id);this.setStatus(id,'stopped');
  }
  async close(){await Promise.allSettled([...this.pending.values()]);for(const id of [...this.started])await this.stop(id);}
}
