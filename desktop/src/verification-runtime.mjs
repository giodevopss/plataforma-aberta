import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {affineImages} from './affine-stack.mjs';

const OWNER='app.plataforma-aberta.workspace';
export const isolatedGateway='com.docker.network.bridge.gateway_mode_ipv4';

export function enableVerification(runtime){
 const root=fs.realpathSync(runtime.directory);
 if(fs.lstatSync(runtime.directory).isSymbolicLink()||runtime.started.size||runtime.pending.size||fs.readdirSync(root).some(name=>name!=='identity.json'))throw Error('A verificação exige um runtime descartável novo.');
 runtime.verificationMode=true;runtime.verificationRoot=root;runtime.verificationHelpers=new Set();
}

export function isolateStack(stack,{port}){
 const networks=stack.compose.networks;
 if(!networks?.default||Object.keys(networks).length!==1)throw Error('A cópia de verificação exige uma única rede privada.');
 Object.assign(networks.default,{driver:'bridge',internal:true,enable_ipv6:false,driver_opts:{[isolatedGateway]:'isolated'}});
 for(const service of Object.values(stack.compose.services)){
  if((service.cap_add||[]).some(cap=>['ALL','NET_ADMIN','NET_RAW','SYS_ADMIN','SYS_MODULE','SYS_PTRACE','BPF'].includes(cap))||service.privileged||service.pid==='host'||service.ipc==='host'||service.extra_hosts||service.networks&&Object.keys(service.networks).some(name=>name!=='default'))throw Error('A verificação não pode acessar redes ou processos externos.');
  if(service.network_mode&&(!/^service:[a-z][a-z0-9-]*$/.test(service.network_mode)||!stack.compose.services[service.network_mode.slice(8)]))throw Error('Namespace de rede incompatível com a verificação.');
  delete service.ports;
  if(!service.network_mode)service.dns=['127.0.0.1'];
  service.cap_drop=[...new Set([...(service.cap_drop||[]),'NET_RAW','NET_ADMIN','SYS_ADMIN'])];
 }
 const previous=stack.config.match(/\blisten ([0-9]+);/g);
 if(previous?.length!==1)throw Error('Gateway de verificação desconhecido.');
 stack.config=stack.config.replace(/\blisten [0-9]+;/,'listen '+port+';');
 stack.compose.services.gateway.labels['app.plataforma-aberta.gateway-config']=crypto.createHash('sha256').update(stack.config).digest('hex');
 return stack;
}

const probeScript=`set -eu
IFS= read -r pa_port
IFS= read -r pa_session
IFS= read -r pa_path
IFS= read -r pa_json
wget -q -T 3 -O /tmp/health --header "X-PA-Session: $pa_session" "http://127.0.0.1:$pa_port$pa_path"
if [ "$pa_json" = yes ]; then cat /tmp/health; else printf 'OK'; fi
`;

// Probe from the gateway's own isolated network namespace. No published port,
// public DNS or host bridge address is needed. The session stays on stdin.
export async function verificationHealth(runtime,id){
 if(runtime.verificationMode!==true)throw Error('Sonda exclusiva de verificação.');
 const settings=JSON.parse(await fsp.readFile(path.join(runtime.directory,id,'runtime.json'),'utf8'));
 if(!Number.isInteger(settings.port)||settings.port<1024||settings.port>65535||!/^[a-f0-9]{64}$/.test(settings.token))throw Error('Configuração de verificação inválida.');
 const gateway='pa-'+runtime.identity.id+'-'+id+'-gateway';
 const owned=await runtime.owned('container',gateway);if(!owned?.State.Running)throw Error('Gateway de verificação indisponível.');
 await runtime.ensureImage(affineImages.gateway);
 const helper='pa-'+runtime.identity.id+'-verification-check-'+crypto.randomBytes(6).toString('hex');runtime.verificationHelpers.add(helper);
 const input=[settings.port,settings.token,runtime.specs.get(id).healthPath||'/',id==='postiz'?'yes':'no'].join('\n')+'\n';
 const output=await runtime.run(['run','--rm','--interactive','--name',helper,'--label',OWNER+'='+runtime.identity.id,'--network','container:'+gateway,'--user','65534:65534','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=2m','--cap-drop','ALL','--security-opt','no-new-privileges:true','--entrypoint','/bin/sh',affineImages.gateway,'-c',probeScript],{input,timeout:15000});
 if(id==='postiz'&&typeof JSON.parse(output).register!=='boolean')throw Error('API original Postiz ainda não está pronta.');
 return {ok:true};
}

export async function destroyVerification(runtime){
 if(runtime.verificationMode!==true||!runtime.verificationRoot||fs.lstatSync(path.join(runtime.directory,'identity.json')).isSymbolicLink()||fs.lstatSync(runtime.directory).isSymbolicLink()||fs.realpathSync(runtime.directory)!==runtime.verificationRoot||JSON.parse(fs.readFileSync(path.join(runtime.directory,'identity.json'))).id!==runtime.identity.id)throw Error('A limpeza exige a identidade da cópia descartável.');
 const containers=new Set(runtime.verificationHelpers),networks=new Set(),volumes=new Set();
 for(const id of runtime.specs.keys()){
  const directory=path.join(runtime.directory,id);if(!fs.existsSync(path.join(directory,'runtime.json')))continue;
  const prefix='pa-'+runtime.identity.id+'-'+id;
  if(runtime.specs.get(id).compose){
   const file=path.join(directory,'compose.json'),settings=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json')));
   const compose=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):runtime.serverDefinition(id,settings,'a'.repeat(64)).compose;
   for(const [role,service]of Object.entries(compose.services)){if(service.container_name!==prefix+'-'+role)throw Error('Contêiner fora da cópia descartável.');containers.add(service.container_name);}
   for(const volume of Object.values(compose.volumes||{})){if(!volume.name.startsWith(prefix+'-'))throw Error('Volume fora da cópia descartável.');volumes.add(volume.name);}
  }else{
   for(const role of ['gateway','application',...(runtime.specs.get(id).localAI?['ollama']:[])])containers.add(prefix+'-'+role);
  }
  networks.add(prefix+'-network');
 }
 // Check every owner before removing anything. Only this fresh, unactivated
 // verification identity can use forced removal; originals are never selected.
 for(const [kind,names]of [['container',containers],['network',networks],['volume',volumes]])for(const name of names)await runtime.owned(kind,name);
 await runtime.close().catch(()=>{});
 for(const name of containers)if(await runtime.owned('container',name))await runtime.run(['rm','--force',name]);
 for(const name of networks)if(await runtime.owned('network',name))await runtime.run(['network','rm',name]);
 for(const name of volumes)if(await runtime.owned('volume',name))await runtime.run(['volume','rm',name]);
 await fsp.rm(runtime.directory,{recursive:true,force:true});
}
