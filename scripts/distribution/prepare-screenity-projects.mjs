// SPDX-License-Identifier: GPL-3.0-only
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(import.meta.dirname,'../..'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const originalHashes={
 'editor.bundle.js':'cc3eb8a962ebf70221259ca0969506b263d6e62529620d034719050d4b17e5e4',
 'editor.html':'8e835f3227c8b0e00264783d9a46b35ac6b511d606a884ec54fe019231df4a25'
};
export function patchScreenityProjectFiles({directory,module,sourcePatch}){
 const bundle=fs.readFileSync(path.join(directory,'editor.bundle.js'),'utf8'),html=fs.readFileSync(path.join(directory,'editor.html'),'utf8');
 for(const [name,bytes]of [['editor.bundle.js',bundle],['editor.html',html]])if(sha(bytes)!==originalHashes[name])throw Error('Screenity original differs from the reviewed complete release: '+name);
 const edits=[['return x.current=n,n','return x.current=n,window.paScreenityDrafts?.observe(n),n'],['const ue=async(e=null,t)=>{if(i.current)return;i.current=!0,g("Sandbox makeVideoTab.enter",','const ue=async(e=null,t)=>{if(i.current)return;i.current=!0;if(await window.paScreenityDrafts?.restore(G)){e?.({status:"ok"});return;}g("Sandbox makeVideoTab.enter",']];
 let patched=bundle;for(const [before,after]of edits){if(patched.split(before).length!==2)throw Error('Screenity project hook must match exactly once.');patched=patched.replace(before,after);}
 const entry='<script defer="defer" src="/editor.bundle.js"></script>';if(html.split(entry).length!==2)throw Error('Screenity editor entry differs.');
 const outputs={'editor.bundle.js':patched,'editor.html':html.replace(entry,'<script src="/plataforma-projects.js"></script>'+entry),'plataforma-projects.js':'(()=>{\n'+module.replace(/^export /gm,'')+'\ninstallProjects(window);\n})();\n','PLATAFORMA_PROJECTS_SOURCE.mjs':module,'PLATAFORMA_PROJECTS_SOURCE.patch':sourcePatch};
 const provenance={version:1,sourceCommit:'dddeeb668ad285155a48fa89298f0fe2ef273579',license:'GPL-3.0-only',scope:'Complete original recording/editor code preserved. Adds local durable project storage, editable original history and conflict detection. No network storage.',originalHashes,outputs:Object.entries(outputs).map(([name,bytes])=>({name,sha256:sha(bytes)}))};
 for(const [name,bytes]of Object.entries(outputs))fs.writeFileSync(path.join(directory,name),bytes);
 fs.writeFileSync(path.join(directory,'PLATAFORMA_PROJECTS.json'),JSON.stringify(provenance,null,2)+'\n');return provenance;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const directory=path.join(root,'desktop/resources/screenity-extension');
 console.log(JSON.stringify(patchScreenityProjectFiles({directory,module:fs.readFileSync(path.join(root,'desktop/src/screenity-projects.mjs'),'utf8'),sourcePatch:fs.readFileSync(path.join(root,'suite/patches/screenity/projects.patch'),'utf8')})));
}
