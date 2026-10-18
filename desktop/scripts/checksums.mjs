import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const directory=path.resolve(process.argv[2]||path.join(import.meta.dirname,'../release'));
const files=fs.readdirSync(directory).filter(name=>/^Plataforma-Aberta-[A-Za-z0-9._-]+\.(dmg|zip|exe|blockmap)$/.test(name)&&fs.statSync(path.join(directory,name)).isFile()).sort();if(!files.length)throw Error('Nenhum pacote encontrado para conferir.');
const lines=[];for(const name of files){const hash=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(path.join(directory,name)))hash.update(bytes);lines.push(hash.digest('hex')+'  '+name);}
fs.writeFileSync(path.join(directory,'SHA256SUMS'),lines.join('\n')+'\n');console.log('SHA-256 recorded for',files.length,'installation artifacts.');
