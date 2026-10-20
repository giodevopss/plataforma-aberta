import {execFile} from 'node:child_process';
// Only disposable CI fixtures may be force-terminated after recording failure.
export async function closeNativeQA(application,{strict=true,timeout=15000}={}){
 if(!application)return;if(process.env.CI!=='true')throw Error('Native QA cleanup requires a disposable runner.');const child=application.process();
 if(child.exitCode!==null||child.signalCode!==null){if(strict&&child.exitCode!==0)throw Error('Native app exited with code '+child.exitCode);return;}
 const trace=bytes=>{for(const line of bytes.toString().split(/\r?\n/))if(line.startsWith('SUITE_SHUTDOWN '))console.log(line);};child.stdout?.on('data',trace);
 let timer,listener;const exit=new Promise((resolve,reject)=>{listener=code=>code===0?resolve():reject(Error('Native app exited with code '+code));child.once('exit',listener);});
 // Record stage names only, never arguments, browser contents or credentials.
 // This observes the real shutdown and leaves every original guard intact.
 const close=application.evaluate(({app,BrowserWindow,dialog})=>{
  const qa=globalThis.__suiteRecoveryQA;
  if(qa&&!qa.shutdownTrace){qa.shutdownTrace=[];const record=(stage,status)=>{qa.shutdownTrace.push({stage,status});console.log('SUITE_SHUTDOWN '+stage+' '+status);};
   const wrap=(object,key,stage)=>{if(!object||typeof object[key]!=='function')return;const original=object[key];object[key]=function(...args){record(stage,'started');try{const result=Reflect.apply(original,this,args);if(result?.then)return result.then(value=>{record(stage,'completed');return value;},error=>{record(stage,'failed');throw error;});record(stage,'completed');return result;}catch(error){record(stage,'failed');throw error;}};};
   wrap(qa.recovery?.runtime,'close','managed-runtime');wrap(qa.recovery?.service,'close','local-service');
   for(const [index,win]of BrowserWindow.getAllWindows().entries()){const contents=win.webContents,original=contents.executeJavaScript;contents.executeJavaScript=function(code,...args){const stage=code.includes('paDesktopCanClose')?'editor-save':code.includes('paDesktopSuspendForBackup')?'editor-suspend':code.includes('paDesktopResumeAfterBackup')?'editor-resume':null;if(!stage)return Reflect.apply(original,this,[code,...args]);record(stage,'started');return Reflect.apply(original,this,[code,...args]).then(value=>{record(stage,value===false?'canceled':'completed');return value;},error=>{record(stage,'failed');throw error;});};wrap(contents.session,'flushStorageData','browser-storage-'+index);}
   const showError=dialog.showErrorBox;dialog.showErrorBox=function(...args){record('native-error-dialog','opened');return Reflect.apply(showError,this,args);};
  }
  setImmediate(()=>app.quit());return true;
 });close.catch(()=>{});
 try{await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native application did not close gracefully within '+timeout+' ms')),timeout);})]);}
 catch(error){
  // A Chromium child can retain the test transport on Windows. Terminate only
  // this exact runner-owned process tree after failing the graceful assertion.
  if(process.platform==='win32'&&Number.isInteger(child.pid)&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{timeout:5000},()=>resolve()));
  else child.kill('SIGKILL');
  if(strict)throw error;
 }finally{clearTimeout(timer);child.removeListener('exit',listener);child.stdout?.removeListener('data',trace);}
}
