import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {copyPortableTree} from './snapshot-files.mjs';

// Linux package links in a WSL bind mount cannot be resolved by Windows. Resolve
// them inside their original Linux path, enforcing the same app-only boundary,
// and transfer ordinary files. No raw symlinks enter the portable archive.
export async function copyLinuxSnapshotTree(runtime,{source,destination,image,containerPath}){
 if(await fs.lstat(destination).catch(error=>{if(error.code==='ENOENT')return null;throw error;}))throw Error('Snapshot Linux exige um destino novo.');
 const stat=await fs.lstat(source).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(!stat){await fs.mkdir(destination,{recursive:true,mode:0o700});return;}
 if(!stat.isDirectory()||stat.isSymbolicLink()||!/^\/[a-zA-Z0-9/._-]+$/.test(containerPath))throw Error('Pasta Linux de snapshot inválida.');
 const transferRoot=runtime.volumeTransferDirectory||path.dirname(destination);
 await fs.mkdir(transferRoot,{recursive:true,mode:0o700});if((await fs.lstat(transferRoot)).isSymbolicLink())throw Error('Pasta de transferência Linux inválida.');
 const transfer=await fs.mkdtemp(path.join(transferRoot,'linux-tree-'));let helper;
 try{
  const script=path.join(transfer,'copy.mjs'),output=path.join(transfer,'data');await fs.mkdir(output,{mode:0o700});
  const sourceCode=await fs.readFile(new URL('./snapshot-files.mjs',import.meta.url),'utf8');
  await fs.writeFile(script,sourceCode+'\nawait copyPortableTree(process.argv[2],process.argv[3]);\n',{mode:0o644,flag:'wx'});
  helper='pa-'+runtime.identity.id+'-snapshot-tree-'+crypto.randomBytes(6).toString('hex');runtime.verificationHelpers?.add(helper);
  await runtime.ensureImage(image);
  await runtime.run(['run','--rm','--name',helper,'--label','app.plataforma-aberta.workspace='+runtime.identity.id,'--network','none','--user','0:0','--read-only','--cap-drop','ALL','--cap-add','DAC_READ_SEARCH','--security-opt','no-new-privileges:true','--memory','512m','--mount',`type=bind,source=${source},target=${containerPath},readonly`,'--mount',`type=bind,source=${script},target=/opt/plataforma-copy.mjs,readonly`,'--mount',`type=bind,source=${output},target=/snapshot`,'--entrypoint','node',image,'/opt/plataforma-copy.mjs',containerPath,'/snapshot'],{timeout:900000});
  await copyPortableTree(output,destination);
 }catch(error){if(helper){try{if(await runtime.owned('container',helper))await runtime.run(['rm','--force',helper]);}catch(cleanup){throw new AggregateError([error,cleanup],'A transferência falhou e o auxiliar Linux não pôde ser encerrado.');}}throw error;
 }finally{await fs.rm(transfer,{recursive:true,force:true});}
}
