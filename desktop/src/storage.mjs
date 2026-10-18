import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export function safeName(value) {
  return String(value || 'arquivo').replace(/[\x00-\x1f\x7f]/g, '').replaceAll('\\', '/').split('/').at(-1).slice(0, 180) || 'arquivo';
}
export class Workspace {
  constructor(directory, ids) {
    this.directory = directory; this.ids = new Set(ids);
    fs.mkdirSync(path.join(directory, 'blobs'), { recursive: true });
    this.open();
  }
  open() {
    this.db = new DatabaseSync(path.join(this.directory, 'workspace.sqlite3'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) { this.db.close(); throw Error('Este espaço exige uma versão mais recente da suíte.'); }
    this.db.exec(`CREATE TABLE IF NOT EXISTS states(project TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(project TEXT,revision INTEGER,data TEXT,updated_at TEXT,PRIMARY KEY(project,revision));
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,name TEXT,mime TEXT,size INTEGER,project TEXT,text TEXT DEFAULT ''); PRAGMA user_version=1;`);
  }
  check(id) { if (!this.ids.has(id)) throw Error('Ferramenta desconhecida.'); }
  load(id) {
    this.check(id); const r = this.db.prepare('SELECT * FROM states WHERE project=?').get(id);
    return r ? { revision:r.revision, data:JSON.parse(r.data), updated_at:r.updated_at } : { revision:0, data:null };
  }
  save(id, revision, data) {
    this.check(id);
    if (!Number.isSafeInteger(revision) || revision < 0 || !data || typeof data !== 'object' || Array.isArray(data)) throw Error('Estado inválido.');
    const payload = JSON.stringify(data), now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare('SELECT revision FROM states WHERE project=?').get(id)?.revision || 0;
      if (revision !== current) { const e = Error('Outra janela salvou uma versão mais recente. Exporte suas alterações antes de recarregar.'); e.status = 409; throw e; }
      const next = current + 1;
      this.db.prepare('INSERT OR REPLACE INTO states VALUES(?,?,?,?)').run(id,next,payload,now);
      this.db.prepare('INSERT INTO history VALUES(?,?,?,?)').run(id,next,payload,now);
      this.db.prepare('DELETE FROM history WHERE project=? AND revision<=?').run(id,next-50);
      this.db.exec('COMMIT'); return {revision:next,updated_at:now};
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  history(id) { this.check(id); return this.db.prepare('SELECT revision,updated_at,data FROM history WHERE project=? ORDER BY revision DESC').all(id); }
  upload(project, name, mime, bytes) {
    this.check(project); const id=sha(bytes), destination=path.join(this.directory,'blobs',id);
    if (!fs.existsSync(destination)) { const temp=destination+'.'+crypto.randomUUID()+'.tmp'; fs.writeFileSync(temp,bytes); fs.renameSync(temp,destination); }
    this.db.prepare('INSERT OR IGNORE INTO files(id,name,mime,size,project) VALUES(?,?,?,?,?)').run(id,safeName(name),mime,bytes.length,project);
    return {id,sha256:id,name:safeName(name),mime,size:bytes.length};
  }
  file(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error('Arquivo inválido.');
    const r=this.db.prepare('SELECT * FROM files WHERE id=?').get(id);
    if (!r) { const e=Error('Arquivo não encontrado.');e.status=404;throw e; }
    return {...r,path:path.join(this.directory,'blobs',id)};
  }
  archive(ids) {
    if (!Array.isArray(ids) || ids.length>100) throw Error('Até 100 arquivos por exportação.');
    let total=0;const entries={};
    for (const id of new Set(ids)) { const f=this.file(id);total+=f.size;if(total>150_000_000)throw Error('Limite de 150 MB.');entries[id.slice(0,8)+'-'+safeName(f.name)]=fs.readFileSync(f.path); }
    return zipSync(entries);
  }
  async snapshotTo(destination) {
    if (fs.existsSync(destination)) throw Error('Use uma pasta nova para o snapshot do espaço.');
    await fsp.mkdir(path.join(destination,'blobs'),{recursive:true,mode:0o700});
    const snapshot=path.join(destination,'workspace.sqlite3');let database;
    try {
      this.db.exec(`VACUUM INTO '${snapshot.replaceAll("'","''")}'`);
      database=new DatabaseSync(snapshot,{readOnly:true});
      for(const record of database.prepare('SELECT id,size FROM files').all()) {
        if(!/^[a-f0-9]{64}$/.test(record.id)||!Number.isSafeInteger(record.size)||record.size<0)throw Error('Original inválido no espaço.');
        const source=path.join(this.directory,'blobs',record.id),stat=await fsp.lstat(source);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==record.size)throw Error('Original ausente ou alterado.');
        const target=path.join(destination,'blobs',record.id);await fsp.copyFile(source,target);
        const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(target))hash.update(chunk);
        if(hash.digest('hex')!==record.id)throw Error('Checksum do original inválido.');
      }
      return {version:1,files:database.prepare('SELECT count(*) AS total FROM files').get().total};
    }catch(error){database?.close();database=null;await fsp.rm(destination,{recursive:true,force:true});throw error;}finally{database?.close();}
  }
  static async restoreSnapshotIntoEmpty({source,destination,ids}) {
    if(fs.existsSync(destination))throw Error('A restauração exige uma pasta de espaço nova.');
    const allowed=new Set(ids);if(!allowed.size)throw Error('Aplicativos compatíveis ausentes.');
    const databaseFile=path.join(source,'workspace.sqlite3'),stat=await fsp.lstat(databaseFile);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Banco do snapshot inválido.');
    const database=new DatabaseSync(databaseFile,{readOnly:true});let records;
    try{
      database.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');
      if(database.prepare('PRAGMA user_version').get().user_version!==1||database.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Banco do snapshot incompatível ou corrompido.');
      const objects=database.prepare("SELECT type,name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all();if(objects.length!==3||objects.some(item=>item.type!=='table'||!['states','history','files'].includes(item.name)))throw Error('Estrutura de banco inesperada no snapshot.');
      for(const table of ['states','history'])for(const row of database.prepare('SELECT project,revision,data,updated_at FROM '+table).all()){const value=JSON.parse(row.data);if(!allowed.has(row.project)||!Number.isSafeInteger(row.revision)||row.revision<1||!value||typeof value!=='object'||Array.isArray(value)||typeof row.updated_at!=='string')throw Error('Documento inválido no snapshot.');}
      records=database.prepare('SELECT id,size,project FROM files').all();for(const row of records)if(!/^[a-f0-9]{64}$/.test(row.id)||!Number.isSafeInteger(row.size)||row.size<0||!allowed.has(row.project))throw Error('Original inválido no snapshot.');
    }finally{database.close();}
    // Validate every immutable original before materializing or publishing data.
    for(const row of records){const file=path.join(source,'blobs',row.id),stat=await fsp.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==row.size)throw Error('Original ausente ou alterado no snapshot.');const hash=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);if(hash.digest('hex')!==row.id)throw Error('Checksum do original inválido no snapshot.');}
    await fsp.mkdir(path.dirname(destination),{recursive:true,mode:0o700});const temporary=await fsp.mkdtemp(destination+'.restore-');
    try{await fsp.mkdir(path.join(temporary,'blobs'),{mode:0o700});await fsp.copyFile(databaseFile,path.join(temporary,'workspace.sqlite3'));for(const row of records)await fsp.copyFile(path.join(source,'blobs',row.id),path.join(temporary,'blobs',row.id));if(fs.existsSync(destination))throw Error('O destino mudou durante a restauração.');await fsp.rename(temporary,destination);return {version:1,files:records.length};}finally{await fsp.rm(temporary,{recursive:true,force:true});}
  }
  backup() {
    const snapshot=path.join(this.directory,'.snapshot-'+crypto.randomUUID()+'.sqlite3');
    const entries={};
    try {
      this.db.exec(`VACUUM INTO '${snapshot.replaceAll("'","''")}'`);
      entries['workspace.sqlite3']=fs.readFileSync(snapshot);
      let total=entries['workspace.sqlite3'].length;
      for (const f of this.db.prepare('SELECT id FROM files').all()) {
        const bytes=fs.readFileSync(this.file(f.id).path);total+=bytes.length;
        if(total>500_000_000)throw Error('Backup excede 500 MB. Use a cópia da pasta de dados com a suíte fechada.');
        if(sha(bytes)!==f.id)throw Error('Um original não passou na verificação de integridade.');
        entries['blobs/'+f.id]=bytes;
      }
      entries['manifest.json']=strToU8(JSON.stringify({format:'pa-suite-backup',version:1,created_at:new Date().toISOString(),files:Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,{sha256:sha(bytes),size:bytes.length}]))}));
      return zipSync(entries,{level:6});
    } finally { fs.rmSync(snapshot,{force:true}); }
  }
  restore(bytes) {
    if(bytes.length>500_000_000)throw Error('Backup excede 500 MB.');
    let total=0;
    const entries=unzipSync(bytes,{filter:f=>{
      total+=f.originalSize;
      if(total>500_000_000 || f.originalSize>500_000_000)throw Error('Backup descompactado excede 500 MB.');
      if(!/^(manifest\.json|workspace\.sqlite3|blobs\/[a-f0-9]{64})$/.test(f.name))throw Error('Caminho inválido no backup.');
      return true;
    }});
    const manifest=JSON.parse(strFromU8(entries['manifest.json']||new Uint8Array()));
    if(manifest.format!=='pa-suite-backup'||manifest.version!==1||!manifest.files||!entries['workspace.sqlite3'])throw Error('Formato de backup incompatível.');
    if(Object.keys(entries).length!==Object.keys(manifest.files).length+1)throw Error('Arquivos inesperados no backup.');
    for(const [name,record] of Object.entries(manifest.files)) {
      if(!entries[name]||sha(entries[name])!==record.sha256||entries[name].length!==record.size)throw Error('Checksum do backup inválido.');
      if(name.startsWith('blobs/') && name.slice(6)!==record.sha256)throw Error('Identidade do original inválida.');
    }
    const stage=this.directory+'.restore-'+crypto.randomUUID(), previous=this.directory+'.previous-'+crypto.randomUUID();
    fs.mkdirSync(path.join(stage,'blobs'),{recursive:true});let test;
    try {
      for(const [name,content] of Object.entries(entries))if(name!=='manifest.json')fs.writeFileSync(path.join(stage,name),content);
      test=new DatabaseSync(path.join(stage,'workspace.sqlite3'));
      if(test.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||test.prepare('PRAGMA user_version').get().user_version!==1)throw Error('Banco de dados incompatível ou corrompido.');
      for(const r of test.prepare('SELECT project,revision,data,updated_at FROM states').all()){this.check(r.project);if(!Number.isSafeInteger(r.revision)||r.revision<1||!JSON.parse(r.data))throw Error('Estado inválido no backup.');}
      test.prepare('SELECT project,revision,data,updated_at FROM history').all();
      for(const f of test.prepare('SELECT id,name,mime,size,project,text FROM files').all())if(!entries['blobs/'+f.id]||entries['blobs/'+f.id].length!==f.size)throw Error('Original ausente no backup.');
      test.close();test=null;this.db.close();
      try{fs.renameSync(this.directory,previous);}catch(e){this.open();throw e;}
      try{fs.renameSync(stage,this.directory);this.open();}catch(e){fs.rmSync(this.directory,{recursive:true,force:true});fs.renameSync(previous,this.directory);this.open();throw e;}
      // The previous workspace is deliberately retained as a recovery copy.
      return {restored:true,recovery:previous};
    } finally {test?.close();fs.rmSync(stage,{recursive:true,force:true});}
  }
  close(){this.db.close();}
}
