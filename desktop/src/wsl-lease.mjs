import {spawn as spawnProcess} from 'node:child_process';
// systemd services alone do not keep a WSL instance alive. Hold one foreground
// command in this exact owned distro while the desktop is using its services.
// https://learn.microsoft.com/en-us/windows/wsl/systemd
export async function acquireWslLease(guest,{spawn=spawnProcess,onExit=()=>{}}={}){
 await guest.verifyOwnership();
 const child=spawn(guest.binary,guest.invocation(['/bin/sh','-c','printf "PLATAFORMA_LEASE_READY\\n"; exec /bin/sleep infinity']),{shell:false,windowsHide:true,env:guest.environment(),stdio:['ignore','pipe','pipe']});
 let closed=false,ended=false,ready=false,stderr='';child.stderr.on('data',bytes=>stderr=(stderr+bytes).slice(-1000));
 child.once('exit',()=>{ended=true;if(ready&&!closed)onExit();});
 try{await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('A sessão do runtime Windows não iniciou.')),15000);const fail=error=>{clearTimeout(timer);reject(error);};child.once('error',fail);child.once('exit',()=>{if(!ready)fail(Error('A sessão WSL encerrou antes de iniciar. '+stderr));});child.stdout.on('data',bytes=>{output=(output+bytes).slice(-1024);if(!ready&&output.includes('PLATAFORMA_LEASE_READY\n')){ready=true;clearTimeout(timer);resolve();}});});}catch(error){closed=true;child.kill();throw error;}
 return {assertAvailable(){if(closed||ended||child.exitCode!==null||child.signalCode!==null)throw Error('A sessão do runtime Windows encerrou. Reinicie os serviços locais antes de continuar.');},async close(){if(closed)return;closed=true;if(ended)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('A sessão própria WSL ainda não encerrou.')),10000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();});}};
}
