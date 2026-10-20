import test from 'node:test';import assert from 'node:assert/strict';import {releaseFailures} from '../scripts/require-release.mjs';
test('Explicit authorized unsigned delivery changes only the signature requirement and preserves every functional release gate',()=>{
 const applications=Object.fromEntries(['presenton','openwhispr','graphite','excalidraw','screenity','affine','baserow','activepieces','plane','formbricks','postiz','paperless'].map(id=>[id,{acceptance:'passed'}])),platforms=Object.fromEntries(['darwin-arm64','darwin-x64','win32-x64'].map(id=>[id,{status:'passed'}]));
 const ready={release_ready:true,applications,platforms,runtime_installer:'passed',complete_backup_restore:'passed',upgrade_rollback:'passed',distribution_signatures:'pending',unsigned_distribution_authorized:true},check=(readiness=ready,unsigned=true,version='1.0.0')=>releaseFailures({version,readiness,unsigned});
 assert.deepEqual(check(),[]);assert.match(check(ready,false).join(),/distribution_signatures/);assert.match(check({...ready,unsigned_distribution_authorized:false}).join(),/não foi autorizada/);assert.deepEqual(check({...ready,distribution_signatures:'passed'},false),[]);
 assert.match(check({...ready,release_ready:false}).join(),/Suíte completa/);assert.match(check(ready,true,'1.0.0-alpha.1').join(),/desenvolvimento/);
 assert.match(check({...ready,applications:{...applications,postiz:{acceptance:'pending'}}}).join(),/postiz/);assert.match(check({...ready,platforms:{...platforms,'darwin-arm64':{status:'partial'}}}).join(),/darwin-arm64/);
 for(const gate of ['runtime_installer','complete_backup_restore','upgrade_rollback'])assert.match(check({...ready,[gate]:'pending'}).join(),new RegExp(gate));
});
