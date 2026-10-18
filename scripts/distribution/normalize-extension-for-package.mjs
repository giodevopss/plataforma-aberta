import fs from 'node:fs';import path from 'node:path';
import {verifyExtensionBytes} from '../../desktop/src/extension-integrity.mjs';

// electron-builder deliberately excludes Finder caches. An executable-resource
// manifest must describe the distributed files, while retaining the exact raw
// accepted manifest and a receipt for every explicit non-code normalization.
export function normalizeExtensionForPackage({directory,entries}){
 const boundary=fs.realpathSync(directory),files=[],normalizations=[],omitted=[];
 if(!Array.isArray(entries)||!entries.length)throw Error('Empty accepted extension inventory.');
 for(const entry of entries){
  if(typeof entry.path!=='string'||entry.path.includes('\\')||path.isAbsolute(entry.path)||entry.path.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe accepted extension path.');
  const file=path.resolve(boundary,entry.path),stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||!fs.realpathSync(file).startsWith(boundary+path.sep))throw Error('Unsafe extension file: '+entry.path);
  const bytes=fs.readFileSync(file),checked=verifyExtensionBytes(entry,bytes);
  if(path.basename(entry.path)==='.DS_Store'){
   if(bytes.length<8||bytes.readUInt32BE(0)!==1||bytes.subarray(4,8).toString()!=='Bud1')throw Error('Unknown Finder metadata requires review: '+entry.path);
   omitted.push(file);normalizations.push({path:entry.path,originalSize:entry.size,originalSHA256:entry.sha256,change:'Verified non-executable Finder metadata omitted by the installer packager'});continue;
  }
  if(checked.normalization){normalizations.push({path:entry.path,...checked.normalization,canonicalSHA256:checked.sha256});delete checked.normalization;}
  files.push(checked);
 }
 // Verify all original resources before removing even an OS-generated cache.
 for(const file of omitted)fs.rmSync(file);
 return {files,normalizations};
}
