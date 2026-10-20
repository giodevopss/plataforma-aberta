import test from 'node:test';import assert from 'node:assert/strict';
import {nativeGraphicsQAArgs} from '../../suite/tests/native-graphics-args.mjs';
test('Hosted EGL workaround applies only to actual owned Intel Mac VM QA and cannot disable normal product GPU or sandbox checks',()=>{
 const env={CI:'true',GITHUB_REPOSITORY:'giodevopss/plataforma-aberta',PA_OWN_VM_ACCEPTANCE:'1',PA_DESKTOP_TEST_GUEST_CONFIG:'/synthetic/owned-guest.json'},options={platform:'darwin',architecture:'x64',env};assert.deepEqual(nativeGraphicsQAArgs(options),['--disable-gpu']);assert.deepEqual(nativeGraphicsQAArgs({...options,env:{...env,PA_DESKTOP_TEST_GUEST_CONFIG:undefined,PA_COMBINED_GUEST:'/synthetic/guest.json'}}),['--disable-gpu']);
 for(const patch of [{platform:'win32'},{platform:'linux'},{architecture:'arm64'},{env:{...env,CI:'false'}},{env:{...env,GITHUB_REPOSITORY:'other/repo'}},{env:{...env,PA_OWN_VM_ACCEPTANCE:undefined}},{env:{...env,PA_DESKTOP_TEST_GUEST_CONFIG:undefined}}])assert.deepEqual(nativeGraphicsQAArgs({...options,...patch}),[]);
});
