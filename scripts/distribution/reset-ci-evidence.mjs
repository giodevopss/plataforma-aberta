import fs from 'node:fs';import path from 'node:path';
if(process.env.CI!=='true'||!process.env.GITHUB_WORKSPACE||fs.realpathSync(process.env.GITHUB_WORKSPACE)!==fs.realpathSync('.'))throw Error('This operation is restricted to the ephemeral GitHub workspace.');
const directory=path.resolve('desktop/research');if(fs.existsSync(directory)&&fs.lstatSync(directory).isSymbolicLink())throw Error('Unexpected evidence directory link.');
fs.rmSync(directory,{recursive:true,force:true});fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'ci-environment.json'),JSON.stringify({checked_at:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,runnerOS:process.env.RUNNER_OS,runnerArch:process.env.RUNNER_ARCH,node:process.version,platform:process.platform,arch:process.arch,scope:'Fresh evidence from this native CI run; historical workspace reports were removed from the ephemeral checkout'},null,2)+'\n');
