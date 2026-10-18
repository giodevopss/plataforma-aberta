// Exercise original patched helpers with all personal-home access made fatal.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const directory=path.resolve(process.argv[2]||'suite/runtime/openwhispr-build'),manifest=JSON.parse(fs.readFileSync('suite/patches/openwhispr/PROVENANCE.json')),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pa-whispr-isolation-')),require=createRequire(import.meta.url),cache=path.join(temporary,'cache'),bridge=path.join(temporary,'bridge.json');const env={OPENWHISPR_SUITE_MANAGED:'1',OPENWHISPR_CACHE_ROOT:cache,OPENWHISPR_BRIDGE_FILE:bridge};
const denied=()=>{throw Error('Personal home/cache access is forbidden in managed mode');};
const filesystem=new Proxy(fs,{get(target,key){if(key==='existsSync')return ()=>false;return target[key];}});
function load(relative,{extra='',mocks={}}={}){
 const module={exports:{}},source=fs.readFileSync(path.join(directory,relative),'utf8');
 const localRequire=id=>{if(id in mocks)return mocks[id];if(id==='fs')return filesystem;if(id==='os')return {...os,homedir:denied};if(id==='electron')return {app:{getPath:denied},BrowserWindow:{getAllWindows:()=>[]},autoUpdater:{on:denied}};if(id==='./modelDirUtils')return models;if(id.startsWith('.'))return new Proxy({},{get:()=>()=>{}});return require(id);};
 vm.runInNewContext('(function(require,module,exports,__dirname,process){'+source+'\n'+extra+'\n})',{console,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,URL}) (localRequire,module,module.exports,path.dirname(path.join(directory,relative)),{env,platform:process.platform,arch:process.arch});return module.exports;
}
let models;
try{
 for(const file of manifest.files){const bytes=fs.readFileSync(path.join(directory,file.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);}
 models=load('src/helpers/modelDirUtils.js');assert.equal(models.getCacheRoot(),cache);assert.equal(models.getModelsDirForService('whisper'),path.join(cache,'whisper-models'));
 const embeddings=load('src/helpers/localEmbeddings.js');assert.equal(embeddings.modelDir,path.join(cache,'embedding-models','all-MiniLM-L6-v2'));
 const qdrant=load('src/helpers/qdrantManager.js',{extra:'module.exports.managedStorageDirectory=STORAGE_DIR;'});assert.equal(qdrant.managedStorageDirectory,path.join(cache,'qdrant-data'));
 const cli=load('src/helpers/cliBridge.js');assert.equal(cli.getBridgeFilePath(),bridge);delete env.OPENWHISPR_BRIDGE_FILE;assert.throws(()=>cli.getBridgeFilePath(),/absolute/);env.OPENWHISPR_BRIDGE_FILE=bridge;
 const updater=load('src/updater.js',{mocks:{'electron-updater':{autoUpdater:new Proxy({},{get:()=>denied})}}});const manager=new updater();const result=await manager.checkForUpdates();assert.equal(result.updateAvailable,false);assert.match(result.message,/package manager/);
 delete env.OPENWHISPR_CACHE_ROOT;assert.throws(()=>models.getCacheRoot(),/absolute/);
 console.log('Original native helper isolation accepted: speech/semantic caches, CLI bridge, fail-closed missing roots and suite-managed updates; personal home was inaccessible.');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
