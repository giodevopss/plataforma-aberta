import {borrowedQAGuest} from '../../desktop/src/qa-guest-runtime.mjs';
import {closeNativeQA} from './close-native-qa.mjs';
import {verifyPlanePage} from './plane-account-workflow.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loginOriginalPage,verifyAccountPage} from './original-account-workflows.mjs';
import {_electron} from '../../desktop/node_modules/playwright/index.mjs';

// Keep private arguments/output out of diagnostics, including swallowed probe
// failures. Wrappers preserve every original return value and thrown error.
export async function instrumentNativeRuntimeQA(application){await application.evaluate(()=>{const runtime=globalThis.__suiteRecoveryQA.recovery.runtime;for(const [method,operation]of [['run',null],['runCompose','compose']]){const invoke=runtime[method].bind(runtime);runtime[method]=async(...values)=>{try{return await invoke(...values);}catch(error){globalThis.__qaNativeRuntimeFailure={operation:operation||String(values[0]?.[0]||'command').replace(/[^a-z]/g,''),kind:error.runtimeFailure?.kind||(/tempo de resposta|timed out/i.test(error.message)?'deadline':'unknown'),exitCode:Number.isInteger(error.runtimeFailure?.exitCode)?error.runtimeFailure.exitCode:null};throw error;}};}});}
export async function nativeRuntimeFailureQA(application){return application.evaluate(()=>globalThis.__qaNativeRuntimeFailure||null).catch(()=>null);}

