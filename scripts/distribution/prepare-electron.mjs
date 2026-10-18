import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),directory=path.resolve(import.meta.dirname,'../../desktop');
// Retry only upstream package installation, never failing application tests.
for(let attempt=0;attempt<3;attempt++){
 try{await exec(process.execPath,['node_modules/electron/install.js','--no'],{cwd:directory,maxBuffer:2_000_000,timeout:300000});const {stdout}=await exec(process.execPath,['-e','process.stdout.write(require("electron"))'],{cwd:directory,maxBuffer:2_000_000,timeout:300000});if(!fs.statSync(stdout.trim()).isFile())throw Error('Electron executable missing');console.log('Pinned Electron executable installed and ready.');break;}catch(error){if(attempt===2)throw error;console.warn('Transient Electron installation failure; retrying official checksum-verified installer.');}
}
