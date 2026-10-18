import fs from 'node:fs';import path from 'node:path';import {chromium} from '../../desktop/node_modules/playwright/index.mjs';import {NativeAppLauncher} from '../../desktop/src/native-app-launcher.mjs';
export async function managedScreenitySession({directory,resources,extension}){
 if(process.env.CI!=='true')throw Error('Synthetic managed browser acceptance requires disposable CI');
 const manifest=JSON.parse(fs.readFileSync(path.join(resources,'native-launcher.json')));let child,browser;
 const manager=new NativeAppLauncher({id:'screenity',directory,resources,extension,manifest,launch:async options=>{child=await manager.spawn({...options,args:[...options.args,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-sandbox','--lang=en-US','--window-size=1440,960','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});return child;}});
 await manager.open('screenity');
 const endpoint=path.join(manager.profile('screenity'),'DevToolsActivePort');let port;
 for(let attempt=0;attempt<300;attempt++){if(child.exitCode!==null)throw Error('Managed native browser exited before its test bridge was ready: '+child.exitCode);if(fs.existsSync(endpoint)){port=Number(fs.readFileSync(endpoint,'utf8').split('\n')[0]);if(Number.isInteger(port)&&port>1024&&port<65536)break;}await new Promise(resolve=>setTimeout(resolve,100));}
 if(!port)throw Error('Managed native browser did not expose its isolated CI-only bridge');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];
 return {manager,context,close:async()=>{
  let timer;const exited=new Promise((resolve,reject)=>{if(child.exitCode!==null)return child.exitCode===0?resolve():reject(Error('Managed browser exit '+child.exitCode));child.once('exit',code=>code===0?resolve():reject(Error('Managed browser exit '+code)));timer=setTimeout(()=>reject(Error('Managed browser did not close cleanly')),30000);});
  const cdp=await browser.newBrowserCDPSession();await cdp.send('Browser.close').catch(()=>{});try{await exited;}finally{clearTimeout(timer);await browser.close().catch(()=>{});}await manager.freeze();await manager.resume();
 }};
}
