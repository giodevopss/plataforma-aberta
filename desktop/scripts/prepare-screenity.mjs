import fs from 'node:fs';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {verifiedDownload} from '../src/download.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const release=JSON.parse(fs.readFileSync(path.join(root,'suite/upstream/screenity-release.json')));
const asset=release.assets.find(a=>a.name==='build.zip');
if(!asset?.digest)throw Error('Official release checksum missing');
const zip=path.join(root,'desktop/.cache/screenity-'+release.tag_name+'.zip');
await verifiedDownload({url:asset.browser_download_url,sha256:asset.digest.slice(7),size:asset.size,destination:zip});
const output=path.join(root,'desktop/resources/screenity-extension');let total=0;
const entries=unzipSync(fs.readFileSync(zip),{filter:entry=>{
 total+=entry.originalSize;
 if(total>200_000_000||entry.originalSize>100_000_000||entry.name.startsWith('/')||entry.name.includes('\\')||entry.name.split('/').includes('..'))throw Error('Unsafe release archive');
 return true;
}});
fs.mkdirSync(output,{recursive:true});
for(const [name,bytes]of Object.entries(entries)){
 if(name.endsWith('/'))continue;
 const relative=name.startsWith('build/')?name.slice(6):name;
 const file=path.join(output,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
}
const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));
if(manifest.version!==release.tag_name.replace(/^v/,''))throw Error('Unexpected Screenity release');
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(path.join(root,'subprojetos/screenity/upstream',name),path.join(output,name));
fs.writeFileSync(path.join(output,'PROVENANCE.json'),JSON.stringify({source:release.html_url,version:manifest.version,asset:asset.browser_download_url,sha256:asset.digest,modifications:'None; original complete Chrome extension',license:'GPL-3.0',integration:'Dedicated Chromium profile required; Electron does not implement all extension APIs'},null,2)+'\n');
console.log('Prepared complete original Screenity',manifest.version,Object.keys(entries).length,'files');
