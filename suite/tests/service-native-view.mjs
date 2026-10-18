import {closeNativeQA} from './close-native-qa.mjs';
import {verifyPlanePage} from './plane-account-workflow.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loginOriginalPage,verifyAccountPage} from './original-account-workflows.mjs';
import {_electron} from '../../desktop/node_modules/playwright/index.mjs';

export async function verifyNativeService({id,directory,endpoint,evidence,checks,verify,onFailure}){
 if(process.env.CI!=='true'||!['linux','win32'].includes(process.platform)||process.env.PA_TEST_NATIVE_SERVICE!=='1')throw Error('Disposable native-service acceptance workflow required.');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pa-native-'+id+'-'));
 const shim=path.join(temporary,'compose');fs.writeFileSync(shim,'#!/bin/sh\nexec docker compose "$@"\n',{mode:0o700});
 const env={...process.env,PA_DESKTOP_TEST_DATA:path.join(temporary,'profile'),PA_DESKTOP_TEST_RUNTIME_DIRECTORY:directory,PA_DESKTOP_TEST_COMPOSE_BINARY:shim};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=createRequire(new URL('../../desktop/package.json',import.meta.url))('electron');
 const application=await _electron.launch({executablePath,args:[...(process.platform==='linux'?['--no-sandbox']:[]),path.resolve('desktop'),'--suite-test'],env,timeout:45000});let failed=false;
 try{
  const shell=await application.firstWindow();await shell.locator('.tool-card').first().waitFor();assert.ok((await shell.evaluate(()=>window.suite.info())).managedServices.includes(id),id);
  async function openLibrary(){
   await shell.locator('.nav-item[data-view="'+id+'"]').click();await shell.locator('#main').waitFor({state:'hidden',timeout:300000});let view;
   for(let attempt=0;attempt<1200;attempt++){view=application.context().pages().find(p=>new URL(p.url()||'about:blank').origin===endpoint.origin);if(view)break;await new Promise(resolve=>setTimeout(resolve,250));}
   if(!view)fs.writeFileSync(path.join(evidence,'native-launch-failure.txt'),await shell.locator('body').innerText());assert.ok(view,'Original application WebContentsView opened after its complete stack became ready');assert.equal(await view.evaluate(()=>typeof require),'undefined');await verify(view);await view.evaluate(()=>document.fonts.ready.then(()=>true));return view;
  }
  async function capture(name){const png=Buffer.from(await application.evaluate(async({BrowserWindow},origin)=>{const view=BrowserWindow.getAllWindows()[0].contentView.children.find(child=>child.webContents?.getURL().startsWith(origin+'/'));if(!view||view.getBounds().width<500||view.getBounds().height<300)throw Error('Original tool is not attached with visible native bounds');return (await view.webContents.capturePage()).toPNG().toString('base64');},endpoint.origin),'base64');assert.equal(png.subarray(1,4).toString(),'PNG');fs.writeFileSync(path.join(evidence,name),png);}
  await openLibrary();await capture('native-original-interface.png');
  await shell.locator('.nav-item[data-view="settings"]').click();await shell.locator('[data-stop="'+id+'"]').click();await shell.getByText('stopped',{exact:true}).waitFor({timeout:180000});
  await openLibrary();await capture('native-reopened-interface.png');
  if(id==='postiz')for(let cycle=2;cycle<=3;cycle++){console.log('postiz native restart cycle',cycle);await shell.locator('.nav-item[data-view="settings"]').click();await shell.locator('[data-stop="postiz"]').click();await shell.getByText('stopped',{exact:true}).waitFor({timeout:180000});await openLibrary();await capture('native-reopened-cycle-'+cycle+'.png');}
  checks.push('Native Electron opens complete original '+id+' in an attached isolated WebContentsView without Node access, stops its owned stack and reopens its persistent original data');
 }catch(error){failed=true;await onFailure?.().catch(diagnostic=>fs.writeFileSync(path.join(evidence,'native-diagnostic-failure.txt'),diagnostic.message));for(const [index,page]of application.context().pages().entries()){fs.writeFileSync(path.join(evidence,'native-failure-'+index+'.txt'),await page.locator('body').innerText().catch(()=>''));fs.writeFileSync(path.join(evidence,'native-failure-'+index+'-controls.json'),JSON.stringify(await page.locator('input,button').evaluateAll(elements=>elements.map(element=>({tag:element.tagName,type:element.getAttribute('type'),name:element.getAttribute('name'),text:element.tagName==='BUTTON'?element.textContent?.trim().slice(0,120):undefined}))).catch(()=>[]),null,2));}await application.evaluate(async({BrowserWindow},origin)=>{const view=BrowserWindow.getAllWindows()[0].contentView.children.find(child=>child.webContents?.getURL().startsWith(origin+'/'));return view?(await view.webContents.capturePage()).toPNG().toString('base64'):null;},endpoint.origin).then(png=>{if(png)fs.writeFileSync(path.join(evidence,'native-failure.png'),Buffer.from(png,'base64'));}).catch(()=>{});throw error;
 }finally{await closeNativeQA(application,{strict:!failed});fs.rmSync(temporary,{recursive:true,force:true});}
}

export async function verifyNativePaperless(options){return verifyNativeService({...options,id:'paperless',verify:async page=>{await page.goto(options.endpoint.origin+'/documents');await page.getByText('QA documento OCR',{exact:false}).first().waitFor();await page.getByText('QA documento Office',{exact:false}).first().waitFor();await page.waitForFunction(()=>{const images=[...document.querySelectorAll('img')];return images.length>=3&&images.every(image=>image.complete&&image.naturalWidth>0);});fs.writeFileSync(path.join(options.evidence,'native-image-state.json'),JSON.stringify(await page.locator('img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth}))),null,2));}});}
export async function verifyNativeAccount(options){return verifyNativeService({...options,verify:async page=>{if(options.id==='plane')return verifyPlanePage({...options,page});await loginOriginalPage(options.id,page,options.endpoint,options.state.account);await verifyAccountPage({...options,page});}});}
