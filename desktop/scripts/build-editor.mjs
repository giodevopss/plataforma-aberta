import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const upstream=path.join(root,'subprojetos/excalidraw/upstream');
const pinned=JSON.parse(fs.readFileSync(path.join(root,'subprojetos/excalidraw/UPSTREAM.json'))).commit;
if(execFileSync('git',['rev-parse','HEAD'],{cwd:upstream,encoding:'utf8'}).trim()!==pinned)throw Error('O checkout Excalidraw diverge do commit fixado.');
const {build}=await import(pathToFileURL(path.join(upstream,'node_modules/vite/dist/node/index.js')));
const {default:react}=await import(pathToFileURL(path.join(upstream,'node_modules/@vitejs/plugin-react/dist/index.mjs')));
const names=['common','element','math','utils','fractional-indexing','laser-pointer'];
const aliases=names.flatMap(name=>[{find:new RegExp('^@excalidraw/'+name+'$'),replacement:path.join(upstream,'packages',name,'src/index.ts')},{find:new RegExp('^@excalidraw/'+name+'/'),replacement:path.join(upstream,'packages',name,'src/')}]);
aliases.push({find:/^@excalidraw\/excalidraw$/,replacement:path.join(upstream,'packages/excalidraw/index.tsx')});
aliases.push({find:/^@excalidraw\/excalidraw\//,replacement:path.join(upstream,'packages/excalidraw/')});
aliases.push({find:/^react$/,replacement:path.join(upstream,'node_modules/react/index.js')},{find:/^react-dom\/client$/,replacement:path.join(upstream,'node_modules/react-dom/client.js')},{find:/^react-dom$/,replacement:path.join(upstream,'node_modules/react-dom/index.js')},{find:/^react\/jsx-runtime$/,replacement:path.join(upstream,'node_modules/react/jsx-runtime.js')});
const renderer=path.join(root,'desktop/renderer');
const licenses={name:'collect-distributed-licenses',generateBundle(_options,bundle){
 const roots=new Set();for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){
  if(!id.includes('node_modules'))continue;let dir=path.dirname(id.split('?')[0]);
  while(dir!==path.dirname(dir)){if(fs.existsSync(path.join(dir,'package.json'))&&JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).name){roots.add(dir);break;}dir=path.dirname(dir);}
 }
 const components=[...roots].map(dir=>{const p=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));const texts=fs.readdirSync(dir).filter(f=>/^(licen[cs]e|notice|copying)(\.|$)/i.test(f)&&fs.statSync(path.join(dir,f)).isFile()).map(f=>fs.readFileSync(path.join(dir,f),'utf8'));return{name:p.name,version:p.version,license:p.license||'SEE LICENSE',texts};});
 components.push({name:'Excalidraw source',version:JSON.parse(fs.readFileSync(path.join(root,'subprojetos/excalidraw/UPSTREAM.json'))).commit,license:'MIT',texts:[fs.readFileSync(path.join(upstream,'LICENSE'),'utf8')]});
 const fonts=path.join(upstream,'packages/excalidraw/fonts');for(const name of fs.readdirSync(fonts)){const index=path.join(fonts,name,'index.ts');if(fs.existsSync(index)){const source=fs.readFileSync(index,'utf8');const comments=[...source.matchAll(/\/\*([\s\S]*?)\*\//g)].map(m=>m[1]).filter(t=>/license|copyright/i.test(t));if(comments.length)components.push({name:'Font: '+name,version:'pinned upstream',license:/Open Font License/.test(comments.join(' '))?'OFL-1.1':/Apache/.test(comments.join(' '))?'Apache-2.0':/MIT/.test(comments.join(' '))?'MIT':'SEE FONT NOTICE',texts:comments});}}
 fs.writeFileSync(path.join(root,'desktop/resources/editor-components.json'),JSON.stringify(components,null,2)+'\n');
}};
await build({configFile:false,root:renderer,base:'/editor/',publicDir:false,plugins:[react(),licenses],resolve:{alias:aliases,dedupe:['react','react-dom']},define:{'process.env.NODE_ENV':'"production"'},build:{target:'es2022',outDir:path.join(root,'desktop/resources/editor'),emptyOutDir:true,assetsInlineLimit:0,rollupOptions:{input:path.join(renderer,'editor.html'),output:{assetFileNames:asset=>asset.name?.endsWith('.woff2')?'fonts/[name][extname]':'assets/[name]-[hash][extname]'}}}});
const output=path.join(root,'desktop/resources/editor');fs.renameSync(path.join(output,'editor.html'),path.join(output,'index.html'));
// Excalidraw requests local fonts by filename relative to EXCALIDRAW_ASSET_PATH.
function copyFonts(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,f.name);if(f.isDirectory())copyFonts(full);else if(f.name.endsWith('.woff2')){const relative=path.relative(path.join(upstream,'packages/excalidraw/fonts'),full);fs.mkdirSync(path.dirname(path.join(output,'fonts',relative)),{recursive:true});fs.copyFileSync(full,path.join(output,'fonts',relative));}}}
copyFonts(path.join(upstream,'packages/excalidraw/fonts'));
const commit=JSON.parse(fs.readFileSync(path.join(root,'subprojetos/excalidraw/UPSTREAM.json'))).commit;
fs.writeFileSync(path.join(root,'desktop/resources/excalidraw-provenance.json'),JSON.stringify({repository:'https://github.com/excalidraw/excalidraw',commit,license:'MIT',integration:'Direct build of the pinned source, not a rewrite',integration_files:['renderer/editor-src/editor.jsx','scripts/build-editor.mjs'],license_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(upstream,'LICENSE'))).digest('hex')},null,2)+'\n');
