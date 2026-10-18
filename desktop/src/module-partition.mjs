export function modulePartition(profileId,id){
 if(profileId!=='legacy'&&!/^[a-f0-9]{32}$/.test(profileId||''))throw Error('Perfil de navegador inválido.');
 if(!/^[a-z][a-z0-9-]{1,40}$/.test(id||''))throw Error('Aplicativo de navegador inválido.');
 return 'persist:complete-'+(profileId==='legacy'?'':profileId+'-')+id;
}
