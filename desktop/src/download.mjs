import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {hashFile} from './backup-archive.mjs';

export async function verifiedDownload({url,sha256,size,destination,fetcher=fetch,onProgress=()=>{}}){
 const address=new URL(url);
 if(address.protocol!=='https:'||address.username||address.password||!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(size)||size<1)throw Error('Pacote de instalação inválido.');
 const existing=await fsp.stat(destination).catch(()=>null);
 if(existing?.isFile()&&existing.size===size&&await hashFile(destination)===sha256)return {cached:true,file:destination};
 await fsp.mkdir(path.dirname(destination),{recursive:true,mode:0o700});
 const disk=fs.statfsSync(path.dirname(destination));
 if(disk.bavail*disk.bsize<size+500_000_000)throw Error('Espaço livre insuficiente para baixar este componente.');
 const temporary=destination+'.'+crypto.randomUUID()+'.part';let received=0;
 try{
  const response=await fetcher(url,{signal:AbortSignal.timeout(1800000)});
  if(!response.ok||!response.body)throw Error('Download falhou: HTTP '+response.status);
  if(response.url&&new URL(response.url).protocol!=='https:')throw Error('Redirecionamento inseguro.');
  const meter=new Transform({transform(chunk,_encoding,done){received+=chunk.length;if(received>size)return done(Error('Pacote excede o tamanho oficial.'));onProgress({received,total:size});done(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),meter,fs.createWriteStream(temporary,{flags:'wx',mode:0o600}));
  if(received!==size||await hashFile(temporary)!==sha256)throw Error('O pacote não passou na verificação SHA-256.');
  await fsp.rename(temporary,destination);return {cached:false,file:destination};
 }finally{await fsp.rm(temporary,{force:true});}
}
