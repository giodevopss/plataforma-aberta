// Private handoff between synthetic tests on ONE disposable runner. These files
// contain QA account settings and are never placed in the uploaded evidence.
import fs from 'node:fs/promises';import path from 'node:path';
import {UnifiedBackup} from '../../desktop/src/unified-backup.mjs';
const ids=new Set(['core','affine','baserow','activepieces','paperless','plane','formbricks','postiz','presenton','openwhispr','screenity']);
export async function captureCombinedFixture({id,snapshot,metadata,state={},archive,passphrase}){
 const configured=process.env.PA_COMBINED_FIXTURES;if(!configured)return;
 if(process.env.CI!=='true'||process.env.GITHUB_REPOSITORY!=='giodevopss/plataforma-aberta'||!ids.has(id))throw Error('Private synthetic fixture handoff requires the reviewed disposable workflow.');
 const root=await fs.realpath(configured),base=await fs.realpath(process.env.RUNNER_TEMP),marker=JSON.parse(await fs.readFile(path.join(root,'owner.json')));
 if(!root.toLowerCase().startsWith((base+path.sep).toLowerCase())||(await fs.lstat(configured)).isSymbolicLink()||marker.version!==1||marker.scope!=='private-combined-synthetic-fixtures')throw Error('Fixture handoff escaped the disposable runner.');
 const directory=path.join(root,id);await fs.mkdir(directory,{mode:0o700});
 if(archive){metadata=await UnifiedBackup.verify({source:archive,passphrase,directory:path.join(directory,'snapshot')});}
 else{try{await fs.rename(snapshot,path.join(directory,'snapshot'));}catch(error){if(error.code!=='EXDEV')throw error;await fs.cp(snapshot,path.join(directory,'snapshot'),{recursive:true,errorOnExist:true,force:false});await fs.rm(snapshot,{recursive:true});}}
 await fs.writeFile(path.join(directory,'fixture.json'),JSON.stringify({version:1,id,metadata,state})+'\n',{mode:0o600,flag:'wx'});
}
