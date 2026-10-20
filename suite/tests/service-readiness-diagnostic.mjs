import os from 'node:os';

// Diagnose transport separately from the original app. Do not install/restart a
// guest, repeat a pull or publish CLI output, paths, identities or credentials.
export async function guestTransportDiagnostic(host){
 const result={hostTotalMemoryBytes:os.totalmem(),hostFreeMemoryBytes:os.freemem(),guestState:'unknown',ownerResponsive:false,engineResponsive:false};
 if(host.installer?.platform==='darwin')try{const state=host.installer.state(),text=await host.installer.control(state.binary,state.binarySHA256,['list','--json',host.installer.name],{timeout:15000}),items=text.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));if(items.length===1&&items[0].name===host.installer.name&&['Running','Stopped','Broken'].includes(items[0].status))result.guestState=items[0].status;}catch{}
 const guest=host.guest;if(!guest)return result;
 try{await guest.verifyOwnership();result.ownerResponsive=true;}catch{return result;}
 try{await guest.run(['info','--format','{{json .ServerVersion}}'],{timeout:15000});result.engineResponsive=true;}catch{}
 return result;
}

// Public readiness evidence is a fixed schema. Never return response bodies,
// process arguments, environment, names, paths, logs or exception messages.
export function safeReadinessDiagnostic(value={}){
 const roles=new Set(['backend','frontend','worker','other']),states=new Set(['online','stopped','errored','launching','one-launch-status','waiting restart']);
 const ports=new Set([3000,4200,5000]);
 return {processes:(Array.isArray(value.processes)?value.processes:[]).slice(0,12).map(item=>({role:roles.has(item?.role)?item.role:'other',status:states.has(item?.status)?item.status:'unknown',restarts:Number.isInteger(item?.restarts)&&item.restarts>=0?Math.min(item.restarts,10000):null})),http:(Array.isArray(value.http)?value.http:[]).filter(item=>ports.has(item?.port)).slice(0,3).map(item=>({port:item.port,status:Number.isInteger(item.status)&&item.status>=100&&item.status<=599?item.status:null,json:item.json===true,registrationBoolean:item.registrationBoolean===true,connected:item.connected===true}))};
}
export async function postizReadinessDiagnostic(run,container){
 // Only this fixed program executes in the owned original container. Its stdout
 // is already reduced and is validated again before it reaches the public JSON.
 const program=`const cp=require('node:child_process'),http=require('node:http');
 (async()=>{let processes=[];try{const items=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:10000}));processes=items.map(item=>({role:/backend/i.test(item.name)?'backend':/frontend/i.test(item.name)?'frontend':/worker/i.test(item.name)?'worker':'other',status:['online','stopped','errored','launching','one-launch-status','waiting restart'].includes(item.pm2_env?.status)?item.pm2_env.status:'unknown',restarts:Number.isInteger(item.pm2_env?.restart_time)?item.pm2_env.restart_time:null}));}catch{}
 const probes=await Promise.all([3000,4200,5000].map(port=>new Promise(resolve=>{let done=false;const finish=value=>{if(!done){done=true;resolve({port,...value});}};const request=http.get({host:'127.0.0.1',port,path:port===3000?'/auth/can-register':port===5000?'/api/auth/can-register':'/',timeout:5000},response=>{let body='';response.on('data',chunk=>{body=(body+chunk).slice(0,4096);});response.on('end',()=>{let registrationBoolean=false;try{registrationBoolean=typeof JSON.parse(body).register==='boolean';}catch{}finish({status:response.statusCode,json:String(response.headers['content-type']).includes('application/json'),registrationBoolean,connected:true});});});request.on('timeout',()=>{request.destroy();finish({connected:false});});request.on('error',()=>finish({connected:false}));})));
 console.log(JSON.stringify({processes,http:probes}));})().catch(()=>console.log('{}'));`;
 try{return safeReadinessDiagnostic(JSON.parse(await run(['exec',container,'node','-e',program],{timeout:20000})));}catch{return safeReadinessDiagnostic();}
}
