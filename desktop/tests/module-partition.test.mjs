import test from 'node:test';import assert from 'node:assert/strict';import {modulePartition} from '../src/module-partition.mjs';
test('Independent restored app browsers cannot read active profile sessions or browser-local notes',()=>{
 const previous=modulePartition('legacy','affine'),restored=modulePartition('a'.repeat(32),'affine'),another=modulePartition('b'.repeat(32),'affine');assert.equal(previous,'persist:complete-affine');assert.notEqual(previous,restored);assert.notEqual(restored,another);assert.notEqual(restored,modulePartition('a'.repeat(32),'baserow'));assert.equal(restored,modulePartition('a'.repeat(32),'affine'));
});
test('Browser partition identities reject paths, arbitrary profiles and unknown name syntax',()=>{
 for(const [profile,id]of [['../other','affine'],['legacy','../affine'],['legacy',''],['persist:foreign','affine']])assert.throws(()=>modulePartition(profile,id),/inválido/);
});
