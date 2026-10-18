import test from 'node:test';
import assert from 'node:assert/strict';
import {createAffineStack} from '../src/affine-stack.mjs';
const input={prefix:'pa-'+ 'a'.repeat(24)+'-affine',owner:'a'.repeat(24),port:12345,token:'b'.repeat(64),postgresPassword:'c'.repeat(64),specHash:'d'.repeat(64)};
test('Complete AFFiNE uses isolated local PostgreSQL and exposes only the authenticated gateway',()=>{
 const {compose,config}=createAffineStack(input);
 assert.deepEqual(Object.values(compose.services).flatMap(s=>s.ports||[]),['127.0.0.1:12345:8080']);
 assert.equal(compose.services.postgres.volumes[0],'postgres_data:/var/lib/postgresql/data');
 assert.ok(!JSON.stringify(compose).includes('POSTGRES_HOST_AUTH_METHOD'));
 for(const s of Object.values(compose.services)){assert.match(s.image,/@sha256:[a-f0-9]{64}$/);assert.equal(s.labels['app.plataforma-aberta.workspace'],input.owner);assert.ok(s.container_name.startsWith(input.prefix));}
 assert.equal(compose.services.application.depends_on.migration.condition,'service_completed_successfully');
 assert.equal(compose.services.gateway.user,'65534:65534');assert.match(config,/application:3010/);
});
test('Invalid stack identities and credentials cannot enter generated runtime configuration',()=>{
 for(const patch of [{prefix:'../other'},{owner:'other'},{postgresPassword:'injection\nvalue'},{token:'"; injected'},{port:0}])assert.throws(()=>createAffineStack({...input,...patch}));
});
