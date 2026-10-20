// Restore only a previously accepted immutable internal installer for a second,
// full-provider test. Never substitute a newer binary for a different source.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {verifiedDownload} from '../../desktop/src/download.mjs';
const repo='giodevopss/plataforma-aberta',target=process.platform+'-'+process.arch,argument=process.argv[2],tag=/^--run=\d+$/.test(argument||'')?'installer-validation-'+argument.slice(6)+'-'+target:argument;
if(process.env.CI!=='true'||process.env.GITHUB_REPOSITORY!==repo||!['darwin-arm64','darwin-x64','win32-x64'].includes(target)||!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')||!new RegExp('^installer-validation-\\d+-'+target+'$').test(tag||''))throw Error('Reviewed disposable native installer acceptance required.');
const metadata=JSON.parse(execFileSync('gh',['release','download',tag,'--repo',repo,'--pattern','installer-'+target+'.json','--output','-'],{encoding:'utf8',maxBuffer:1_000_000}));
if(metadata.version!==1||metadata.target!==target||metadata.finalRelease!==false||metadata.signed!==false||!/^\d+$/.test(metadata.runId)||tag!=='installer-validation-'+metadata.runId+'-'+target||!/^[a-f0-9]{40}$/.test(metadata.suiteCommit)||!/^Plataforma-Aberta-[a-zA-Z0-9._-]+\.(?:exe|dmg)$/.test(metadata.name)||!metadata.name.endsWith(process.platform==='darwin'?'.dmg':'.exe')||!Number.isSafeInteger(metadata.size)||metadata.size<1_000_000||metadata.size>2_000_000_000||!/^[a-f0-9]{64}$/.test(metadata.sha256)||!Array.isArray(metadata.acceptedChecks)||metadata.acceptedChecks.length<5)throw Error('Accepted installer provenance is incomplete.');
if(metadata.suiteCommit!==process.env.GITHUB_SHA){
 const comparison=JSON.parse(execFileSync('gh',['api','repos/'+repo+'/compare/'+metadata.suiteCommit+'...'+process.env.GITHUB_SHA],{encoding:'utf8',maxBuffer:10_000_000}));
 if(!['ahead','identical'].includes(comparison.status)||!Array.isArray(comparison.files)||comparison.files.length>=300)throw Error('Installer source ancestry cannot be verified.');
 const allowed=file=>file.startsWith('.github/')||file.startsWith('suite/tests/')||file.startsWith('desktop/tests/')||['PUBLIC_SOURCE_MANIFEST.json','desktop/README.md','suite/STATUS.md','suite/INSTALLERS.md','suite/release-readiness.json','scripts/distribution/stage-public-repository.mjs','scripts/distribution/restore-tested-installer.mjs','scripts/distribution/installer-validation.mjs','scripts/distribution/remove-owned-installation.mjs'].includes(file);
 if(comparison.files.some(file=>!allowed(file.filename)||file.previous_filename&&!allowed(file.previous_filename)))throw Error('Product source changed since this accepted installer; rebuild before testing it.');
}
const directory=path.resolve('desktop/release');fs.mkdirSync(directory,{recursive:true});if(fs.readdirSync(directory).length)throw Error('Installer destination must be new.');
await verifiedDownload({url:'https://github.com/'+repo+'/releases/download/'+tag+'/'+metadata.name,size:metadata.size,sha256:metadata.sha256,destination:path.join(directory,metadata.name)});
fs.mkdirSync('desktop/research',{recursive:true});fs.writeFileSync('desktop/research/accepted-installer-input.json',JSON.stringify({tag,...metadata})+'\n');console.log('Accepted installer fully verified against its recorded SHA-256 and source ancestry.');
