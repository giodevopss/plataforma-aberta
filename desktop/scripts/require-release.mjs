import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'desktop/package.json')));
const readiness=JSON.parse(fs.readFileSync(path.join(root,'suite/release-readiness.json')));
const failures=[];
if(!readiness.release_ready)failures.push('Suíte completa ainda não aprovada para distribuição.');
if(pkg.version.includes('-'))failures.push('A versão do pacote ainda é de desenvolvimento.');
for(const id of ['presenton','openwhispr','graphite','excalidraw','screenity','affine','baserow','activepieces','plane','formbricks','postiz','paperless']){
 const app=readiness.applications[id];if(app?.acceptance!=='passed')failures.push(id+': aceitação profissional pendente.');
}
for(const platform of ['darwin-arm64','darwin-x64','win32-x64'])if(readiness.platforms[platform]?.status!=='passed')failures.push(platform+': instalação e uso completos ainda não validados.');
for(const gate of ['runtime_installer','complete_backup_restore','upgrade_rollback','distribution_signatures'])if(readiness[gate]!=='passed')failures.push(gate+': pendente.');
if(failures.length){console.error('Downloads finais não gerados:\n'+failures.map(f=>'• '+f).join('\n'));process.exitCode=1;}else console.log('Critérios de distribuição profissional aprovados.');
