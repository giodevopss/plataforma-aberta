import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {restoredAssetRelocation,localAssetRelocationSQL} from '../src/restore-relocation.mjs';
import {RuntimeBackup} from '../src/runtime-backup.mjs';
test('Three cold restores before first startup retain the actual database origin instead of intermediate reserved ports',()=>{
 let settings={port:41001};for(const next of [42002,43003,44004]){const before=structuredClone(settings),plan=restoredAssetRelocation('postiz',settings,next);assert.deepEqual(settings,before);assert.deepEqual(plan,{from:'http://127.0.0.1:41001',to:'http://127.0.0.1:'+next});assert.ok(localAssetRelocationSQL(plan.from,plan.to).includes('http://127.0.0.1:41001/uploads/'));settings={port:next,assetRelocation:plan};}
 assert.equal(restoredAssetRelocation('postiz',settings,41001),undefined);
});
test('An inconsistent pending migration or foreign origin cannot prepare a guest or create a restore volume',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pa-origin-plan-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const [index,pending]of [{from:'https://foreign.invalid',to:'http://127.0.0.1:42002'},{from:'http://127.0.0.1:41001',to:'http://127.0.0.1:43003'}].entries()){
  const directory=path.join(root,'target-'+index),snapshot=path.join(root,'snapshot-'+index),source=path.join(snapshot,'applications/postiz');fs.mkdirSync(directory);fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'runtime.json'),JSON.stringify({port:42002,token:'a'.repeat(64),assetRelocation:pending}));const calls=[],runtime={directory,specs:new Map([['postiz',{compose:true}]]),prepare:async()=>calls.push('prepare'),run:async()=>calls.push('run')};await assert.rejects(new RuntimeBackup(runtime).restoreIntoEmpty({snapshot,manifest:{applications:['postiz'],volumes:[]}}),/origem|incompatível|inválida/i);assert.deepEqual(calls,[]);assert.deepEqual(fs.readdirSync(directory),[]);
 }
});
