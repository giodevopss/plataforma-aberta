import {captureCombinedFixture} from './combined-fixture.mjs';
// Real original app acceptance in a disposable Linux runner, never user data.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync,execFile} from 'node:child_process';import {promisify} from 'node:util';
import {chromium} from '../../desktop/node_modules/playwright/index.mjs';import {zipSync,strToU8} from '../../desktop/node_modules/fflate/esm/index.mjs';
import {CompleteRuntime,serverApps} from '../../desktop/src/complete-runtime.mjs';import {commandRunner} from '../../desktop/src/local-runtime.mjs';import {RuntimeBackup} from '../../desktop/src/runtime-backup.mjs';import {writeArchive,readArchive} from '../../desktop/src/backup-archive.mjs';
import {verifyNativePaperless} from './service-native-view.mjs';
import {cloudServiceRuntime} from './cloud-service-runtime.mjs';
if(process.env.CI!=='true'||!['linux','win32','darwin'].includes(process.platform))throw Error('This acceptance test requires a disposable Linux CI runner.');
const root=path.resolve('.'),temporary=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'pa-paperless-acceptance-')),evidence=path.join(root,'suite/research/cloud-paperless');fs.mkdirSync(evidence,{recursive:true});
const {runtime,restored,run,closeGuest}=await cloudServiceRuntime({temporary,specs:serverApps.filter(s=>s.id==='paperless'),onStatus:s=>console.log(s.id,s.status,s.detail)});
const captured=async args=>{let output='';try{await run(args,{timeout:120000,progress:chunk=>output=(output+chunk).slice(-2_000_000)});return output;}catch(error){return output+'\n'+error.message;}};
const checks=[];let browser,manager;const report={checked_at:new Date().toISOString(),status:'failed',commit:process.env.GITHUB_SHA,platform:process.platform,arch:process.arch,scope:'Full original Paperless service on Linux: OCR, Office conversion, metadata, downloads, browser UI and independent encrypted backup restore. Native desktop launcher/runtime installation remain separate acceptance.',checks};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function request(endpoint,route,{method='GET',body,headers={}}={}){
 const response=await fetch(endpoint.origin+route,{method,body,headers:{'X-PA-Session':endpoint.token,...headers},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Paperless '+method+' '+route+' returned '+response.status+': '+(await response.text()).slice(0,600));return response;
}
async function json(endpoint,route,options){return(await request(endpoint,route,options)).json();}
async function consume(endpoint,{name,type,bytes,title}){
 const form=new FormData();form.set('document',new Blob([bytes],{type}),name);form.set('title',title);
 const taskId=await json(endpoint,'/api/documents/post_document/',{method:'POST',body:form});assert.equal(typeof taskId,'string');
 for(let attempt=0;attempt<240;attempt++){
  const response=await json(endpoint,'/api/tasks/?task_id='+encodeURIComponent(taskId));const tasks=Array.isArray(response)?response:response.results||[];const task=tasks.find(t=>t.task_id===taskId)||tasks[0];
  if(task&&['FAILURE','FAILED'].includes(String(task.status).toUpperCase()))throw Error('Original consumption worker failed for '+name+': '+JSON.stringify(task).slice(0,2000));
  if(task&&['SUCCESS','SUCCESSFUL'].includes(String(task.status).toUpperCase())){const docs=await json(endpoint,'/api/documents/?page_size=100');const doc=docs.results.find(d=>d.title===title);if(doc)return doc;}
  await new Promise(r=>setTimeout(r,1000));
 }
 throw Error('Timed out waiting for original consumption worker: '+name);
}
function officeDocument(){const entries={
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/document.xml':'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Documento profissional local Suite Paperless</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'};return zipSync(Object.fromEntries(Object.entries(entries).map(([n,s])=>[n,strToU8(s)])));}
async function originalBrowser(endpoint,screenshot){
 const context=await browser.newContext({viewport:{width:1440,height:960}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===endpoint.origin?route.continue({headers:{...route.request().headers(),'X-PA-Session':endpoint.token}}):route.abort());
 const page=await context.newPage();try{await page.goto(endpoint.origin+'/documents');await page.getByText('QA documento OCR',{exact:false}).first().waitFor({timeout:45000});await page.screenshot({path:path.join(evidence,screenshot),fullPage:true});}catch(error){await page.screenshot({path:path.join(evidence,'browser-failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,'browser-failure.txt'),await page.locator('body').innerText().catch(()=>''));throw error;}finally{await context.close();}
}
try{
 const endpoint=await runtime.start('paperless');
 assert.equal((await fetch(endpoint.origin)).status,403);assert.equal((await fetch(endpoint.origin,{headers:{'Remote-User':'plataforma'}})).status,403);
 assert.equal((await fetch(endpoint.origin,{headers:{'X-PA-Session':endpoint.token,Origin:'https://example.com'}})).status,403);
 const users=await json(endpoint,'/api/users/',{headers:{'Remote-User':'forged-user'}});assert.ok((users.results||users).some(u=>u.username==='plataforma'));assert.ok(!(users.results||users).some(u=>u.username==='forged-user'));
 checks.push('Authenticated loopback gateway refuses anonymous/foreign-origin requests and overwrites forged identity headers; original supported remote-user auth opens the local account');
 const image=fs.readFileSync(path.join(root,'subprojetos/tests/fixtures/ocr.png'));
 const ocr=await consume(endpoint,{name:'ocr.png',type:'image/png',bytes:image,title:'QA documento OCR'});assert.match(ocr.content,/Plataforma/i);
 checks.push('Original asynchronous OCR worker recognized real synthetic PNG content with local Tesseract');
 const pdf=fs.readFileSync(path.join(root,'subprojetos/tests/fixtures/document.pdf'));
 const originalPDF=await consume(endpoint,{name:'original.pdf',type:'application/pdf',bytes:pdf,title:'QA documento PDF'});assert.match(originalPDF.content,/Plataforma/i);
 const docx=officeDocument();fs.writeFileSync(path.join(temporary,'office-fixture.docx'),docx);const office=await consume(endpoint,{name:'original.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:docx,title:'QA documento Office'});assert.match(office.content,/profissional/i);
 const archived=Buffer.from(await(await request(endpoint,'/api/documents/'+office.id+'/download/')).arrayBuffer());assert.equal(archived.subarray(0,4).toString(),'%PDF');
 checks.push('Tika and Gotenberg converted a real DOCX to searchable archival PDF, preserving original editable bytes');
 const tag=await json(endpoint,'/api/tags/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'QA preservacao local',color:'#116644'})});
 await json(endpoint,'/api/documents/'+ocr.id+'/',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({tags:[tag.id]})});
 const search=await json(endpoint,'/api/documents/?query=profissional');assert.ok(search.results.some(d=>d.id===office.id));
 for(const [doc,bytes]of [[ocr,image],[originalPDF,pdf],[office,docx]])assert.equal(digest(Buffer.from(await(await request(endpoint,'/api/documents/'+doc.id+'/download/?original=true')).arrayBuffer())),digest(bytes));
 checks.push('Original tags, indexed content search and byte-identical downloads passed for PNG, PDF and DOCX');
 browser=await chromium.launch({headless:true});await originalBrowser(endpoint,'original-library.png');checks.push('Original browser interface opens the local document library without external network access');
 if(process.env.PA_TEST_NATIVE_SERVICE==='1')await verifyNativePaperless({directory:runtime.directory,endpoint,evidence,checks});
 manager=new RuntimeBackup(runtime);const snapshot=path.join(temporary,'snapshot');let metadata;
 try{await manager.freeze();metadata=await manager.snapshot(snapshot);}finally{await manager.resume();manager=null;}await runtime.close();
 const archive=path.join(temporary,'recovery.pasuite'),passphrase=crypto.randomBytes(48).toString('base64url');await writeArchive({directory:snapshot,destination:archive,passphrase,metadata});const verified=path.join(temporary,'verified');const manifest=await readArchive({source:archive,directory:verified,passphrase});
 const storage=await new RuntimeBackup(restored).restoreIntoEmpty({snapshot:verified,manifest});assert.deepEqual(storage.applications,['paperless']);const recovered=await restored.start('paperless');assert.notEqual(recovered.origin,endpoint.origin);assert.notEqual(restored.identity.id,runtime.identity.id);
 const recoveredOCR=await json(recovered,'/api/documents/'+ocr.id+'/');assert.match(recoveredOCR.content,/Plataforma/i);assert.ok(recoveredOCR.tags.includes(tag.id));
 for(const [doc,bytes]of [[ocr,image],[originalPDF,pdf],[office,docx]])assert.equal(digest(Buffer.from(await(await request(recovered,'/api/documents/'+doc.id+'/download/?original=true')).arrayBuffer())),digest(bytes));
 await originalBrowser(recovered,'restored-library.png');checks.push('Independent encrypted cold restore recovered PostgreSQL, originals, OCR text, tags and original browser library with a fresh port and owner');
 await captureCombinedFixture({id:'paperless',snapshot:verified,metadata:manifest,state:{documents:[ocr,originalPDF,office].map(doc=>({id:doc.id,title:doc.title})),originalSHA256:[image,pdf,docx].map(digest)}});report.status='passed';report.documents=3;report.encryptedBackupBytes=fs.statSync(archive).size;console.log('PAPERLESS ACCEPTED',checks.length,'complete workflow checks');
}catch(error){report.error=error.message;
 const composeFile=path.join(runtime.directory,'paperless/compose.json');if(fs.existsSync(composeFile)){const compose=JSON.parse(fs.readFileSync(composeFile)),settings=JSON.parse(fs.readFileSync(path.join(runtime.directory,'paperless/runtime.json')));for(const [role,service]of Object.entries(compose.services)){let log=await captured(['logs','--tail','120',service.container_name]);log+='\nCONTAINER STATE\n'+await captured(['inspect','--format','{{json .State}}',service.container_name]);for(const value of Object.values(settings))if(typeof value==='string'&&value.length>=32)log=log.replaceAll(value,'[REDACTED]');fs.writeFileSync(path.join(evidence,role+'.log'),log);}
 if(fs.existsSync(path.join(temporary,'office-fixture.docx'))){const app=compose.services.application.container_name;await run(['cp',path.join(temporary,'office-fixture.docx'),app+':/tmp/pa-office-fixture.docx']);const diagnostic=await captured(['exec',app,'python','-c','from pathlib import Path\nfrom tika_client import TikaClient\nimport urllib.request\np=Path("/tmp/pa-office-fixture.docx")\nr=urllib.request.urlopen(urllib.request.Request("http://tika:9998/tika",data=p.read_bytes(),method="PUT",headers={"Content-Type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","Accept":"text/plain"}))\nprint("DIRECT HTTP",r.status,r.read().decode()[:1000])\nwith TikaClient(tika_url="http://tika:9998",timeout=60) as c:\n print(c.tika.as_text.from_file(p,"application/vnd.openxmlformats-officedocument.wordprocessingml.document"))']);fs.writeFileSync(path.join(evidence,'tika-direct-diagnostic.log'),diagnostic);}}
 throw error;}finally{
 await manager?.resume().catch(()=>{});await browser?.close();await runtime.close().catch(()=>{});await restored.close().catch(()=>{});await closeGuest();
 fs.writeFileSync(path.join(evidence,'acceptance.json'),JSON.stringify(report,null,2)+'\n');try{fs.rmSync(temporary,{recursive:true,force:true});}catch{console.warn('Temporary runner files will be discarded with the ephemeral VM; original test failure retained.');}
}