async function boundedNativeCheck(label,promise){let timer;try{return await Promise.race([promise,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Original native '+label+' exceeded 90 seconds')),90000);})]);}finally{clearTimeout(timer);}}
const preparedNativeFixtures=new WeakSet();
export async function prepareNativeServiceQA({id,directory,onPhase}){
 if(process.env.CI!=='true'||!['linux','win32','darwin'].includes(process.platform)||process.env.PA_TEST_NATIVE_SERVICE!=='1')throw Error('Disposable native-service acceptance workflow required.');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pa-native-'+id+'-'));let application;
 try{
  const shim=path.join(temporary,'compose');fs.writeFileSync(shim,'#!/bin/sh\nexec docker compose "$@"\n',{mode:0o700});
  const env={...process.env,PA_DESKTOP_TEST_DATA:path.join(temporary,'profile'),PA_DESKTOP_TEST_RUNTIME_DIRECTORY:directory,PA_DESKTOP_TEST_COMPOSE_BINARY:shim};delete env.ELECTRON_RUN_AS_NODE;
  if(process.env.PA_DESKTOP_TEST_GUEST_CONFIG){onPhase?.('guest-preflight');const borrowed=borrowedQAGuest(process.env.PA_DESKTOP_TEST_GUEST_CONFIG,{specs:[]});await borrowed.release();}
  const executablePath=process.env.PA_DESKTOP_EXECUTABLE||createRequire(new URL('../../desktop/package.json',import.meta.url))('electron');
  onPhase?.('launch');application=await _electron.launch({executablePath,args:[...(process.platform==='linux'?['--no-sandbox']:[]),...(!process.env.PA_DESKTOP_EXECUTABLE?[path.resolve('desktop')]:[]),'--suite-test'],env,timeout:45000});
  const shell=await application.firstWindow();await shell.locator('.tool-card').first().waitFor();const info=await shell.evaluate(()=>window.suite.info());assert.ok(info.managedServices.includes(id));assert.equal(info.packaged,Boolean(process.env.PA_DESKTOP_EXECUTABLE));
  const fixture={id,directory:path.resolve(directory),temporary,application,closed:false};preparedNativeFixtures.add(fixture);onPhase?.('home-ready');return fixture;
 }catch(error){await closeNativeQA(application,{strict:false,timeout:60000}).catch(()=>{});fs.rmSync(temporary,{recursive:true,force:true});throw error;}
}
export async function closePreparedNativeServiceQA(fixture,{strict=false,timeout=240000}={}){
 if(!fixture||fixture.closed)return;if(!preparedNativeFixtures.has(fixture))throw Error('Only this owned native QA fixture may be closed.');
 try{await closeNativeQA(fixture.application,{strict,timeout});}finally{fixture.closed=true;fs.rmSync(fixture.temporary,{recursive:true,force:true});}
}
export async function verifyNativeService({id,directory,endpoint,evidence,checks,verify,onFailure,onPhase,prepared}){
 const fixture=prepared||await prepareNativeServiceQA({id,directory,onPhase});
 if(!preparedNativeFixtures.has(fixture)||fixture.closed||fixture.id!==id||fixture.directory!==path.resolve(directory))throw Error('Prepared native QA fixture must match this actual original service.');
 const application=fixture.application;let failed=false;
 try{
  const shell=await application.firstWindow();await shell.locator('.tool-card').first().waitFor();await instrumentNativeRuntimeQA(application);const nativeInfo=await shell.evaluate(()=>window.suite.info());assert.ok(nativeInfo.managedServices.includes(id),id);assert.equal(nativeInfo.packaged,Boolean(process.env.PA_DESKTOP_EXECUTABLE),'Original native view must use the requested installed package or explicit source shell');
  async function openLibrary(){
   onPhase?.('open');await shell.locator('.nav-item[data-view="'+id+'"]').click();await shell.locator('#main').waitFor({state:'hidden',timeout:300000}).catch(async error=>{const detail=await shell.locator('#runtime-progress').textContent().catch(()=>error.message);throw Error('Original '+id+' native attachment failed: '+detail+'; last transport diagnostic '+JSON.stringify(await nativeRuntimeFailureQA(application)));});let view;
   for(let attempt=0;attempt<1200;attempt++){view=application.context().pages().find(p=>new URL(p.url()||'about:blank').origin===endpoint.origin);if(view)break;await new Promise(resolve=>setTimeout(resolve,250));}
   if(!view)fs.writeFileSync(path.join(evidence,'native-launch-failure.txt'),await shell.locator('body').innerText());assert.ok(view,'Original application WebContentsView opened after its complete stack became ready');assert.equal(await view.evaluate(()=>typeof require),'undefined');view.setDefaultTimeout(90000);view.setDefaultNavigationTimeout(90000);onPhase?.('original-ui');await verify(view);onPhase?.('fonts');await boundedNativeCheck('font readiness',view.evaluate(()=>document.fonts.ready.then(()=>true)));return view;
  }
  async function capture(name){onPhase?.('capture');const png=Buffer.from(await boundedNativeCheck('interface capture',application.evaluate(async({BrowserWindow},origin)=>{const view=BrowserWindow.getAllWindows()[0].contentView.children.find(child=>child.webContents?.getURL().startsWith(origin+'/'));if(!view||view.getBounds().width<500||view.getBounds().height<300)throw Error('Original tool is not attached with visible native bounds');return (await view.webContents.capturePage()).toPNG().toString('base64');},endpoint.origin)),'base64');assert.equal(png.subarray(1,4).toString(),'PNG');fs.writeFileSync(path.join(evidence,name),png);}
  await openLibrary();await capture('native-original-interface.png');
  await shell.locator('.nav-item[data-view="settings"]').click();await shell.locator('[data-stop="'+id+'"]').click();await shell.getByText('stopped',{exact:true}).waitFor({timeout:180000});
  await openLibrary();await capture('native-reopened-interface.png');
  if(id==='postiz')for(let cycle=2;cycle<=3;cycle++){console.log('postiz native restart cycle',cycle);await shell.locator('.nav-item[data-view="settings"]').click();await shell.locator('[data-stop="postiz"]').click();await shell.getByText('stopped',{exact:true}).waitFor({timeout:180000});await openLibrary();await capture('native-reopened-cycle-'+cycle+'.png');}
  checks.push('Native Electron opens complete original '+id+' in an attached isolated WebContentsView without Node access, stops its owned stack and reopens its persistent original data');
 }catch(error){failed=true;await onFailure?.().catch(diagnostic=>fs.writeFileSync(path.join(evidence,'native-diagnostic-failure.txt'),diagnostic.message));for(const [index,page]of application.context().pages().entries()){fs.writeFileSync(path.join(evidence,'native-failure-'+index+'.txt'),await page.locator('body').innerText().catch(()=>''));fs.writeFileSync(path.join(evidence,'native-failure-'+index+'-controls.json'),JSON.stringify(await page.locator('input,button').evaluateAll(elements=>elements.map(element=>({tag:element.tagName,type:element.getAttribute('type'),name:element.getAttribute('name'),text:element.tagName==='BUTTON'?element.textContent?.trim().slice(0,120):undefined}))).catch(()=>[]),null,2));}await boundedNativeCheck('failure capture',application.evaluate(async({BrowserWindow},origin)=>{const view=BrowserWindow.getAllWindows()[0].contentView.children.find(child=>child.webContents?.getURL().startsWith(origin+'/'));return view?(await view.webContents.capturePage()).toPNG().toString('base64'):null;},endpoint.origin)).then(png=>{if(png)fs.writeFileSync(path.join(evidence,'native-failure.png'),Buffer.from(png,'base64'));}).catch(()=>{});throw error;
 }finally{onPhase?.('shutdown');await closePreparedNativeServiceQA(fixture,{strict:!failed,timeout:240000});}
}

export async function verifyNativePaperless(options){return verifyNativeService({...options,id:'paperless',verify:async page=>{await page.goto(options.endpoint.origin+'/documents');await page.getByText('QA documento OCR',{exact:false}).first().waitFor();await page.getByText('QA documento Office',{exact:false}).first().waitFor();await page.waitForFunction(()=>{const images=[...document.querySelectorAll('img')];return images.length>=3&&images.every(image=>image.complete&&image.naturalWidth>0);});fs.writeFileSync(path.join(options.evidence,'native-image-state.json'),JSON.stringify(await page.locator('img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth}))),null,2));}});}
export async function verifyNativeAccount(options){return verifyNativeService({...options,verify:async page=>{if(options.id==='plane')return verifyPlanePage({...options,page});await loginOriginalPage(options.id,page,options.endpoint,options.state.account);await verifyAccountPage({...options,page});}});}
