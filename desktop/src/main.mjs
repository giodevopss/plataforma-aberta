import {app,BrowserWindow,WebContentsView,Menu,ipcMain,dialog,shell,session,desktopCapturer} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startService} from './service.mjs';
import {readConnections,saveConnections,safeRemoteNavigation} from './connections.mjs';
import {CompleteRuntime,serverApps} from './complete-runtime.mjs';
import {localApps} from './local-apps.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const qa=process.argv.includes('--suite-test');
if(qa&&process.env.PA_DESKTOP_TEST_DATA)app.setPath('userData',process.env.PA_DESKTOP_TEST_DATA);
const acquired=app.requestSingleInstanceLock();if(!acquired)app.quit();
let win,service,runtime,closing=false,remoteView=null,openGeneration=0;const remoteViews=new Map();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>win?.show());
app.on('before-quit',(e)=>{if(service&&!closing){e.preventDefault();closing=true;(async()=>{if(win&&!win.isDestroyed()&&!await win.webContents.executeJavaScript('window.paDesktopCanClose?.() ?? true')){closing=false;return;}await runtime?.close();await service.close();app.quit();})().catch(e=>{closing=false;dialog.showErrorBox('Serviços locais',e.message);});}});

function trusted(event){if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==service.origin)throw Error('Operação desktop não autorizada.');}
async function saveBackup(){if(!await win.webContents.executeJavaScript('window.paDesktopCanClose?.() ?? true'))return {canceled:true};const r=await dialog.showSaveDialog(win,{title:'Exportar quadros Excalidraw',defaultPath:'Quadros-'+new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bahia'}).format(new Date())+'.pasuite',filters:[{name:'Backup da Plataforma Aberta',extensions:['pasuite']}]});if(r.canceled)return {canceled:true};const bytes=service.workspace.backup();const temp=r.filePath+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,bytes);fs.renameSync(temp,r.filePath);return {saved:true,name:path.basename(r.filePath),size:bytes.length};}
async function restoreBackup(){const r=await dialog.showOpenDialog(win,{title:'Restaurar quadros Excalidraw',properties:['openFile'],filters:[{name:'Backup da Plataforma Aberta',extensions:['pasuite']}]});if(r.canceled)return {canceled:true};const ok=await dialog.showMessageBox(win,{type:'warning',buttons:['Cancelar','Restaurar backup'],defaultId:0,cancelId:0,message:'Substituir os quadros Excalidraw pelo backup?',detail:'Uma cópia de recuperação do espaço atual será preservada. Feche edições pendentes antes de restaurar.'});if(ok.response!==1)return {canceled:true};const filename=r.filePaths[0];if(fs.statSync(filename).size>500_000_000)throw Error('Backup excede 500 MB.');const result=service.workspace.restore(fs.readFileSync(filename));win.webContents.reload();return {restored:true,recovery:path.basename(result.recovery)};}
if(acquired)app.whenReady().then(async()=>{
  app.setName('Plataforma Aberta');
  const resources=path.resolve(here,'../resources');
  const ids=JSON.parse(fs.readFileSync(path.join(resources,'projects.json'))).map(p=>p.id);
  const configDirectory=path.join(app.getPath('userData'),'settings');
  const directory=path.join(app.getPath('userData'),'workspace');
  const token=crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(configDirectory,{recursive:true,mode:0o700});
  const portFile=path.join(configDirectory,'desktop-port.json');const savedPort=fs.existsSync(portFile)?JSON.parse(fs.readFileSync(portFile)).port:0;
  if(!Number.isInteger(savedPort)||savedPort<0||savedPort>65535)throw Error('Porta local salva inválida.');
  service=await startService({resources,directory,token,port:savedPort});
  if(!savedPort)fs.writeFileSync(portFile,JSON.stringify({port:Number(new URL(service.origin).port)})+'\n',{mode:0o600});
  const integrated=JSON.parse(fs.readFileSync(path.join(here,'integrated-services.json')));
  const completeApps=[...localApps,...serverApps.filter(app=>integrated.includes(app.id))];
  runtime=new CompleteRuntime({directory:qa&&process.env.PA_DESKTOP_TEST_RUNTIME_DIRECTORY?process.env.PA_DESKTOP_TEST_RUNTIME_DIRECTORY:path.join(app.getPath('userData'),'applications'),specs:completeApps,composeBinary:qa&&process.env.PA_DESKTOP_TEST_COMPOSE_BINARY?process.env.PA_DESKTOP_TEST_COMPOSE_BINARY:app.isPackaged?path.join(process.resourcesPath,'runtime',process.platform+'-'+process.arch,process.platform==='win32'?'docker-compose.exe':'docker-compose'):path.join(here,'../.cache/docker-compose'),onStatus:status=>{if(win&&!win.isDestroyed())win.webContents.send('suite:runtime-status',status);}});
  const isolated=session.fromPartition('persist:plataforma-suite');
  isolated.webRequest.onBeforeSendHeaders((details,callback)=>{
    const url=new URL(details.url);
    if(url.origin===service.origin)callback({requestHeaders:{...details.requestHeaders,'X-PA-Session':token}});
    else callback({cancel:!['devtools:','blob:','data:'].includes(url.protocol)});
  });
  isolated.setPermissionRequestHandler((contents,permission,callback,details)=>{
    const own=contents===win?.webContents&&details.requestingUrl?.startsWith(service.origin+'/');
    callback(Boolean(own&&permission==='media'&&details.mediaTypes?.every(x=>x==='audio')));
  });
  isolated.setDisplayMediaRequestHandler(async(request,callback)=>{
    try{
      if(!request.frame.url.startsWith(service.origin+'/apps/screenity/')||!request.userGesture)return callback({});
      const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0}});
      const list=sources.slice(0,12);const choice=await dialog.showMessageBox(win,{type:'question',title:'Compartilhar tela',message:'Escolha a tela ou janela para gravar',detail:'A captura começa apenas após esta seleção. O indicador de gravação permanece visível na ferramenta.',buttons:['Cancelar',...list.map(s=>s.name)],cancelId:0,defaultId:0});
      const source=list[choice.response-1];callback(source?{video:source}:{});
    }catch{callback({});}
  });
  win=new BrowserWindow({width:1440,height:960,minWidth:960,minHeight:640,show:false,backgroundColor:'#f6f7f9',title:'Plataforma Aberta',webPreferences:{preload:path.join(here,'preload.cjs'),partition:'persist:plataforma-suite',contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:true}});
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  win.on('close',e=>{if(closing)return;e.preventDefault();(async()=>{if(!await win.webContents.executeJavaScript('window.paDesktopCanClose?.() ?? true'))return;if(process.platform==='darwin')win.hide();else app.quit();})().catch(()=>{});});
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==service.origin)event.preventDefault();});
  const hideModule=()=>{openGeneration++;if(remoteView){win.contentView.removeChildView(remoteView);remoteView=null;}};
  function moduleBounds(){const {width,height}=win.getContentBounds();const left=width<=1150?220:248;return {x:left,y:64,width:width-left,height:height-64};}
  function remoteBounds(){if(remoteView)remoteView.setBounds(moduleBounds());}
  win.on('resize',remoteBounds);
  ipcMain.handle('suite:connections',event=>{trusted(event);return readConnections(configDirectory,ids);});
  ipcMain.handle('suite:configure',(event,value)=>{trusted(event);const result=saveConnections(configDirectory,value,ids);hideModule();for(const view of remoteViews.values())view.webContents.close();remoteViews.clear();return result;});
  ipcMain.handle('suite:hide-module',event=>{trusted(event);hideModule();return true;});
  ipcMain.handle('suite:runtime',async event=>{trusted(event);return {engine:await runtime.probe(),applications:completeApps.map(spec=>({id:spec.id,...runtime.states.get(spec.id)}))};});
  ipcMain.handle('suite:stop-module',async(event,id)=>{trusted(event);if(remoteView===remoteViews.get(id))hideModule();const view=remoteViews.get(id);view?.webContents.close();remoteViews.delete(id);await runtime.stop(id);return true;});
  ipcMain.handle('suite:open-module',async(event,id)=>{
    trusted(event);if(!ids.includes(id))throw Error('Ferramenta desconhecida.');
    hideModule();const generation=openGeneration;
    if(!completeApps.some(app=>app.id===id))return {available:false};
    const {origin:endpoint,token:moduleToken}=await runtime.start(id);
    if(generation!==openGeneration||closing)return {available:false};
    let view=remoteViews.get(id);
    if(!view){
      view=new WebContentsView({webPreferences:{partition:'persist:complete-'+id,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
      view.setBounds(moduleBounds());
      view.webContents.session.webRequest.onBeforeSendHeaders((details,callback)=>{const url=new URL(details.url);const target=new URL(endpoint);const requestOrigin=url.protocol==='ws:'?'http://'+url.host:url.protocol==='wss:'?'https://'+url.host:url.origin;if(requestOrigin!==endpoint&&['http:','ws:'].includes(url.protocol))return callback({cancel:true});if(['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.host!==target.host)return callback({cancel:true});const headers={...details.requestHeaders};delete headers['X-PA-Session'];delete headers['x-pa-session'];if(requestOrigin===endpoint)headers['X-PA-Session']=moduleToken;callback({requestHeaders:headers});});
      await view.webContents.session.cookies.set({url:endpoint,name:'pa_session',value:moduleToken,path:'/',httpOnly:true,sameSite:'strict',secure:false});
      view.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
      view.webContents.on('will-navigate',(event,url)=>{if(!safeRemoteNavigation(url,endpoint))event.preventDefault();});
      view.webContents.setWindowOpenHandler(({url})=>safeRemoteNavigation(url,endpoint)?{action:'allow',overrideBrowserWindowOptions:{parent:win,width:1100,height:800,webPreferences:{partition:'persist:complete-'+id,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}}}:{action:'deny'});
      remoteViews.set(id,view);await view.webContents.loadURL(endpoint);
    }
    if(generation!==openGeneration||closing)return {available:false};
    remoteView=view;win.contentView.addChildView(view);remoteBounds();view.webContents.focus();return {available:true};
  });
  ipcMain.handle('suite:info',(event)=>{trusted(event);return {version:app.getVersion(),platform:process.platform,arch:process.arch,packaged:app.isPackaged,workspace:directory,channel:'alpha',signed:false,managedServices:completeApps.map(s=>s.id)};});
  ipcMain.handle('suite:backup',event=>{trusted(event);return saveBackup();});
  ipcMain.handle('suite:restore',event=>{trusted(event);return restoreBackup();});
  ipcMain.handle('suite:folder',event=>{trusted(event);return shell.openPath(directory);});
  ipcMain.handle('suite:licenses',event=>{trusted(event);win.loadURL(service.origin+'/?view=licenses');});
  const command=id=>win.webContents.send('suite:command',id);
  const menu=[...(process.platform==='darwin'?[{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),{label:'Arquivo',submenu:[{label:'Início',accelerator:'CmdOrCtrl+Shift+H',click:()=>command('home')},{label:'Buscar ferramenta',accelerator:'CmdOrCtrl+K',click:()=>command('search')},{type:'separator'},{label:'Exportar quadros Excalidraw…',click:()=>saveBackup().catch(e=>dialog.showErrorBox('Backup',e.message))},{label:'Restaurar espaço…',click:()=>restoreBackup().catch(e=>dialog.showErrorBox('Restauração',e.message))},...(process.platform==='darwin'?[]:[{type:'separator'},{role:'quit'}])]},{role:'editMenu',label:'Editar'},{label:'Visualizar',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},{label:'Ajuda',submenu:[{label:'Configurações e diagnóstico',click:()=>command('settings')},{label:'Licenças e componentes',click:()=>command('licenses')}]}];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  await win.loadURL(service.origin+'/');win.show();
}).catch(e=>{dialog.showErrorBox('Não foi possível iniciar a suíte',e.message);app.quit();});
