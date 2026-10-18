import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {build}=await import(pathToFileURL(path.join(root,'subprojetos/excalidraw/upstream/node_modules/vite/dist/node/index.js')));
const components=new Map();
const notices={name:'notes-licenses',generateBundle(_options,bundle){for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){if(!id.includes('node_modules'))continue;let dir=path.dirname(id.split('?')[0]);while(dir!==path.dirname(dir)){const f=path.join(dir,'package.json');if(fs.existsSync(f)){const p=JSON.parse(fs.readFileSync(f));if(p.name){components.set(dir,p);break;}}dir=path.dirname(dir);}}
 const records=[...components].map(([dir,p])=>({name:p.name,version:p.version,license:p.license||'SEE LICENSE',source:p.name.startsWith('@blocksuite/')?'https://github.com/toeverything/blocksuite/tree/df177511c94f1df7f63a06ed1d855a4185a34597':undefined,texts:fs.readdirSync(dir).filter(f=>/^(licen[cs]e|notice|copying)(\.|$)/i.test(f)&&fs.statSync(path.join(dir,f)).isFile()).map(f=>fs.readFileSync(path.join(dir,f),'utf8'))}));fs.writeFileSync(path.join(root,'desktop/resources/notes-components.json'),JSON.stringify(records,null,2)+'\n');
}};
await build({configFile:false,root:path.join(root,'desktop/renderer'),base:'/notes/',publicDir:false,plugins:[notices],resolve:{dedupe:['yjs','lit','@blocksuite/store','@blocksuite/sync','@blocksuite/global']},build:{target:'es2022',outDir:path.join(root,'desktop/resources/notes'),emptyOutDir:true,rollupOptions:{input:path.join(root,'desktop/renderer/notes.html')}}});
fs.renameSync(path.join(root,'desktop/resources/notes/notes.html'),path.join(root,'desktop/resources/notes/index.html'));
fs.writeFileSync(path.join(root,'desktop/resources/blocksuite-provenance.json'),JSON.stringify({repository:'https://github.com/toeverything/blocksuite',commit:'df177511c94f1df7f63a06ed1d855a4185a34597',packages:{'@blocksuite/presets':'0.19.5','@blocksuite/store':'0.19.5'},license:'MPL-2.0',integration:'Official prebuilt BlockSuite components, unmodified, with native workspace persistence and blobs'},null,2)+'\n');
