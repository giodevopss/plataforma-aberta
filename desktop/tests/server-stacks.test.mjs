import test from 'node:test';
import assert from 'node:assert/strict';
import {serverApps,createServerStack,stackImages} from '../src/server-stacks.mjs';
const credentials=Object.fromEntries(['token','postgresPassword','secret','secret2','secret3','storageSecret','queueSecret','analyticsSecret','hubSecret','authzPassword','authzSecret'].map(k=>[k,'b'.repeat(64)]));
for(const app of serverApps)test(app.id+': complete services have immutable images, private storage and only authenticated loopback exposure',()=>{
 const owner='a'.repeat(24),prefix='pa-'+owner+'-'+app.id;
 const result=createServerStack(app.id,{...credentials,owner,prefix,port:12345,specHash:'c'.repeat(64)});
 const c=result.compose;
 assert.deepEqual(Object.values(c.services).flatMap(s=>s.ports||[]),['127.0.0.1:12345:'+(app.id==='formbricks'?'12345':'8080')]);
 for(const [role,s]of Object.entries(c.services)){assert.match(s.image,/@sha256:[a-f0-9]{64}$/);assert.equal(s.container_name,prefix+'-'+role);assert.equal(s.labels['app.plataforma-aberta.workspace'],owner);assert.equal(s.restart,'no');assert.ok(!s.privileged);for(const mount of s.volumes||[])if(typeof mount==='object')assert.ok(mount.source&&!mount.source.startsWith('/'));}
 const mounted=new Set(Object.values(c.services).flatMap(s=>(s.volumes||[]).map(v=>typeof v==='string'?v.split(':')[0]:v.type==='volume'?v.source:null)));for(const [key,volume]of Object.entries(c.volumes||{})){assert.ok(mounted.has(key),'Backup contract cannot require an unmounted optional volume: '+key);assert.ok(volume.name.startsWith(prefix+'-'));assert.equal(volume.labels['app.plataforma-aberta.workspace'],owner);}
 assert.ok(!JSON.stringify(c).includes('__PA_'));
 assert.ok(stackImages(app.id).length>=4);
});
test('Invalid credentials and ownership cannot produce a service stack',()=>{
 for(const patch of [{owner:'other'},{postgresPassword:'secret'},{prefix:'pa-'+'a'.repeat(24)+'-postiz'},{token:'bad'},{port:0}])assert.throws(()=>createServerStack('baserow',{...credentials,owner:'a'.repeat(24),prefix:'pa-'+'a'.repeat(24)+'-baserow',port:12345,specHash:'c'.repeat(64),...patch}));
});
test('Every Plane database client uses the generated PostgreSQL password',()=>{
 const password='9'.repeat(64),owner='a'.repeat(24);const {compose}=createServerStack('plane',{...credentials,postgresPassword:password,owner,prefix:'pa-'+owner+'-plane',port:12345,specHash:'c'.repeat(64)});
 let clients=0;for(const service of Object.values(compose.services))if(service.environment?.DATABASE_URL){const url=new URL(service.environment.DATABASE_URL);assert.equal(url.hostname,'plane-db');assert.equal(url.username,'plane');assert.equal(url.password,compose.services['plane-db'].environment.POSTGRES_PASSWORD);assert.equal(url.pathname,'/plane');clients++;}
 assert.ok(clients>=4,'API, worker, scheduler and migrator must all authenticate to the generated database');
});
test('Paperless uses documented local identity only behind its authenticated private gateway',()=>{
 const owner='a'.repeat(24),{compose,config}=createServerStack('paperless',{...credentials,owner,prefix:'pa-'+owner+'-paperless',port:12345,specHash:'c'.repeat(64)});
 assert.match(config,/proxy_set_header Remote-User "plataforma"/);assert.match(config,/if \(\$session_ok = 0\) \{ return 403; \}/);
 assert.equal(compose.services.application.environment.PAPERLESS_ADMIN_PASSWORD,credentials.secret2);assert.equal(compose.services.application.environment.PAPERLESS_ENABLE_HTTP_REMOTE_USER_API,'true');assert.equal(compose.services.application.ports,undefined);
 assert.ok(compose.services.application.volumes.filter(v=>!v.target.endsWith('/tika.py')).every(v=>v.type==='volume'));const parser=compose.services.application.volumes.find(v=>v.target.endsWith('/tika.py'));assert.equal(parser.type,'bind');assert.equal(parser.read_only,true);assert.ok(['data','media','export','consume'].every(name=>compose.volumes[name+'_files']));
});
test('Formbricks private objects preserve signed host/path and share no application port with the host',()=>{
 const owner='a'.repeat(24),{compose,config}=createServerStack('formbricks',{...credentials,owner,prefix:'pa-'+owner+'-formbricks',port:12345,specHash:'c'.repeat(64)});
 assert.equal(compose.services.gateway.network_mode,'service:formbricks');assert.equal(compose.services.gateway.ports,undefined);assert.equal(compose.services.formbricks.environment.S3_ENDPOINT_URL,'http://127.0.0.1:12345');assert.deepEqual(compose.services.formbricks.ports,['127.0.0.1:12345:12345']);
 assert.equal(compose.services.storage.ports,undefined);assert.equal(compose.services.formbricks.depends_on['storage-init'].condition,'service_completed_successfully');assert.ok(compose.volumes.object_data.name.startsWith('pa-'+owner));assert.match(config,/location ~ \^\/plataforma-files/);assert.match(config,/proxy_set_header Host \$http_host/);
});

test('Formbricks response decryption and Better Auth share the persistent generated secret on the app and migrator',()=>{
 const owner='a'.repeat(24),{compose}=createServerStack('formbricks',{...credentials,owner,prefix:'pa-'+owner+'-formbricks',port:12345,specHash:'c'.repeat(64)});let configured=0;
 for(const service of Object.values(compose.services))if(service.environment?.BETTER_AUTH_SECRET){configured++;assert.equal(service.environment.NEXTAUTH_SECRET,credentials.secret);assert.equal(service.environment.NEXTAUTH_SECRET,service.environment.BETTER_AUTH_SECRET);assert.equal(service.environment.NEXTAUTH_URL,'http://127.0.0.1:12345');}assert.ok(configured>=2,'Both migrations and the full original web app need the supported response secret');
});
