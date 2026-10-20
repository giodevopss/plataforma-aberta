import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
// Original Postiz local storage persists FRONTEND_URL + '/uploads/...' in text
// fields (including JSON encoded post attachments). A restored dedicated database
// must relocate those owned asset references before any application/worker starts.
export function localAssetRelocationSQL(from,to){
 const valid=origin=>{if(typeof origin!=='string'||!/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(origin))throw Error('Origem de restauração inválida.');const port=Number(new URL(origin).port);if(port<1024||port>65535)throw Error('Porta de restauração inválida.');};valid(from);valid(to);
 return `BEGIN;
DO $pa_relocation$
DECLARE field record;
BEGIN
 FOR field IN SELECT c.table_name,c.column_name,c.data_type FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.data_type IN ('text','character varying','json','jsonb') LOOP
  EXECUTE format('UPDATE %I.%I SET %I = replace(%I::text, $1, $2)::%s WHERE strpos(%I::text, $1) > 0', 'public',field.table_name,field.column_name,field.column_name,CASE field.data_type WHEN 'character varying' THEN 'text' ELSE field.data_type END,field.column_name) USING '${from}/uploads/', '${to}/uploads/';
 END LOOP;
END $pa_relocation$;
COMMIT;`;
}
// A recovered profile may be backed up again before its first start. Its
// database still contains the first origin, not the intermediate reserved port.
export function assertRelocationBackupSafe(settings){
 const pending=settings.assetRelocation;if(pending?.started!==undefined&&typeof pending.started!=='boolean')throw Error('Estado da migração de anexos inválido.');
 if(pending?.started)throw Error('Reabra o Postiz para concluir a migração de anexos antes de criar ou copiar este backup. Seus dados foram preservados.');
}
function persistStarted(runtime,id,settings){
 const file=path.join(runtime.directory,id,'runtime.json'),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Estado da migração de anexos inválido.');const temporary=file+'.'+crypto.randomUUID()+'.tmp';let descriptor;
 try{descriptor=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(descriptor,JSON.stringify(settings)+'\n');fs.fsyncSync(descriptor);fs.closeSync(descriptor);descriptor=null;fs.renameSync(temporary,file);if(process.platform!=='win32'){const parent=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}}}
 finally{if(descriptor!==undefined&&descriptor!==null)fs.closeSync(descriptor);fs.rmSync(temporary,{force:true});}
}
export function restoredAssetRelocation(id,settings,nextPort){
 assertRelocationBackupSafe(settings);
 if(id!=='postiz'){if(settings.assetRelocation!==undefined)throw Error('Plano de origem inesperado para este aplicativo.');return undefined;}
 const current='http://127.0.0.1:'+settings.port,to='http://127.0.0.1:'+nextPort,pending=settings.assetRelocation;
 let from=current;
 if(pending!==undefined){
  if(!pending||typeof pending!=='object'||pending.to!==current||pending.from===pending.to)throw Error('Plano de origem pendente incompatível com o snapshot.');
  localAssetRelocationSQL(pending.from,pending.to);from=pending.from;
 }
 localAssetRelocationSQL(from,to);
 return from===to?undefined:{from,to};
}
export async function relocateRestoredAssets(runtime,id,stack,settings){
 if(!settings.assetRelocation)return;
 if(id!=='postiz')throw Error('Migração de origem desconhecida.');const {from,to}=settings.assetRelocation,origin='http://127.0.0.1:'+settings.port;if(to!==origin||from===to)throw Error('Plano de restauração incompatível.');const sql=localAssetRelocationSQL(from,to),database=stack.database,service=stack.compose.services[database?.service];if(!service||!/^[-a-z0-9]+$/.test(database.user)||!/^[-a-z0-9]+$/.test(database.database))throw Error('Banco dedicado de restauração inválido.');
 // The database may commit before its client receives confirmation. Persist the
 // indeterminate state before touching it; same-origin retry is idempotent, but
 // a new backup/restore cannot infer which origin is present until retry ends.
 if(settings.assetRelocation.started!==undefined&&typeof settings.assetRelocation.started!=='boolean')throw Error('Estado da migração de anexos inválido.');settings.assetRelocation.started=true;persistStarted(runtime,id,settings);
 await runtime.runCompose(runtime.composeArgs(id,['up','--detach','--pull','never',database.service]),{timeout:180000});let ready=false;
 for(let attempt=0;attempt<120;attempt++){const container=await runtime.owned('container',service.container_name);if(container?.State.Health?.Status==='healthy'){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,1000));}if(!ready)throw Error('O banco restaurado não ficou pronto para migrar as referências locais.');
 await runtime.run(['exec',service.container_name,'psql','--no-psqlrc','-v','ON_ERROR_STOP=1','-U',database.user,'-d',database.database,'-c',sql],{timeout:180000});delete settings.assetRelocation;
}
