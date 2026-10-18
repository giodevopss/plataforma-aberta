import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const id=process.argv[2];if(!/^[a-z]+$/.test(id||''))throw Error('Informe o ID de um projeto.');
const dir=path.resolve('subprojetos',id),pin=JSON.parse(fs.readFileSync(path.join(dir,'UPSTREAM.json'))),out=path.join(dir,'upstream');
if(fs.existsSync(out))throw Error('A fonte já está presente; não será substituída.');
if(!/^[\w.-]+\/[\w.-]+$/.test(pin.repo)||!/^[a-f0-9]{40}$/.test(pin.commit))throw Error('Pin inválido.');
fs.mkdirSync(out);
try{execFileSync('git',['init','--quiet',out]);execFileSync('git',['-C',out,'config','core.autocrlf','false']);execFileSync('git',['-C',out,'remote','add','origin','https://github.com/'+pin.repo+'.git']);execFileSync('git',['-C',out,'fetch','--depth=1','origin',pin.commit],{stdio:'inherit'});execFileSync('git',['-C',out,'checkout','--quiet','--detach',pin.commit]);if(execFileSync('git',['-C',out,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pin.commit)throw Error('Commit incorreto.');console.log('Fonte exata recuperada:',id,pin.commit);}catch(e){fs.rmSync(out,{recursive:true,force:true});throw e;}
