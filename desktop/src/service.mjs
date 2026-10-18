import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';
import { Workspace } from './storage.mjs';

const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
export async function startService({resources,directory,token,engines={},port=0}) {
  const projects=JSON.parse(fs.readFileSync(path.join(resources,'projects.json'),'utf8'));
  const workspace=new Workspace(directory,projects.map(p=>p.id));let origin;let ocrBusy=false;let writesPaused=false,activeWrites=0;const drainWaiters=[];
  const server=http.createServer(async(req,res)=>{
    let countedWrite=false;
    const send=(status,body,type='application/json')=>{
      const bytes=Buffer.isBuffer(body)||body instanceof Uint8Array?body:Buffer.from(JSON.stringify(body));
      res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"});res.end(bytes);
    };
    try {
      if(req.headers.host!==new URL(origin).host||req.headers['x-pa-session']!==token){send(403,{error:'Sessão desktop inválida.'});return;}
      if(req.headers.origin&&req.headers.origin!==origin){send(403,{error:'Origem inválida.'});return;}
      if(!['GET','HEAD','OPTIONS'].includes(req.method)){if(writesPaused){send(503,{error:'Gravações pausadas para backup. Aguarde a conclusão.'});return;}activeWrites++;countedWrite=true;}
      const url=new URL(req.url,origin), pathname=decodeURIComponent(url.pathname);
      async function body(max=10_000_000,json=true){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max){const e=Error('Limite de tamanho excedido.');e.status=413;throw e;}chunks.push(chunk);}const bytes=Buffer.concat(chunks);if(!json)return bytes;if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('Envie JSON.');return JSON.parse(bytes.toString());}
      if(req.method==='GET'){
        if(pathname==='/api/projects')return send(200,{projects});
        if(pathname==='/api/health')return send(200,{status:'ready',version:'0.2.0-alpha.1',engines:{pdf:true,ocr:fs.existsSync(path.join(resources,'ocr/por.traineddata.gz')),speech:Boolean(engines.transcribe)}});
        if(pathname.startsWith('/api/state/'))return send(200,workspace.load(pathname.split('/').at(-1)));
        if(pathname.startsWith('/api/history/'))return send(200,{items:workspace.history(pathname.split('/').at(-1))});
        if(pathname==='/api/speech/status')return send(200,{available:Boolean(engines.transcribe),engine:engines.transcribe?'Whisper local':null});
        if(pathname==='/api/ai/models'){const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Ollama indisponível.');const d=await r.json();return send(200,{models:d.models.filter(m=>!m.name.includes('embed')).map(m=>m.name)});}
        if(pathname.startsWith('/api/files/'))return send(200,fs.readFileSync(workspace.file(pathname.split('/').at(-1)).path),'application/octet-stream');
        let filename;
        if(pathname==='/')filename=path.join(resources,'shell/index.html');
        else if(pathname.startsWith('/sources/')){const id=pathname.split('/').at(-1);workspace.check(id);filename=path.join(resources,'inspections',id+'.md');}
        else if(pathname.startsWith('/apps/')){const [, , id,...parts]=pathname.split('/');workspace.check(id);filename=path.join(resources,'apps',id,parts.join('/')||'index.html');}
        else if(pathname.startsWith('/shared/')||pathname.startsWith('/_shared/'))filename=path.join(resources,'shared',pathname.split('/').slice(2).join('/'));
        else if(pathname.startsWith('/shell/')||pathname.startsWith('/editor/')||pathname.startsWith('/graphite/'))filename=path.join(resources,pathname,pathname.endsWith('/')?'index.html':'');
        else return send(404,{error:'Endereço não encontrado.'});
        filename=path.resolve(filename);const relative=path.relative(resources,filename);
        if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.statSync(filename,{throwIfNoEntry:false})?.isFile())return send(404,{error:'Arquivo não encontrado.'});
        return send(200,fs.readFileSync(filename),types[path.extname(filename)]||'text/plain; charset=utf-8');
      }
      if(req.method==='PUT'&&pathname.startsWith('/api/state/')){const d=await body();return send(200,workspace.save(pathname.split('/').at(-1),d.revision,d.data));}
      if(req.method!=='POST')return send(405,{error:'Método não permitido.'});
      if(pathname==='/api/files'){const bytes=await body(50_000_000,false);if(!bytes.length)throw Error('Arquivo vazio.');return send(200,workspace.upload(url.searchParams.get('project'),url.searchParams.get('name'),req.headers['content-type']||'application/octet-stream',bytes));}
      const d=await body();
      if(pathname==='/api/files/zip')return send(200,workspace.archive(d.ids),'application/zip');
      if(pathname==='/api/files/extract'){
        const f=workspace.file(d.id);let text,engine;
        if(f.mime.startsWith('text/')){text=fs.readFileSync(f.path,'utf8').slice(0,3_000_000);engine='Texto original';}
        else if(f.mime==='application/pdf'&&!d.ocr){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(fs.readFileSync(f.path)),useSystemFonts:true,isEvalSupported:false});const pdf=await task.promise;try{if(pdf.numPages>100)throw Error('Limite de 100 páginas.');const pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();pages.push(content.items.map(x=>x.str||'').join(' '));}text=pages.join('\n\n').slice(0,3_000_000);engine='PDF.js local';}finally{await task.destroy();}}
        else if(f.mime.startsWith('image/')){
          if(ocrBusy)throw Error('Já existe um OCR em andamento.');ocrBusy=true;let worker;
          try{worker=await createWorker('por+eng',1,{langPath:path.join(resources,'ocr'),cacheMethod:'none',logger:()=>{}});const result=await worker.recognize(f.path);text=result.data.text.slice(0,3_000_000);engine='Tesseract local PT/EN';}finally{await worker?.terminate();ocrBusy=false;}
        }else throw Error('Extração de texto disponível para texto, PDF e imagens. OCR de PDF digitalizado ainda requer conversão em imagens.');
        workspace.db.prepare('UPDATE files SET text=? WHERE id=?').run(text,f.id);return send(200,{text,engine,needsOCR:text.trim().length<20});
      }
      if(pathname==='/api/ai/generate'){
        if(typeof d.prompt!=='string'||d.prompt.length>16000||!d.prompt.length||!/^[-\w.:]{1,100}$/.test(d.model||'llama3.1:8b'))throw Error('Solicitação de IA inválida.');
        const r=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:d.model||'llama3.1:8b',prompt:d.prompt,stream:false,format:'json',options:{num_predict:2200,temperature:.3}}),signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Geração local indisponível.');const result=await r.json();return send(200,{data:JSON.parse(result.response),model:d.model});
      }
      if(pathname==='/api/speech/transcribe'&&engines.transcribe)return send(200,await engines.transcribe(workspace.file(d.id),d.language));
      return send(404,{error:'Recurso indisponível nesta versão desktop.'});
    }catch(e){if(!res.headersSent)send(e.status||400,{error:e.message.slice(0,250)});else res.end();}finally{if(countedWrite&&--activeWrites===0)for(const resolve of drainWaiters.splice(0))resolve();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;resolve();});});
  return {origin,workspace,pauseWrites:async()=>{writesPaused=true;if(activeWrites)await new Promise(resolve=>drainWaiters.push(resolve));},resumeWrites:()=>{writesPaused=false;},close:()=>new Promise(resolve=>server.close(()=>{workspace.close();resolve();}))};
}
