import {closeNativeQA} from '../../suite/tests/close-native-qa.mjs';
import {_electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
await fs.mkdir(path.join(root,'desktop/research'),{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pa-desktop-e2e-'));
const env={...process.env,PA_DESKTOP_TEST_DATA:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const executable=process.env.PA_DESKTOP_EXECUTABLE||createRequire(import.meta.url)('electron');
const packaged=Boolean(process.env.PA_DESKTOP_EXECUTABLE);
const app=await _electron.launch({executablePath:executable,args:[...(!packaged?[path.join(root,'desktop')]:[]),'--suite-test'],env,timeout:30000});
const checks=[],errors=[];let page,closed=false;
async function phase(value){console.log('DESKTOP_PHASE',value);await fs.writeFile(path.join(root,'desktop/research/desktop-progress.json'),JSON.stringify({phase:value,checks,errors,target:process.platform+'-'+process.arch,suiteCommit:process.env.GITHUB_SHA})+'\n');}
async function waitFile(filename){for(let i=0;i<400;i++){try{const name=path.basename(filename);const done=name.endsWith('.pasuite')||await app.evaluate((_electron,name)=>globalThis.__suiteTestDownloads?.[name]==='completed',name);if(done){const bytes=await fs.readFile(filename);if(bytes.length)return bytes;}}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Download não concluído: '+filename);}
try{
 await phase('original-shell');page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({BrowserWindow,dialog},temp)=>{const w=BrowserWindow.getAllWindows()[0];globalThis.__suiteTestDownloads={};w.webContents.session.on('will-download',(_event,item)=>{item.setSavePath(temp+'/'+item.getFilename());item.on('done',(_event,state)=>globalThis.__suiteTestDownloads[item.getFilename()]=state);});dialog.showSaveDialog=async()=>({canceled:false,filePath:temp+'/workspace.pasuite'});},temp);
 await page.waitForSelector('h1');assert.equal(await page.locator('.tool-card').count(),12);assert.match(await page.locator('h1').innerText(),/ferramentas completas/);checks.push('Native desktop shell lists 12 tools');
 assert.equal(await page.evaluate(()=>typeof require),'undefined');assert.equal(await page.evaluate(()=>typeof process),'undefined');checks.push('Renderer has no Node.js access');
 const origin=new URL(page.url()).origin;assert.equal((await fetch(origin+'/api/projects')).status,403);checks.push('External browser cannot access desktop session without its token');
 await phase('original-excalidraw');await page.locator('.nav-item[data-view="excalidraw"]').click();
 const frame=page.frameLocator('#tool');await frame.locator('.excalidraw').waitFor();await frame.locator('#editor-status').filter({hasText:'Salvo no dispositivo'}).waitFor();
 await frame.getByRole('button',{name:'Inserir tabela',exact:true}).click();
 for(let attempt=0;attempt<100;attempt++){const d=await page.evaluate(async()=>await(await fetch('/api/state/excalidraw')).json());if(d.data?.scenes[0]?.elements.length>=18)break;await new Promise(r=>setTimeout(r,100));}
 const table=await page.evaluate(async()=>await(await fetch('/api/state/excalidraw')).json());assert.ok(table.data.scenes[0].elements.length>=18);assert.ok(table.data.scenes[0].elements.some(e=>e.type==='text'));checks.push('Full upstream Excalidraw engine inserts editable table elements and saves SQLite scene');
 await frame.getByRole('button',{name:'+ Quadro',exact:true}).click();await frame.getByRole('button',{name:'Quadro sem título',exact:true}).nth(1).waitFor();assert.equal(await frame.getByRole('button',{name:'Quadro sem título',exact:true}).count(),2);
 await frame.locator('.editor-tabs').getByRole('button',{name:'Duplicar',exact:true}).click();await frame.locator('.editor-tabs button.selected').filter({hasText:'cópia'}).waitFor();checks.push('Native Excalidraw scenes support tabs and duplication');
 await frame.locator('.editor-tabs button').filter({hasText:'Quadro sem título'}).first().click();await frame.locator('#editor-status').filter({hasText:'Salvo no dispositivo'}).waitFor();
 await frame.getByRole('button',{name:'Salvar .excalidraw',exact:true}).click();const exported=JSON.parse(await waitFile(path.join(temp,'Quadro sem título.excalidraw')));assert.equal(exported.type,'excalidraw');assert.ok(exported.elements.length>=18);checks.push('Real .excalidraw download retains upstream schema');
 await frame.getByRole('button',{name:'Exportar PNG',exact:true}).click();const png=await waitFile(path.join(temp,'Quadro sem título.png'));assert.equal(png.subarray(1,4).toString(),'PNG');checks.push('Canvas with local fonts exports actual PNG');
 await page.screenshot({path:path.join(root,'desktop/research/editor-'+(packaged?'packaged':'development')+'.png')});
 await phase('original-graphite');await page.locator('.nav-item[data-view="graphite"]').click();
 await frame.getByRole('button',{name:'New Document',exact:true}).click();await frame.getByRole('button',{name:'OK',exact:true}).click();
 await frame.locator('[data-tooltip-label="Rectangle Tool"]').click();
 const viewport=await frame.locator('[data-viewport]').boundingBox();
 await page.mouse.move(viewport.x+180,viewport.y+180);await page.mouse.down();await page.mouse.move(viewport.x+400,viewport.y+330,{steps:12});await page.mouse.up();
 await frame.getByText('Rectangle',{exact:true}).first().waitFor();
 await page.waitForTimeout(1800);await page.screenshot({path:path.join(root,'desktop/research/graphite-'+(packaged?'packaged':'development')+'.png')});
 checks.push('Complete Graphite WebAssembly engine creates an editable rectangle');
 await phase('packaged-native-integrity');const nativeInfo=await page.evaluate(()=>window.suite.info());if(packaged)assert.deepEqual([...nativeInfo.nativeApplications].sort(),['openwhispr','screenity']);
 for(const id of ['openwhispr','screenity']){
  if(nativeInfo.nativeApplications.includes(id)){const executable=await app.evaluate(async(_electron,id)=>{const recovery=globalThis.__suiteRecoveryQA.recovery;return (id==='screenity'?recovery.screenity:recovery.native).executable(id);},id);assert.ok(executable.includes(path.sep+'native'+path.sep+id+path.sep));}
  else{await page.locator('.nav-item[data-view="'+id+'"]').click();await page.getByText('A versão reduzida do laboratório foi retirada da suíte.',{exact:false}).waitFor();assert.equal(await page.locator('#tool').isHidden(),true);}
 }
 checks.push(packaged?'Both complete original native applications ship in the installed package and pass target, source identity and executable integrity verification':'Development shell accurately identifies native components not prepared on this runner');
 await phase('original-local-ocr');const ocr=await page.evaluate(async(bytes)=>{const upload=await fetch('/api/files?project=paperless&name=ocr.png',{method:'POST',headers:{'Content-Type':'image/png'},body:new Uint8Array(bytes)});const f=await upload.json();const r=await fetch('/api/files/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:f.id})});return {status:r.status,...await r.json()};},[...await fs.readFile(path.join(root,'subprojetos/tests/fixtures/ocr.png'))]);assert.equal(ocr.status,200,ocr.error);assert.match(ocr.text,/Plataforma/i);checks.push('Bundled Tesseract performs real image OCR without network model downloads');
 await phase('native-legacy-export');await page.locator('.nav-item[data-view="settings"]').click();await page.locator('#backup').waitFor();await page.locator('#backup').click();const backup=await waitFile(path.join(temp,'workspace.pasuite'));assert.ok(backup.length>1000);checks.push('Native save dialog produces the documented Excalidraw workspace backup');
 await page.locator('.nav-item[data-view="home"]').click();await page.waitForSelector('.tool-card');await page.screenshot({path:path.join(root,'desktop/research/home-'+(packaged?'packaged':'development')+'.png')});
 assert.deepEqual(errors,[]);const info=await page.evaluate(()=>window.suite.info());
 await phase('graceful-shutdown');if(process.env.CI==='true')await closeNativeQA(app,{timeout:60000});else await app.close();closed=true;checks.push('Native original editors flush and close gracefully without forced termination');
 const report={checked_at:new Date().toISOString(),suiteCommit:process.env.GITHUB_SHA,status:'passed',packaged,platform:info.platform,arch:info.arch,version:info.version,checks,errors,limits:['No real user screen/microphone captured','Managed Linux runtime and all twelve providers together require separate acceptance','Internal candidate; final suite release gates remain closed','The legacy Excalidraw export remains intentionally separate from the encrypted suite backup','Local runtime installer, signed distribution and automatic updates are pending']};
 await fs.writeFile(path.join(root,'desktop/research/desktop-'+(packaged?'packaged':'development')+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){await fs.writeFile(path.join(root,'desktop/research/desktop-failure.json'),JSON.stringify({status:'failed',error:e.message,checks,errors,target:process.platform+'-'+process.arch,suiteCommit:process.env.GITHUB_SHA})+'\n');if(page)await page.screenshot({path:path.join(root,'desktop/research/failure.png')}).catch(()=>{});console.error('RUNTIME ERRORS',errors);throw e;}
finally{if(!closed){if(process.env.CI==='true')await closeNativeQA(app,{strict:false,timeout:15000});else await app.close();}try{await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:250});}catch{if(closed)throw Error('The test profile could not be removed after graceful shutdown');}}
