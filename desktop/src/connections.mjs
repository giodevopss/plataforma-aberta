import fs from 'node:fs';
import path from 'node:path';
export function validateConnections(value, ids){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Configuração inválida.');
 const allowed=new Set(ids),connections={};
 for(const [id,raw] of Object.entries(value)){
  if(!allowed.has(id))throw Error('Ferramenta desconhecida.');if(!raw)continue;
  if(typeof raw!=='string'||raw.length>2048)throw Error('Endereço inválido.');
  const url=new URL(raw);
  if(url.username||url.password||url.search||url.hash)throw Error('Use um endereço sem credenciais, parâmetros ou fragmentos.');
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw Error('Use HTTPS para servidores ou HTTP apenas no localhost.');
  connections[id]=url.href;
 }
 return connections;
}
export function readConnections(directory,ids){
 const filename=path.join(directory,'connections.json');
 if(!fs.existsSync(filename))return {};
 return validateConnections(JSON.parse(fs.readFileSync(filename,'utf8')),ids);
}
export function saveConnections(directory,value,ids){
 const clean=validateConnections(value,ids);fs.mkdirSync(directory,{recursive:true});
 const filename=path.join(directory,'connections.json'),temp=filename+'.tmp';fs.writeFileSync(temp,JSON.stringify(clean,null,2)+'\n',{mode:0o600});fs.renameSync(temp,filename);return clean;
}
export function safeRemoteNavigation(raw,base){
 try{const url=new URL(raw);return url.protocol==='https:'||(url.protocol==='http:'&&url.origin===new URL(base).origin)||url.protocol==='about:';}catch{return false;}
}
