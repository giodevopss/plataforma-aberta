// Disposable runner only: positive host-access control followed by the exact
// production verification runtime, not a substitute network implementation.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {commandRunner,LocalRuntime} from '../../desktop/src/local-runtime.mjs';
import {affineImages} from '../../desktop/src/affine-stack.mjs';
if(process.env.CI!=='true'||process.platform!=='linux')throw Error('Disposable Linux acceptance required.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pa-quarantine-')),evidence=path.resolve('suite/research/cloud-verification');fs.mkdirSync(evidence,{recursive:true});
const run=commandRunner('docker'),runtime=new LocalRuntime({directory:root,specs:[{id:'networkcheck',image:affineImages.gateway,port:80,memoryMB:128,volumes:[],healthPath:'/'}],run}),normal='pa-'+runtime.identity.id+'-positive-control',owner='app.plataforma-aberta.workspace';runtime.enableVerification();let normalCreated=false,hits=0;
const server=http.createServer((_request,response)=>{hits++;response.end('OWN-HOST-SENTINEL');});await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));const port=server.address().port;
const report={status:'failed',commit:process.env.GITHUB_SHA,checks:[]};
try{
 await runtime.ensureImage(affineImages.gateway);await run(['network','create','--label',owner+'='+runtime.identity.id,normal]);normalCreated=true;
 const [network]=JSON.parse(await run(['network','inspect',normal])),host=network.IPAM.Config[0].Gateway;assert.ok(host);
 const positive=await run(['run','--rm','--network',normal,'--entrypoint','wget',affineImages.gateway,'-qO-','-T','5','http://'+host+':'+port]);assert.equal(positive,'OWN-HOST-SENTINEL');assert.equal(hits,1);report.checks.push('Normal owned bridge can reach an actual host sentinel, proving the control is reachable');
 const endpoint=await runtime.start('networkcheck');assert.ok(endpoint);const gateway='pa-'+runtime.identity.id+'-networkcheck-gateway';
 const [isolated]=JSON.parse(await run(['network','inspect','pa-'+runtime.identity.id+'-networkcheck-network']));assert.equal(isolated.Internal,true);assert.equal(isolated.Options['com.docker.network.bridge.gateway_mode_ipv4'],'isolated');
 for(const role of ['application','gateway']){const [container]=JSON.parse(await run(['container','inspect','pa-'+runtime.identity.id+'-networkcheck-'+role]));assert.equal(Object.keys(container.HostConfig.PortBindings||{}).length,0);}
 await assert.rejects(run(['run','--rm','--network','container:'+gateway,'--entrypoint','wget',affineImages.gateway,'-qO-','-T','3','http://'+host+':'+port],{timeout:10000}));assert.equal(hits,1);
 const result=await runtime.checkVerificationHealth('networkcheck');assert.equal(result.ok,true);report.checks.push('Exact production verification runtime starts original nginx through internal service DNS and authenticates its own gateway without publishing a port');
 await assert.rejects(run(['run','--rm','--network','container:'+gateway,'--entrypoint','nslookup',affineImages.gateway,'example.org','127.0.0.11'],{timeout:15000}));report.checks.push('Restored service namespace cannot reach the positive host control or resolve an external domain; the host sentinel receives no additional request');
 await runtime.destroyVerification();assert.equal(fs.existsSync(root),false);assert.equal((await run(['container','ls','--all','--filter','label='+owner+'='+runtime.identity.id,'--format','{{.Names}}'])).trim(),'');assert.ok((await run(['network','inspect',normal])).includes(normal));report.checks.push('Disposable runtime and its own resources removed; independent positive-control network remains');report.status='passed';
}catch(error){report.error=error.message;throw error;}finally{if(fs.existsSync(root))await runtime.destroyVerification().catch(error=>console.error('Quarantine cleanup:',error.message));if(normalCreated){await runtime.owned('network',normal);await run(['network','rm',normal]);}await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(evidence,'acceptance.json'),JSON.stringify(report,null,2)+'\n');}
