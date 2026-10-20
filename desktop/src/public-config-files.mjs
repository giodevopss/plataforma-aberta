import fs from 'node:fs';import path from 'node:path';
// Electron exposes ASAR files through read/readdir, while recursive fs.cp fails
// for virtual archive directories. These are public pinned code resources only;
// the caller supplies an owned destination outside the immutable source tree.
export function copyPublicConfiguration(source,destination){
 const input=path.resolve(source),output=path.resolve(destination);if(output===input||output.startsWith(input+path.sep))throw Error('O destino das configurações deve ficar fora da fonte original.');let files=0;
 function copy(from,to){const stat=fs.lstatSync(from),existing=fs.lstatSync(to,{throwIfNoEntry:false});if(stat.isSymbolicLink()||existing?.isSymbolicLink())throw Error('As configurações públicas não podem seguir links.');
  if(stat.isDirectory()){if(existing&&!existing.isDirectory())throw Error('Destino das configurações incompatível.');fs.mkdirSync(to,{recursive:true,mode:0o755});fs.chmodSync(to,0o755);for(const name of fs.readdirSync(from).sort())copy(path.join(from,name),path.join(to,name));}
  else if(stat.isFile()){if(existing&&!existing.isFile())throw Error('Destino das configurações incompatível.');const bytes=fs.readFileSync(from);fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o755});if(!existing||!fs.readFileSync(to).equals(bytes))fs.writeFileSync(to,bytes,{mode:0o644});fs.chmodSync(to,stat.mode&0o111?0o755:0o644);files++;}
  else throw Error('Recurso de configuração pública inválido.');
 }
 copy(input,output);return {files};
}
