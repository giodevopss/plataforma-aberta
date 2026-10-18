import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../resources/ocr');
await fs.mkdir(dir,{recursive:true});
// Resolve and record one immutable dataset revision on the first setup.
const metadataFile=path.resolve(dir,'../ocr-provenance.json');let metadata;
try{metadata=JSON.parse(await fs.readFile(metadataFile,'utf8'));}catch{
 const r=await fetch('https://api.github.com/repos/naptha/tessdata/commits/gh-pages');if(!r.ok)throw Error('Não foi possível fixar a revisão do dataset OCR.');metadata={repository:'https://github.com/naptha/tessdata',commit:(await r.json()).sha,license:'Apache-2.0 (Tesseract language data)',files:{}};
}
for(const lang of ['por','eng']){
 const filename=lang+'.traineddata.gz';const url=`https://raw.githubusercontent.com/naptha/tessdata/${metadata.commit}/4.0.0/${filename}`;const r=await fetch(url);if(!r.ok)throw Error('Falha ao obter '+filename);const data=Buffer.from(await r.arrayBuffer());await fs.writeFile(path.join(dir,filename),data);metadata.files[filename]={url,sha256:crypto.createHash('sha256').update(data).digest('hex'),size:data.length};
}
await fs.writeFile(metadataFile,JSON.stringify(metadata,null,2)+'\n');console.log('OCR languages pinned:',metadata.commit);
