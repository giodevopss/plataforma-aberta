import test from 'node:test';import assert from 'node:assert/strict';
import {safeReadinessDiagnostic,postizReadinessDiagnostic} from '../../suite/tests/service-readiness-diagnostic.mjs';
test('Service readiness exposes only fixed process roles and HTTP states, never raw account or process data',async()=>{
 const secret='synthetic-private-password';const proof=safeReadinessDiagnostic({processes:[{role:'backend',status:'online',restarts:2,args:[secret],env:{password:secret}},{role:secret,status:secret,restarts:secret}],http:[{port:3000,status:503,json:true,registrationBoolean:false,connected:true,body:secret},{port:4200,status:secret,url:secret},{port:12345,status:200}],cookie:secret});
 assert.deepEqual(proof,{processes:[{role:'backend',status:'online',restarts:2},{role:'other',status:'unknown',restarts:null}],http:[{port:3000,status:503,json:true,registrationBoolean:false,connected:true},{port:4200,status:null,json:false,registrationBoolean:false,connected:false}]});assert.equal(JSON.stringify(proof).includes(secret),false);
 const result=await postizReadinessDiagnostic(async args=>{assert.deepEqual(args.slice(0,4),['exec','owned-synthetic','node','-e']);return JSON.stringify({http:[{port:5000,status:200,registrationBoolean:true,connected:true,secret}]});},'owned-synthetic');assert.equal(result.http[0].registrationBoolean,true);assert.equal(JSON.stringify(result).includes(secret),false);
 assert.deepEqual(await postizReadinessDiagnostic(async()=>{throw Error(secret);},'owned-synthetic'),{processes:[],http:[]});
});
