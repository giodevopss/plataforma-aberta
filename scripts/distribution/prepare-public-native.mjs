import {normalizeExtensionForPackage} from './normalize-extension-for-package.mjs';
// Install only immutable components that passed the public native acceptance.
import fs from 'node:fs';import path from 'node:path';import {verifiedDownload} from '../../desktop/src/download.mjs';import {extractNativeArchive} from '../../desktop/src/native-archive.mjs';import {hashFile} from '../../desktop/src/backup-archive.mjs';
const root=path.resolve(import.meta.dirname,'../..'),target=process.platform+'-'+process.arch,pins=JSON.parse(fs.readFileSync(path.join(root,'desktop/src/native-component-assets.json'))),adaptations=JSON.parse(fs.readFileSync(path.join(root,'suite/patches/openwhispr/PROVENANCE.json')));
const ids=process.argv.slice(2);if(!ids.length)ids.push('openwhispr','screenity');if(ids.some(id=>!['openwhispr','screenity'].includes(id))||new Set(ids).size!==ids.length)throw Error('Unknown or repeated native component');for(const id of ids){
 const spec=pins.components?.[id]?.[target],expected=id==='openwhispr'?'03f3134ba3935eef56eff319a30054766a3d6376':'dddeeb668ad285155a48fa89298f0fe2ef273579';
 if(spec?.version!==1||spec.id!==id||spec.target!==target||spec.sourceCommit!==expected||spec.accepted!==true||!/^https:\/\/github\.com\/giodevopss\/plataforma-aberta\/releases\/download\/component-[a-z]+-\d+-(?:darwin-arm64|darwin-x64|win32-x64)\/[A-Za-z0-9._-]+\.tar\.gz$/.test(spec.url))throw Error('A complete accepted native component is required for '+id+' '+target);
 const destination=path.join(root,'desktop/resources/native',id),archive=path.join(root,'desktop/.cache/native-'+id+'-'+target+'.tar.gz');if(fs.existsSync(destination))throw Error('Native component destination must be new; existing files preserved.');
 await verifiedDownload({...spec,destination:archive});
 try{
  await extractNativeArchive({...spec,file:archive,destination,maxBytes:3_000_000_000});const manifest=JSON.parse(fs.readFileSync(path.join(destination,'native-launcher.json')));if(manifest.id!==id||manifest.target!==target||manifest.sourceCommit!==expected)throw Error('Native package identity differs from accepted component.');
  if(id==='openwhispr'){const source=JSON.parse(fs.readFileSync(path.join(destination,'PLATAFORMA_SOURCE.json')));if(manifest.processRegistry!==1||JSON.stringify(source.files)!==JSON.stringify(adaptations.files)||source.commit!==adaptations.commit)throw Error('The accepted original voice source lacks the exact current adaptations.');}
  else {
   const normalized=normalizeExtensionForPackage({directory:path.join(root,'desktop/resources/screenity-extension'),entries:manifest.extensionFiles});manifest.extensionFiles=normalized.files;
   if(normalized.normalizations.length){fs.copyFileSync(path.join(destination,'native-launcher.json'),path.join(destination,'ACCEPTED_NATIVE_MANIFEST.json'));fs.writeFileSync(path.join(destination,'PLATAFORMA_PACKAGE_NORMALIZATION.json'),JSON.stringify(normalized.normalizations,null,2)+'\n');fs.writeFileSync(path.join(destination,'native-launcher.json'),JSON.stringify(manifest,null,2)+'\n');}
  }
  fs.writeFileSync(path.join(destination,'PUBLIC_COMPONENT.json'),JSON.stringify(spec,null,2)+'\n');console.log('Installed accepted original native component',id,target);
 }catch(error){fs.rmSync(destination,{recursive:true,force:true});throw error;}finally{fs.rmSync(archive,{force:true});}
}
