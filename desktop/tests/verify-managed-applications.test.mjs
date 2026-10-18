import test from 'node:test';import assert from 'node:assert/strict';import {verifyManagedApplications} from '../src/verify-managed-applications.mjs';
test('Recovery never keeps two complete restored stacks in memory together',async()=>{
 const calls=[],running=new Set(),runtime={specs:new Map([['first',{healthPath:'/health'}],['second',{}]]),start:async id=>{assert.equal(running.size,0);running.add(id);calls.push('start '+id);return {origin:'http://127.0.0.1:1234',token:'private'};},stop:async id=>{running.delete(id);calls.push('stop '+id);}};
 const checks=await verifyManagedApplications(runtime,['first','second'],async(url,options)=>{assert.equal(options.headers['X-PA-Session'],'private');calls.push(url);return {ok:true,body:{cancel:async()=>{}}};});
 assert.equal(checks.length,2);assert.deepEqual(calls,['start first','http://127.0.0.1:1234/health','stop first','start second','http://127.0.0.1:1234/','stop second']);assert.equal(running.size,0);
});
test('Failed starts and health checks stop partial restored resources and do not open another stack',async()=>{
 for(const stage of ['start','health']){const calls=[],runtime={specs:new Map([['first',{}]]),start:async id=>{calls.push('start '+id);if(stage==='start')throw Error('partial start');return {origin:'http://127.0.0.1:1234',token:'private'};},stop:async id=>calls.push('stop '+id)};await assert.rejects(verifyManagedApplications(runtime,['first','second'],async()=>{throw Error('health failed');}),stage==='start'?/partial start/:/health failed/);assert.deepEqual(calls,['start first','stop first']);}
});
test('Both verification and cleanup failures remain visible to recovery',async()=>{
 const runtime={start:async()=>{throw Error('original failure');},stop:async()=>{throw Error('cleanup failed');}};await assert.rejects(verifyManagedApplications(runtime,['first']),error=>error instanceof AggregateError&&error.errors[0].message==='original failure'&&error.errors[1].message==='cleanup failed');
});
