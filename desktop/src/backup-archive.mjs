import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import * as tar from 'tar';
const scrypt=promisify(crypto.scrypt);
const MAGIC=Buffer.alloc(16);MAGIC.write('PASUITE2AESGCM');
const HEADER_SIZE=60;
const RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
export function archivePath(value){
 if(typeof value!=='string'||!value||value.length>4096||value.includes('\\')||/[\x00-\x1f\x7f:]/.test(value)||value.startsWith('/'))throw Error('Caminho inválido no backup.');
 const parts=value.replace(/\/$/,'').split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||RESERVED.test(p)))throw Error('Caminho incompatível no backup.');
 return parts.join('/');
}
export function volumeArchivePath(value){
 // These members are restored only into Linux container volumes, never the
 // macOS/Windows host. Preserve legitimate case, reserved names and final dots.
 if(typeof value!=='string'||!value||value.length>4096||value.startsWith('/')||value.includes('\\')||/[\x00-\x1f\x7f]/.test(value))throw Error('Caminho inválido no volume.');
 const normalized=value.replace(/^\.\//,'').replace(/\/$/,'');if(normalized.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Caminho inválido no volume.');return normalized;
}
async function derive(passphrase,salt){if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)throw Error('Use uma senha de backup com pelo menos 12 caracteres.');return scrypt(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
export async function hashFile(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function inventory(directory,{maxFiles=1000000,maxBytes=1024**4}={}){
 const files=Object.create(null),names=new Set();let count=0,total=0;
 async function walk(relative=''){
  for(const entry of await fsp.readdir(path.join(directory,relative),{withFileTypes:true})){
   const name=archivePath(relative?relative+'/'+entry.name:entry.name);if(name==='manifest.json'&&!relative)continue;
   const key=name.toLocaleLowerCase('en-US');if(names.has(key))throw Error('Nomes de arquivos colidem entre macOS e Windows.');names.add(key);
   const filename=path.join(directory,name);const stat=await fsp.lstat(filename);
   if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory()))throw Error('Links ou arquivos especiais não são aceitos no backup: '+name);
   if(stat.isDirectory())await walk(name);
   else{if(++count>maxFiles||(total+=stat.size)>maxBytes)throw Error('Backup excede o limite de arquivos ou espaço.');files[name]={size:stat.size,sha256:await hashFile(filename)};}
  }
 }
 await walk();return {files,bytes:total};
}
export async function writeArchive({directory,destination,passphrase,metadata={},limits={}}){
 directory=path.resolve(directory);destination=path.resolve(destination);
 if(destination===directory||destination.startsWith(directory+path.sep))throw Error('Salve o backup fora da pasta que será copiada.');
 const list=await inventory(directory,limits);
 const manifest={...metadata,format:'plataforma-aberta-unified',version:2,created_at:new Date().toISOString(),files:list.files};
 await fsp.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest)+'\n',{mode:0o600});
 const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12),header=Buffer.concat([MAGIC,salt,iv]);
 const key=await derive(passphrase,salt),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);key.fill(0);
 const temporary=destination+'.'+crypto.randomUUID()+'.tmp';
 try{
  await fsp.writeFile(temporary,header,{mode:0o600,flag:'wx'});
  await pipeline(tar.c({cwd:directory,portable:true,noMtime:true,strict:true},['manifest.json',...Object.keys(list.files)]),createGzip({level:3}),cipher,fs.createWriteStream(temporary,{flags:'a',mode:0o600}));
  await fsp.appendFile(temporary,cipher.getAuthTag());
  const handle=await fsp.open(temporary,'r+');await handle.sync();await handle.close();
  await fsp.rename(temporary,destination);
  return {file:destination,bytes:(await fsp.stat(destination)).size,files:Object.keys(list.files).length};
 }finally{await fsp.rm(temporary,{force:true});}
}
export async function validateTar(file,{maxFiles=1000000,maxBytes=1024**4,volumeRoot=false}={}){
 const names=new Set();let count=0,total=0;
 const parser=new tar.Parser({strict:true,maxMetaEntrySize:1024*1024,onReadEntry:entry=>{try{
  if(volumeRoot&&entry.type==='Directory'&&['.','./'].includes(entry.path)){entry.resume();return;}
  const name=volumeRoot?volumeArchivePath(entry.path):archivePath(entry.path),key=volumeRoot?name:name.toLocaleLowerCase('en-US');if(names.has(key))throw Error('Arquivo duplicado no backup.');names.add(key);
  if(!['File','Directory'].includes(entry.type))throw Error('Link ou arquivo especial no backup.');
  if(++count>maxFiles||!Number.isSafeInteger(entry.size)||entry.size<0||(total+=entry.size)>maxBytes)throw Error('Backup excede o limite de restauração.');
 }catch(e){parser.abort(e);}finally{entry.resume();}}});
 await pipeline(fs.createReadStream(file),parser);return {files:count,bytes:total};
}
export async function readArchive({source,directory,passphrase,limits={}}){
 if(await fsp.stat(directory).catch(()=>null))throw Error('A pasta de restauração já existe.');
 const stat=await fsp.stat(source);if(stat.size<HEADER_SIZE+16)throw Error('Backup truncado.');
 const handle=await fsp.open(source,'r');const header=Buffer.alloc(HEADER_SIZE),tag=Buffer.alloc(16);
 try{await handle.read(header,0,HEADER_SIZE,0);await handle.read(tag,0,16,stat.size-16);}finally{await handle.close();}
 if(!header.subarray(0,16).equals(MAGIC))throw Error('Formato de backup incompatível.');
 const key=await derive(passphrase,header.subarray(16,48)),decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(48,60));decipher.setAAD(header);decipher.setAuthTag(tag);key.fill(0);
 const tarFile=directory+'.'+crypto.randomUUID()+'.tar.gz';
 try{
  try{await pipeline(fs.createReadStream(source,{start:HEADER_SIZE,end:stat.size-17}),decipher,fs.createWriteStream(tarFile,{flags:'wx',mode:0o600}));}catch{throw Error('Senha incorreta ou backup corrompido. Nenhum dado atual foi alterado.');}
  const expanded=await validateTar(tarFile,limits);const disk=fs.statfsSync(path.dirname(directory));if(disk.bavail*disk.bsize<expanded.bytes+100_000_000)throw Error('Espaço livre insuficiente para restaurar este backup.');
  await fsp.mkdir(directory,{recursive:true,mode:0o700});
  await tar.x({file:tarFile,cwd:directory,strict:true,noChmod:true,noMtime:true,filter:(_name,entry)=>['File','Directory'].includes(entry.type)});
  const manifest=JSON.parse(await fsp.readFile(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.format!=='plataforma-aberta-unified'||manifest.version!==2||!manifest.files||typeof manifest.files!=='object'||Array.isArray(manifest.files))throw Error('Manifesto incompatível.');
  const actual=await inventory(directory,limits);const entries=Object.entries(manifest.files);
  if(entries.length!==Object.keys(actual.files).length)throw Error('Arquivos ausentes ou inesperados no backup.');
  for(const [name,expected]of entries){archivePath(name);if(!actual.files[name]||actual.files[name].size!==expected.size||actual.files[name].sha256!==expected.sha256)throw Error('Checksum inválido no backup.');}
  return manifest;
 }catch(e){await fsp.rm(directory,{recursive:true,force:true});throw e;}finally{await fsp.rm(tarFile,{force:true});}
}
