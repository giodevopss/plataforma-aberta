import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..'),source=path.join(root,'subprojetos/openwhispr/upstream'),base=path.join(root,'suite/patches/openwhispr'),manifest=JSON.parse(fs.readFileSync(path.join(base,'PROVENANCE.json'))),target=path.join(root,'suite/runtime/openwhispr-build');
const git=args=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
if(git(['rev-parse','HEAD'])!==manifest.commit||git(['status','--porcelain','--untracked-files=no']))throw Error('The original source must match the clean pinned commit.');
if(fs.existsSync(target))throw Error('Use a new managed build directory; no existing app will be overwritten.');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const file of manifest.files){const original=path.join(source,file.path);if(file.original_sha256===null){if(fs.existsSync(original))throw Error('Unexpected existing adaptation module: '+file.path);}else if(sha(fs.readFileSync(original))!==file.original_sha256)throw Error('Unexpected original module: '+file.path);}
fs.mkdirSync(target,{recursive:true});
try{
 const files=execFileSync('git',['-C',source,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 for(const relative of files){if(path.isAbsolute(relative)||relative.split('/').some(p=>p==='..')||relative.includes('\\'))throw Error('Unsafe source path.');const original=path.join(source,relative),destination=path.join(target,relative);if(!fs.lstatSync(original).isFile())throw Error('Unexpected non-file in native source.');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(original,destination);fs.chmodSync(destination,fs.statSync(original).mode&0o777);}
 const patch=path.join(base,'isolation.patch');execFileSync('git',['-C',target,'apply','--check',patch]);execFileSync('git',['-C',target,'apply',patch]);
 for(const file of manifest.files)if(sha(fs.readFileSync(path.join(target,file.path)))!==file.sha256)throw Error('Fork adaptation checksum mismatch: '+file.path);
 fs.writeFileSync(path.join(target,'PLATAFORMA_SOURCE.json'),JSON.stringify({...manifest,originalFiles:files.length,originalSourceUnchanged:true},null,2)+'\n');console.log('Prepared complete original native source with',manifest.files.length,'verified isolation adaptations.');
}catch(error){fs.rmSync(target,{recursive:true,force:true});throw error;}
