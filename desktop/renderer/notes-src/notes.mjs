import {DocCollection,Schema,Text} from '@blocksuite/store';
import {AffineSchemas} from '@blocksuite/blocks/schemas';
import {PageEditor,EdgelessEditor} from '@blocksuite/presets';
import {effects as blockEffects} from '@blocksuite/blocks/effects';
import {effects as editorEffects} from '@blocksuite/presets/effects';
import * as Y from 'yjs';
import '@toeverything/theme/style.css';
import './style.css';
blockEffects();editorEffects();
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const to64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
const from64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
let revision=0,queue=Promise.resolve(),timer,blocked=false,initializing=true,mode='page',active,editor;
const pending=new Set(),docs=new Map();let assets={},legacyMetadata;
function notice(text){$('#notes-notice').hidden=false;$('#notes-notice').textContent=text;}
async function json(url,options){const r=await fetch(url,options);const data=await r.json();if(!r.ok)throw Error(data.error||'Falha no espaço de documentos.');return data;}
const loaded=await json('/api/state/affine');revision=loaded.revision;
const saved=loaded.data?.format==='pa-blocksuite-workspace'?loaded.data:null;
if(saved){assets=saved.assets||{};mode=saved.mode||'page';legacyMetadata=saved.legacyMetadata;}
const blobSource={name:'plataforma-local',readonly:false,
 async get(key){const file=assets[key];if(!file)return null;const r=await fetch('/api/files/'+file.id);if(!r.ok)return null;return new Blob([await r.arrayBuffer()],{type:file.mime});},
 async set(key,value){const promise=(async()=>{const file=await json('/api/files?project=affine&name='+encodeURIComponent(value.name||'anexo'),{method:'POST',headers:{'Content-Type':value.type||'application/octet-stream'},body:value});assets[key]={id:file.id,mime:file.mime,name:file.name};changed();return key;})();pending.add(promise);try{return await promise;}finally{pending.delete(promise);}},
 async delete(){/* Keep originals until safe reference collection exists. */},async list(){return Object.keys(assets);}
};
const collection=new DocCollection({id:'plataforma-notes',schema:new Schema().register(AffineSchemas),blobSources:{main:blobSource}});
if(saved?.collection)Y.applyUpdate(collection.doc,from64(saved.collection));
collection.meta.initialize();
function subscribe(doc){docs.set(doc.id,doc);doc.spaceDoc.on('update',changed);}
function create(title='Documento sem título',content=''){
 const doc=collection.createDoc();doc.load();const root=doc.addBlock('affine:page',{title:new Text(title)});doc.addBlock('affine:surface',{},root);const note=doc.addBlock('affine:note',{},root);
 for(const line of content.split('\n'))doc.addBlock('affine:paragraph',{text:new Text(line)},note);
 subscribe(doc);return doc;
}
if(saved){for(const record of saved.pages){const doc=collection.getDoc(record.id)||collection.createDoc({id:record.id});Y.applyUpdate(doc.spaceDoc,from64(record.update));doc.load();subscribe(doc);}active=docs.has(saved.active)?saved.active:docs.keys().next().value;}
else if(Array.isArray(loaded.data?.docs)){
 legacyMetadata=loaded.data;for(const old of loaded.data.docs){const doc=create(old.title,old.columns.join('\n\n'));active||=doc.id;}
}else active=create('Meu espaço de trabalho','Escreva uma ideia. Use / para inserir blocos, listas, imagens e tabelas.').id;
if(!docs.size)active=create().id;
collection.doc.on('update',changed);
function serialize(){return {format:'pa-blocksuite-workspace',version:1,active,mode,collection:to64(Y.encodeStateAsUpdate(collection.doc)),pages:[...docs.values()].map(doc=>({id:doc.id,update:to64(Y.encodeStateAsUpdate(doc.spaceDoc))})),assets,...(legacyMetadata?{legacyMetadata}:{})};}
async function save(){clearTimeout(timer);await Promise.all([...pending]);if(blocked)return;const snapshot=serialize();
 try{localStorage.setItem('pa-blocksuite-recovery',JSON.stringify(snapshot));}catch{notice('A cópia de recuperação no navegador não está disponível. Faça um backup completo.');}
 $('#notes-status').textContent='Salvando…';queue=queue.then(async()=>{if(blocked)return;try{const result=await json('/api/state/affine',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,data:snapshot})});revision=result.revision;$('#notes-status').textContent='Salvo no dispositivo';}catch(e){blocked=true;$('#notes-status').textContent='Não salvo';notice(e.message+' Preserve uma cópia antes de fechar.');}});return queue;
}
function changed(){if(initializing)return;$('#notes-status').textContent='Salvando…';clearTimeout(timer);timer=setTimeout(save,400);renderList();}
function renderList(){const query=$('#search-notes').value.toLocaleLowerCase('pt-BR');$('#note-list').innerHTML=[...docs.values()].filter(doc=>(doc.root?.title?.toString()||'Documento sem título').toLocaleLowerCase('pt-BR').includes(query)).map(doc=>`<button data-note="${esc(doc.id)}" class="${doc.id===active?'active':''}">▤ <span>${esc(doc.root?.title?.toString()||'Documento sem título')}</span></button>`).join('');$('#delete-note').disabled=docs.size===1;}
function mount(){const doc=docs.get(active);editor=mode==='canvas'?new EdgelessEditor():new PageEditor();editor.doc=doc;$('#document-editor').replaceChildren(editor);$('#mode').textContent=mode==='canvas'?'Abrir documento':'Abrir canvas';renderList();}
$('#note-list').onclick=async e=>{const target=e.target.closest('[data-note]');if(!target)return;await save();active=target.dataset.note;mount();changed();};
$('#new-note').onclick=async()=>{await save();active=create().id;mount();changed();};
$('#search-notes').oninput=renderList;
$('#mode').onclick=async()=>{await save();mode=mode==='canvas'?'page':'canvas';mount();changed();};
$('#undo').onclick=()=>docs.get(active).undo();$('#redo').onclick=()=>docs.get(active).redo();
$('#rename').onclick=()=>{const doc=docs.get(active);const title=window.prompt('Nome do documento',doc.root.title.toString());if(title?.trim())doc.updateBlock(doc.root,{title:new Text(title.trim().slice(0,160))});};
$('#delete-note').onclick=async()=>{if(docs.size===1||!window.confirm('Excluir este documento? Faça um backup se precisar recuperá-lo.'))return;await save();collection.removeDoc(active);docs.delete(active);active=docs.keys().next().value;mount();changed();};
$('#import-text').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2_000_000)throw Error('Limite de 2 MB para importação de texto.');active=create(file.name.replace(/\.(md|txt)$/i,''),await file.text()).id;mount();changed();}catch(e){notice(e.message);}};
$('#export').onclick=()=>{const doc=docs.get(active);const text=[doc.root.title.toString(),...Object.values(doc.blocks.value).map(b=>b.model.text?.toString()).filter(Boolean)].join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=(doc.root.title.toString()||'documento')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
window.suiteDocument={flush:save,status:()=>!blocked};
initializing=false;mount();await save();
