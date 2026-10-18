const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('suite',Object.freeze({
  ready:()=>ipcRenderer.invoke('suite:ready'),
  info:()=>ipcRenderer.invoke('suite:info'),
  backupUnified:value=>ipcRenderer.invoke('suite:backup-unified',value),
  restoreUnified:value=>ipcRenderer.invoke('suite:restore-unified',value),
  activateProfile:id=>ipcRenderer.invoke('suite:activate-profile',id),
  backup:()=>ipcRenderer.invoke('suite:backup'),
  restore:()=>ipcRenderer.invoke('suite:restore'),
  openDataFolder:()=>ipcRenderer.invoke('suite:folder'),
  connections:()=>ipcRenderer.invoke('suite:connections'),
  configure:value=>ipcRenderer.invoke('suite:configure',value),
  openModule:id=>ipcRenderer.invoke('suite:open-module',id),
  hideModule:()=>ipcRenderer.invoke('suite:hide-module'),
  runtime:()=>ipcRenderer.invoke('suite:runtime'),
  prepareRuntime:()=>ipcRenderer.invoke('suite:prepare-runtime'),
  stopModule:id=>ipcRenderer.invoke('suite:stop-module',id),
  onRuntimeStatus:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('suite:runtime-status',listener);return()=>ipcRenderer.removeListener('suite:runtime-status',listener);},
  onCommand:callback=>{const listener=(_event,id)=>callback(id);ipcRenderer.on('suite:command',listener);return()=>ipcRenderer.removeListener('suite:command',listener);}
}));
