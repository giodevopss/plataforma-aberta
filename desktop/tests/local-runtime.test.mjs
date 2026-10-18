import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LocalRuntime,validateSpec,gatewayConfig,commandRunner,isLocalEngineEndpoint} from '../src/local-runtime.mjs';
import {localApps} from '../src/local-apps.mjs';

test('Official image is pinned and never accepts mutable tags or invalid volume paths',()=>{
 assert.equal(validateSpec(localApps[0]).id,'presenton');
 for(const patch of [{image:'ghcr.io/presenton/presenton:latest'},{id:'../other'},{port:0},{memoryMB:0},{volumes:[{name:'../data',target:'/data'}]}])assert.throws(()=>validateSpec({...localApps[0],...patch}));
});
test('Gateway rejects missing tokens, foreign origins and hosts; upstream is internal only',()=>{
 const config=gatewayConfig({token:'a'.repeat(64),port:12345,upstreamPort:80});
 assert.match(config,/http_x_pa_session/);assert.match(config,/return 403/);assert.match(config,/default 0/);assert.match(config,/http_host != "127.0.0.1:12345"/);assert.match(config,/set \$application http:\/\/application:80/);assert.match(config,/resolver 127\.0\.0\.11/);assert.match(config,/proxy_pass \$application/);assert.match(config,/proxy_set_header X-PA-Session ""/);assert.match(config,/proxy_buffering off/);assert.match(config,/proxy_set_header Upgrade/);
 assert.throws(()=>gatewayConfig({token:'x; injection',port:12345,upstreamPort:80}));
  assert.throws(()=>gatewayConfig({token:'a'.repeat(64),port:12345,upstreamPort:80,remoteUser:'bad"; inject'}));
});
test('Local resource ownership prevents stopping unrelated applications',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pa-runtime-test-'));const calls=[];
 try{const runtime=new LocalRuntime({availableBytes:()=>Infinity,directory,specs:localApps,run:async args=>{calls.push(args);if(args[1]==='ls')return JSON.stringify({ID:'foreign',Names:args.find(arg=>arg.startsWith('name=^')).slice(6,-1)});if(args[1]==='inspect')return JSON.stringify([{Config:{Labels:{'app.plataforma-aberta.workspace':'another'}},State:{Running:true}}]);throw Error('Unexpected mutation');}});
  await assert.rejects(runtime.stop('presenton'),/não pertence/);assert.ok(calls.every(args=>!['stop','rm','prune'].includes(args[0])));
  const again=new LocalRuntime({availableBytes:()=>Infinity,directory,specs:localApps});assert.equal(runtime.identity.id,again.identity.id);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('Stopped owned containers are reused; a different spec never migrates silently',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pa-runtime-test-'));const calls=[];
 try{let runtime;runtime=new LocalRuntime({availableBytes:()=>Infinity,directory,specs:localApps,run:async args=>{calls.push(args);if(args[1]==='ls')return JSON.stringify({Names:'my-app'});if(args[1]==='inspect')return JSON.stringify([{Config:{Labels:{'app.plataforma-aberta.workspace':runtime.identity.id,'app.plataforma-aberta.spec':'v1'}},State:{Running:false}}]);if(args[0]==='start')return 'ok';throw Error('Unexpected mutation');}});
  await runtime.container('my-app',[],'v1');assert.deepEqual(calls.at(-1),['start','my-app']);
  await assert.rejects(runtime.container('my-app',[],'v2'),/backup e uma migração/);assert.ok(calls.every(args=>args[0]!=='run'));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('CLI is invoked with literal arguments, without a shell',async()=>{
 const result=await commandRunner(process.execPath)(['-e','process.stdout.write(process.argv[1])','$(printf secret); echo nope']);
 assert.equal(result,'$(printf secret); echo nope');
});
test('A remote Docker context cannot silently move local suite data to a server',()=>{
 for(const endpoint of ['unix:///Users/qa/.colima/docker.sock','npipe:////./pipe/docker_engine','tcp://127.0.0.1:2375','http://[::1]:1234'])assert.equal(isLocalEngineEndpoint(endpoint),true);
 for(const endpoint of ['ssh://user@server','tcp://remote.example:2375','https://remote.example','tcp://user:pass@localhost:2375',null])assert.equal(isLocalEngineEndpoint(endpoint),false);
});
test('Installed images start offline; a missing immutable image is downloaded once',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pa-runtime-offline-'));const calls=[];let installed=true;
 try{const runtime=new LocalRuntime({availableBytes:()=>Infinity,directory,specs:localApps,run:async args=>{calls.push(args);if(args[0]==='image'){if(installed)return 'sha256:'+'a'.repeat(64);throw Error('Not installed');}if(args[0]==='pull')return 'Downloaded';throw Error('Unexpected command');}});
  assert.deepEqual(await runtime.ensureImage(localApps[0].image),{cached:true});assert.ok(!calls.some(a=>a[0]==='pull'));
  installed=false;assert.deepEqual(await runtime.ensureImage(localApps[0].image),{cached:false});assert.equal(calls.filter(a=>a[0]==='pull').length,1);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('A missing image cannot fill the host disk; cached images do not require installation space',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pa-space-test-'));const calls=[];
 try{const runtime=new LocalRuntime({directory:dir,specs:[],availableBytes:()=>0,run:async args=>{calls.push(args);if(args[1]==='inspect')throw Error('missing');return '';}});await assert.rejects(runtime.ensureImage('example.test/app@sha256:'+'a'.repeat(64)),/Espaço livre insuficiente/);assert.equal(calls.some(c=>c[0]==='pull'),false);
 const cached=new LocalRuntime({directory:dir,specs:[],availableBytes:()=>0,run:async()=> 'sha256:'+'b'.repeat(64)});assert.equal((await cached.ensureImage('example.test/app@sha256:'+'a'.repeat(64))).cached,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Windows-container mode cannot download or start Linux applications',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pa-windows-engine-')),calls=[];
 try{const runtime=new LocalRuntime({directory,specs:localApps,run:async args=>{calls.push(args);if(args[0]==='context')return JSON.stringify('npipe:////./pipe/docker_engine');if(args[0]==='info')return JSON.stringify({OSType:'windows',Architecture:'x86_64'});throw Error('Unexpected mutation');}});await assert.rejects(runtime.start('presenton'),/Linux\/WSL2/);assert.ok(calls.every(args=>['context','info'].includes(args[0])));}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('An explicit private guest endpoint cannot be redirected by a foreign Docker environment or context',async t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pa-private-endpoint-')),previous={host:process.env.DOCKER_HOST,context:process.env.DOCKER_CONTEXT},calls=[];t.after(()=>{if(previous.host===undefined)delete process.env.DOCKER_HOST;else process.env.DOCKER_HOST=previous.host;if(previous.context===undefined)delete process.env.DOCKER_CONTEXT;else process.env.DOCKER_CONTEXT=previous.context;fs.rmSync(directory,{recursive:true,force:true});});process.env.DOCKER_HOST='tcp://foreign.example:2375';process.env.DOCKER_CONTEXT='foreign';const runtime=new LocalRuntime({directory,specs:[],engineEndpoint:'unix:///var/run/docker.sock',run:async args=>{calls.push(args);if(args[0]==='info')return JSON.stringify({OSType:'linux',Architecture:'aarch64',MemTotal:8192,NCPU:4});throw Error('Ambient context must not be read');}});assert.equal((await runtime.probe()).available,true);assert.deepEqual(calls,[['info','--format','{{json .}}']]);assert.throws(()=>new LocalRuntime({directory,specs:[],engineEndpoint:'tcp://foreign.example:2375'}),/máquina local/);});
