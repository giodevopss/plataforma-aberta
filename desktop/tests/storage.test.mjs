import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {Workspace,safeName,sha} from '../src/storage.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pa-desktop-storage-'));const w=new Workspace(path.join(dir,'workspace'),['plane','paperless']);t.after(()=>{w.close();fs.rmSync(dir,{recursive:true,force:true});});return w;}
test('revisions reject stale writes and retain prior content',t=>{const w=fixture(t);w.save('plane',0,{title:'Original'});assert.throws(()=>w.save('plane',0,{title:'Overwrite'}),/Outra janela/);assert.equal(w.load('plane').data.title,'Original');assert.equal(w.history('plane').length,1);});
test('history retains only last 50 revisions',t=>{const w=fixture(t);for(let i=0;i<55;i++)w.save('plane',i,{i});assert.equal(w.history('plane').length,50);assert.equal(w.history('plane').at(-1).revision,6);});
test('backup restores original bytes, state and history with previous workspace recovery',t=>{const w=fixture(t);const bytes=Buffer.from('Conteúdo original\n');const file=w.upload('paperless','a.txt','text/plain',bytes);w.save('paperless',0,{files:[file]});const backup=w.backup();w.save('paperless',1,{files:[]});const r=w.restore(backup);assert.equal(w.load('paperless').revision,1);assert.deepEqual(fs.readFileSync(w.file(file.id).path),bytes);assert.equal(w.history('paperless').length,1);assert.ok(fs.existsSync(path.join(r.recovery,'workspace.sqlite3')));});
test('tampered backup is rejected before replacing user data',t=>{const w=fixture(t);w.save('plane',0,{title:'Preserve'});const entries=unzipSync(w.backup());entries['workspace.sqlite3'][40]^=1;assert.throws(()=>w.restore(zipSync(entries)),/Checksum/);assert.equal(w.load('plane').data.title,'Preserve');});
test('backup traversal paths are rejected',t=>{const w=fixture(t);assert.throws(()=>w.restore(zipSync({'../outside':strToU8('no')})),/Caminho/);assert.equal(w.load('plane').revision,0);});
test('unexpected entries cannot bypass the manifest',t=>{const w=fixture(t);const entries=unzipSync(w.backup());entries['blobs/'+'a'.repeat(64)]=strToU8('unexpected');assert.throws(()=>w.restore(zipSync(entries)),/inesperados/);});
test('file names are portable and uploads retain SHA identity',t=>{const w=fixture(t);assert.equal(safeName('C:\\Users\\name\\report.txt'),'report.txt');assert.equal(safeName('../../report.txt'),'report.txt');const bytes=Buffer.from('Original');const f=w.upload('paperless','report.txt','text/plain',bytes);assert.equal(f.id,sha(bytes));assert.deepEqual(unzipSync(w.archive([f.id]))[f.id.slice(0,8)+'-report.txt'],new Uint8Array(bytes));});
test('future database schemas fail without changing the database',t=>{const w=fixture(t);w.db.exec('PRAGMA user_version=99');w.close();assert.throws(()=>w.open(),/mais recente/);w.db={close(){}};});
test('invalid state identity and revision fail before writes',t=>{const w=fixture(t);assert.throws(()=>w.save('unknown',0,{}));assert.throws(()=>w.save('plane',-1,{}));assert.throws(()=>w.save('plane',0,[]));assert.equal(w.load('plane').revision,0);});
