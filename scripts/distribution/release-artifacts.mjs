import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
export async function sha256(file){const hash=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);return hash.digest('hex');}
export function remoteChecksum({repo,tag,name,gh='gh'}){
 return new Promise((resolve,reject)=>{
  const child=spawn(gh,['release','download',tag,'--repo',repo,'--pattern',name,'--output','-'],{stdio:['ignore','pipe','pipe']});
  const hash=crypto.createHash('sha256');let size=0,error='';
  child.stdout.on('data',bytes=>{size+=bytes.length;hash.update(bytes);});child.stderr.on('data',bytes=>{error=(error+bytes).slice(-4000);});
  child.on('error',reject);child.on('close',code=>code===0?resolve({size,sha256:hash.digest('hex')}):reject(Error('Falha na leitura remota: '+error)));
 });
}
export async function publishArtifact({file,repo,tag,receipt,gh='gh'}){
 const name=path.basename(file);if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(name))throw Error('Nome de artefato inválido.');
 const expected={size:fs.statSync(file).size,sha256:await sha256(file)};
 // Never clobber an existing asset: an interruption must leave the previous recovery copy intact.
 const {stdout}=await exec(gh,['release','view',tag,'--repo',repo,'--json','assets,url'],{maxBuffer:2_000_000});
 const release=JSON.parse(stdout);const existing=release.assets.find(asset=>asset.name===name);
 if(!existing)await exec(gh,['release','upload',tag,file,'--repo',repo],{maxBuffer:1_000_000});
 const actual=await remoteChecksum({repo,tag,name,gh});
 if(actual.size!==expected.size||actual.sha256!==expected.sha256)throw Error('O arquivo na nuvem diverge do local. Nada pode ser removido.');
 const result={version:1,verified_at:new Date().toISOString(),repository:repo,tag,releaseUrl:release.url,name,...expected,verification:'Full authenticated remote read-back, streamed SHA-256 and exact byte count',localFile:path.resolve(file)};
 fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file,repo,tag,receipt]=process.argv.slice(2);if(!receipt)throw Error('Uso: release-artifacts.mjs arquivo repo tag recibo');console.log(JSON.stringify(await publishArtifact({file,repo,tag,receipt}),null,2));
}
