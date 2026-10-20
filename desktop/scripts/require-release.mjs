import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const applications=['presenton','openwhispr','graphite','excalidraw','screenity','affine','baserow','activepieces','plane','formbricks','postiz','paperless'];
export function releaseFailures({version,readiness,unsigned=false}){
 const failures=[];
 if(readiness.release_ready!==true)failures.push('Suíte completa ainda não aprovada para distribuição.');
 if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))failures.push('A versão do pacote ainda é de desenvolvimento.');
 for(const id of applications)if(readiness.applications?.[id]?.acceptance!=='passed')failures.push(id+': aceitação profissional pendente.');
 for(const platform of ['darwin-arm64','darwin-x64','win32-x64'])if(readiness.platforms?.[platform]?.status!=='passed')failures.push(platform+': instalação e uso completos ainda não validados.');
 for(const gate of ['runtime_installer','complete_backup_restore','upgrade_rollback'])if(readiness[gate]!=='passed')failures.push(gate+': pendente.');
 if(unsigned){if(readiness.unsigned_distribution_authorized!==true)failures.push('A distribuição sem assinatura não foi autorizada.');}
 else if(readiness.distribution_signatures!=='passed')failures.push('distribution_signatures: pendente.');
 return failures;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),pkg=JSON.parse(fs.readFileSync(path.join(root,'desktop/package.json'))),readiness=JSON.parse(fs.readFileSync(path.join(root,'suite/release-readiness.json')));
 const unsigned=process.env.PA_ALLOW_UNSIGNED_RELEASE==='1'||process.argv.slice(2).includes('--unsigned'),failures=releaseFailures({version:pkg.version,readiness,unsigned});
 if(failures.length){console.error('Downloads finais não gerados:\n'+failures.map(f=>'• '+f).join('\n'));process.exitCode=1;}
 else console.log(unsigned?'Critérios funcionais aprovados; distribuição sem assinatura explicitamente autorizada.':'Critérios de distribuição profissional aprovados.');
}
