import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {CompleteRuntime,serverApps} from '../src/complete-runtime.mjs';
import {enableVerification,isolateStack,isolatedGateway,destroyVerification,verificationHealth} from '../src/verification-runtime.mjs';
import {verifyRestoredCopy} from '../src/verify-restored-copy.mjs';
import {ProfileStore} from '../src/profile-store.mjs';

function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pa-isolated-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
const settings={port:32123,token:'a'.repeat(64),postgresPassword:'b'.repeat(64),secret:'c'.repeat(64),secret2:'d'.repeat(64),secret3:'e'.repeat(64),storageSecret:'f'.repeat(64),queueSecret:'1'.repeat(64),analyticsSecret:'2'.repeat(64),hubSecret:'3'.repeat(64),authzPassword:'4'.repeat(64),authzSecret:'5'.repeat(64)};
test('Every original service, including shared signed-storage namespaces, loses host ports, external DNS and the host bridge during verification',t=>{
 const runtime=new CompleteRuntime({directory:fixture(t),specs:serverApps});runtime.enableVerification();
 for(const app of serverApps){const stack=runtime.serverDefinition(app.id,settings,'a'.repeat(64));assert.equal(stack.compose.networks.default.internal,true);assert.equal(stack.compose.networks.default.driver_opts[isolatedGateway],'isolated');assert.ok(stack.config.includes('listen 32123;'));for(const service of Object.values(stack.compose.services)){assert.equal(service.ports,undefined);if(!service.network_mode)assert.deepEqual(service.dns,['127.0.0.1']);assert.ok(service.cap_drop.includes('NET_RAW'));}}
 const normal=new CompleteRuntime({directory:path.join(fixture(t),'normal'),specs:serverApps});assert.ok(normal.serverDefinition('affine',settings,'a'.repeat(64)).compose.services.gateway.ports.length);
});
test('Verification refuses existing data, a running runtime and network escape privileges',t=>{
 const directory=fixture(t),runtime=new CompleteRuntime({directory,specs:serverApps});fs.writeFileSync(path.join(directory,'user-data'),'preserve');assert.throws(()=>enableVerification(runtime),/novo/);assert.equal(fs.readFileSync(path.join(directory,'user-data'),'utf8'),'preserve');
 for(const extra of [{privileged:true},{cap_add:['NET_ADMIN']},{network_mode:'host'},{network_mode:'service:absent'},{extra_hosts:['host.docker.internal:host-gateway']}]){const stack=runtime.serverDefinition('affine',settings,'a'.repeat(64));Object.assign(stack.compose.services.application,extra);assert.throws(()=>isolateStack(stack,settings));}
});
test('A foreign resource prevents all destructive cleanup, even after other owned resources were checked',async t=>{
 const directory=fixture(t),runtime=new CompleteRuntime({directory,specs:serverApps}),calls=[];runtime.enableVerification();fs.mkdirSync(path.join(directory,'affine'));fs.writeFileSync(path.join(directory,'affine','runtime.json'),JSON.stringify(settings));runtime.owned=async(kind,name)=>{calls.push([kind,name]);if(kind==='volume')throw Error('foreign volume');return {};};runtime.run=async()=>{throw Error('No mutation allowed');};runtime.close=async()=>{throw Error('Must not close before full ownership check');};await assert.rejects(destroyVerification(runtime),/foreign volume/);assert.ok(calls.some(([kind])=>kind==='container'));assert.ok(fs.existsSync(path.join(directory,'affine','runtime.json')));
});
test('Health probing keeps the restored credential off argv and exposes no host port',async t=>{
 const directory=fixture(t),runtime=new CompleteRuntime({directory,specs:serverApps});runtime.enableVerification();fs.mkdirSync(path.join(directory,'affine'));fs.writeFileSync(path.join(directory,'affine','runtime.json'),JSON.stringify(settings));runtime.owned=async()=>({State:{Running:true}});runtime.ensureImage=async()=>{};runtime.run=async(args,options)=>{assert.ok(args.includes('--interactive'));assert.ok(args.includes('container:pa-'+runtime.identity.id+'-affine-gateway'));assert.ok(!args.includes('--publish'));assert.ok(!args.join(' ').includes(settings.token));assert.ok(options.input.includes(settings.token));return 'OK';};await verificationHealth(runtime,'affine');
});
test('Original scheduled writes affect only a disposable verification profile and cleanup runs after app failure',async t=>{
 const store=new ProfileStore(fixture(t)),candidate=store.create();fs.writeFileSync(path.join(candidate.directory,'original'),'unchanged');const before=store.read();
 for(const failure of [false,true]){let copyDirectory,cleaned=false;const result=verifyRestoredCopy({profileStore:store,createRuntime:directory=>{copyDirectory=path.dirname(directory);assert.notEqual(copyDirectory,candidate.directory);return {directory,enableVerification(){this.verificationMode=true;},async destroyVerification(){cleaned=true;}};},snapshot:'/authenticated',manifest:{applications:['activepieces']},restore:async(runtime)=>fs.writeFileSync(path.join(copyDirectory,'worker-data'),'snapshot'),verify:async()=>{fs.writeFileSync(path.join(copyDirectory,'worker-data'),'scheduled write');if(failure)throw Error('original startup failed');return ['Original worker ready'];}});if(failure)await assert.rejects(result,/original startup failed/);else assert.ok((await result).some(value=>value.includes('never started')));assert.ok(cleaned);assert.equal(fs.existsSync(copyDirectory),false);assert.equal(fs.readFileSync(path.join(candidate.directory,'original'),'utf8'),'unchanged');assert.deepEqual(store.read(),before);}
});
