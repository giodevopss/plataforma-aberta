import fs from 'node:fs/promises';import path from 'node:path';
// Materialize internal aliases into ordinary files for portable archives. Never
// follow a link outside this app, or a directory cycle, even in a private backup.
export async function copyPortableTree(source,destination,{exclude=()=>false}={}){
 const boundary=await fs.realpath(source);
 async function copy(from,to,ancestors){
  if(exclude(from))return;
  const real=await fs.realpath(from);
  if(real!==boundary&&!real.startsWith(boundary+path.sep))throw Error('Link de armazenamento aponta para fora do aplicativo: '+path.relative(source,from));
  const stat=await fs.stat(real);
  if(stat.isDirectory()){
   if(ancestors.has(real))throw Error('Ciclo de links no armazenamento: '+path.relative(source,from));
   const next=new Set(ancestors);next.add(real);await fs.mkdir(to,{recursive:true,mode:stat.mode&0o777});
   for(const name of await fs.readdir(real))await copy(path.join(real,name),path.join(to,name),next);
  }else if(stat.isFile()){await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(real,to);await fs.chmod(to,stat.mode&0o777);}
  else throw Error('Arquivo especial não aceito no armazenamento.');
 }
 await copy(source,destination,new Set());
}
