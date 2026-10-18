import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'desktop/resources');
const projects=JSON.parse(fs.readFileSync(path.join(root,'scripts/audit/projects.json')));
fs.mkdirSync(path.join(out,'inspections'),{recursive:true});
// Reduced research apps stay in subprojetos; they are excluded from the desktop product.
fs.rmSync(path.join(out,'apps'),{recursive:true,force:true});
fs.rmSync(path.join(out,'shared'),{recursive:true,force:true});
fs.rmSync(path.join(out,'notes'),{recursive:true,force:true});
for(const p of projects)fs.copyFileSync(path.join(root,'subprojetos',p.id,'INSPECAO.md'),path.join(out,'inspections',p.id+'.md'));
fs.mkdirSync(path.join(out,'shell'),{recursive:true});
for(const f of ['index.html','style.css','app.mjs','storage-bridge.html'])fs.copyFileSync(path.join(root,'desktop/renderer',f),path.join(out,'shell',f));
fs.writeFileSync(path.join(out,'projects.json'),JSON.stringify(projects,null,2)+'\n');
const dirs=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['ls','--omit=dev','--all','--parseable'],{cwd:path.join(root,'desktop'),encoding:'utf8',maxBuffer:10_000_000}).trim().split(/\r?\n/).slice(1);
const notices=[...JSON.parse(fs.readFileSync(path.join(out,'editor-components.json'))),{name:'Graphite complete application',version:JSON.parse(fs.readFileSync(path.join(out,'graphite-provenance.json'))).commit,license:'MIT OR Apache-2.0',texts:[fs.readFileSync(path.join(root,'subprojetos/graphite/upstream/LICENSE-APACHE'),'utf8'),fs.readFileSync(path.join(root,'subprojetos/graphite/upstream/LICENSE-MIT'),'utf8'),fs.readFileSync(path.join(out,'graphite/third-party-licenses.txt'),'utf8')]}];
for(const dir of dirs){const f=path.join(dir,'package.json');if(!fs.existsSync(f))continue;const p=JSON.parse(fs.readFileSync(f));const texts=fs.readdirSync(dir).filter(f=>/^(licen[cs]e|notice|copying)(\.|$)/i.test(f)&&fs.statSync(path.join(dir,f)).isFile()).map(f=>fs.readFileSync(path.join(dir,f),'utf8'));notices.push({name:p.name,version:p.version,license:p.license||'SEE LICENSE',texts});}
const unique=[...new Map(notices.map(n=>[n.name+'@'+n.version,n])).values()].sort((a,b)=>a.name.localeCompare(b.name));
unique.push({name:'Presenton status response adaptation',version:'sha256:2d0cbef8972fcab1cee1715da6996d617ca54c886ebf8e864b54f2035adbdc6b',license:'Apache-2.0',texts:[fs.readFileSync(path.join(out,'presenton-patches/LICENSE'),'utf8')]});
unique.push({name:'Lucide and original suite Graphite asset replacements',version:JSON.parse(fs.readFileSync(path.join(out,'graphite-assets.json'))).lucide_version,license:'ISC and MIT',texts:[fs.readFileSync(path.join(out,'graphite-open-assets-license.txt'),'utf8')]});
unique.push({name:'Activepieces compiled internal API contract adaptation',version:JSON.parse(fs.readFileSync(path.join(root,'desktop/src/activepieces-patches.json'))).image,license:'MIT; enterprise code excluded from this adaptation',source:'https://github.com/activepieces/activepieces',texts:[fs.readFileSync(path.join(out,'stack-config/activepieces/LICENSE'),'utf8')]});
fs.writeFileSync(path.join(out,'THIRD_PARTY_NOTICES.txt'),unique.map(n=>`\n${'='.repeat(70)}\n${n.name} ${n.version}\nLicense: ${n.license}\n\n${n.source?'Source: '+n.source+'\n':''}${n.texts.join('\n\n')}`).join('\n'));
fs.writeFileSync(path.join(out,'shell/notices.json'),JSON.stringify(unique.map(({texts,...rest})=>rest),null,2)+'\n');
fs.copyFileSync(path.join(root,'desktop/node_modules/electron/LICENSE'),path.join(out,'ELECTRON_LICENSE.txt'));
fs.copyFileSync(path.join(root,'desktop/node_modules/electron/dist/LICENSES.chromium.html'),path.join(out,'CHROMIUM_LICENSES.html'));
console.log('Prepared full Excalidraw and Graphite engines, local runtime, shell and',unique.length,'component notices');
