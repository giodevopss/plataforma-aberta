import {BrowserWindow,session,webContents} from 'electron';import {OriginStorageSnapshot} from './origin-storage.mjs';
const inUse=new Set(),route='/.plataforma-private-storage-bridge';
async function bounded(task,label){let timer;try{return await Promise.race([task,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('A ponte privada não respondeu: '+label)),15000))]);}finally{clearTimeout(timer);}}
export async function openManagedStorageBridge({partition,origin}){
 const url=new URL(origin);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!/^persist:complete-(?:[a-f0-9]{32}-)?[a-z][a-z0-9-]{1,40}$/.test(partition))throw Error('Ponte de armazenamento exige a origem e o perfil privados do aplicativo.');
 if(inUse.has(partition))throw Error('O navegador deste aplicativo já está em recuperação.');const isolated=session.fromPartition(partition);if(webContents.getAllWebContents().some(contents=>!contents.isDestroyed()&&contents.session===isolated))throw Error('Feche as janelas do aplicativo antes do backup.');inUse.add(partition);let window,handled=false;
 const dispose=async()=>{if(window&&!window.isDestroyed())window.destroy();if(handled)isolated.protocol.unhandle('http');inUse.delete(partition);await isolated.flushStorageData();};
 try{
  isolated.protocol.handle('http',request=>{const address=new URL(request.url);if(address.origin!==url.origin||address.pathname!==route||request.method!=='GET')return new Response('Private browser storage is frozen',{status:503});return new Response('<!doctype html><html><head><meta charset="utf-8"><title>Private storage checkpoint</title></head><body></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});});handled=true;
  window=new BrowserWindow({show:false,webPreferences:{partition,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,address)=>{if(address!==url.origin+route)event.preventDefault();});isolated.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  // A new BrowserWindow has no renderer until its first navigation. Initialize
  // only a trusted blank document before sending renderer DevTools commands.
  await bounded(window.loadURL('about:blank'),'inicialização do navegador');
  window.webContents.debugger.attach('1.3');
  for(const [command,params]of [['Network.enable',{}],['Network.setBypassServiceWorker',{bypass:true}],['ServiceWorker.enable',{}],['ServiceWorker.stopAllWorkers',{}]])await bounded(window.webContents.debugger.sendCommand(command,params),command);
  for(let attempt=0;Object.keys(isolated.serviceWorkers.getAllRunning()).length;attempt++){if(attempt>=50)throw Error('Aguarde o encerramento dos gravadores em segundo plano do aplicativo.');await new Promise(resolve=>setTimeout(resolve,100));}
  await isolated.flushStorageData();await bounded(window.loadURL(url.origin+route),'abertura da origem privada');if(window.webContents.getURL()!==url.origin+route)throw Error('A ponte privada foi redirecionada.');
  return {window,session:isolated,browser:new OriginStorageSnapshot(script=>window.webContents.executeJavaScript(script)),dispose};
 }catch(error){await dispose();throw error;}
}
