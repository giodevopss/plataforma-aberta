import React,{useRef,useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Excalidraw,MainMenu,serializeAsJSON,exportToBlob,convertToExcalidrawElements,CaptureUpdateAction} from '@excalidraw/excalidraw';
import {clearAppStateForLocalStorage} from '@excalidraw/excalidraw/appState';
import './style.css';

const key='pa-desktop-excalidraw-recovery';
const response=await fetch('/api/state/excalidraw');if(!response.ok)throw Error('Não foi possível abrir o quadro.');
const loaded=await response.json();
const blank=()=>({id:crypto.randomUUID(),name:'Quadro sem título',elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}});
const initial=loaded.data?.format==='pa-excalidraw-workspace'?loaded.data:{format:'pa-excalidraw-workspace',version:1,active:null,scenes:[blank()]};
initial.active ||= initial.scenes[0].id;
function Editor(){
 const documentRef=useRef(structuredClone(initial)),revision=useRef(loaded.revision),queue=useRef(Promise.resolve()),timer=useRef(),fingerprints=useRef({}),blocked=useRef(false),api=useRef(),root=useRef();
 const [active,setActive]=useState(initial.active),[tabs,setTabs]=useState(initial.scenes.map(({id,name})=>({id,name}))),[status,setStatus]=useState('Salvo no dispositivo'),[notice,setNotice]=useState(''),[ready,setReady]=useState(false);
 const scene=()=>documentRef.current.scenes.find(s=>s.id===documentRef.current.active);
 function save(){
   clearTimeout(timer.current);const snapshot=structuredClone(documentRef.current);
   try{localStorage.setItem(key,JSON.stringify(snapshot));}catch{setNotice('A cópia de recuperação do navegador não está disponível. Exporte o espaço completo.');}
   if(blocked.current)return;setStatus('Salvando…');
   queue.current=queue.current.then(async()=>{
    if(blocked.current)return;
    try{const r=await fetch('/api/state/excalidraw',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:revision.current,data:snapshot})});const d=await r.json();if(!r.ok)throw Error(d.error);revision.current=d.revision;setStatus('Salvo no dispositivo');}
    catch(e){blocked.current=true;setStatus('Não salvo · exporte uma cópia');setNotice(e.message);}
   });return queue.current;
 }
 useEffect(()=>{const owner=root.current.ownerDocument.defaultView;owner.suiteDocument={flush:save,status:()=>!blocked.current};const handler=()=>{clearTimeout(timer.current);save();};owner.addEventListener('pagehide',handler);return()=>{delete owner.suiteDocument;owner.removeEventListener('pagehide',handler);clearTimeout(timer.current);};},[]);
 function changed(elements,appState,files){if(appState.isLoading)return;setReady(true);const current=documentRef.current.scenes.find(s=>s.id===active);if(!current||active!==documentRef.current.active)return;const serializable=clearAppStateForLocalStorage(appState);const fingerprint=JSON.stringify({elements,appState:serializable,files});if(fingerprints.current[active]===fingerprint)return;fingerprints.current[active]=fingerprint;current.elements=elements;current.appState=serializable;current.files=files;setStatus('Salvando…');clearTimeout(timer.current);timer.current=setTimeout(save,400);}
 async function activate(id){await save();documentRef.current.active=id;setActive(id);await save();}
 function sync(){setTabs(documentRef.current.scenes.map(({id,name})=>({id,name})));save();}
 async function add(duplicate=false){await save();const next=duplicate?{...structuredClone(scene()),id:crypto.randomUUID(),name:scene().name+' (cópia)'}:blank();documentRef.current.scenes.push(next);documentRef.current.active=next.id;setActive(next.id);sync();}
 function rename(){const owner=root.current.ownerDocument.defaultView;const name=owner.prompt('Nome do quadro',scene().name);if(name?.trim()){scene().name=name.trim().slice(0,80);sync();}}
 function download(name,content,type){const owner=root.current.ownerDocument;const url=URL.createObjectURL(new Blob([content],{type}));const a=owner.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
 function exportScene(){const s=scene();download(s.name+'.excalidraw',serializeAsJSON(s.elements,s.appState,s.files,'local'),'application/json');}
 async function png(){try{const s=scene();const blob=await exportToBlob({elements:s.elements,appState:{...s.appState,exportBackground:true},files:s.files,mimeType:'image/png'});download(s.name+'.png',blob,'image/png');}catch(e){setNotice(e.message);}}
 async function remove(){const owner=root.current.ownerDocument.defaultView;if(documentRef.current.scenes.length===1)return;if(!owner.confirm('Excluir este quadro? Faça um backup se precisar recuperá-lo.'))return;const id=scene().id;documentRef.current.scenes=documentRef.current.scenes.filter(s=>s.id!==id);documentRef.current.active=documentRef.current.scenes[0].id;setActive(documentRef.current.active);sync();}
 function table(){if(!api.current)return;const elements=[];for(let row=0;row<3;row++)for(let col=0;col<3;col++)elements.push({type:'rectangle',x:100+col*140,y:100+row*60,width:140,height:60,strokeWidth:1,roughness:0,backgroundColor:row===0?'#e7f2eb':'transparent',label:{text:row===0?'Coluna '+(col+1):'Conteúdo',fontSize:16}});api.current.updateScene({captureUpdate:CaptureUpdateAction.IMMEDIATELY,elements:[...api.current.getSceneElements(),...convertToExcalidrawElements(elements)]});}
 const current=documentRef.current.scenes.find(s=>s.id===active);
 return <div className="editor-frame" ref={root}><div className="editor-bar"><div><strong>Quadros e diagramas</strong><small>Motor Excalidraw · arquivos locais</small></div><div className="editor-actions"><span id="editor-status" role="status">{status}</span><button onClick={table} disabled={!ready}>Inserir tabela</button><button onClick={exportScene}>Salvar .excalidraw</button><button onClick={png}>Exportar PNG</button></div></div><div className="editor-tabs">{tabs.map(t=><button key={t.id} className={t.id===active?'selected':''} onClick={()=>activate(t.id)}>{t.name}</button>)}<button onClick={()=>add()}>+ Quadro</button><span/><button onClick={()=>add(true)}>Duplicar</button><button onClick={rename}>Renomear</button><button disabled={tabs.length===1} onClick={remove}>Excluir</button></div>{notice&&<p className="editor-notice" role="alert">{notice}</p>}<div className="canvas"><Excalidraw key={active} initialData={{elements:current.elements,appState:current.appState,files:current.files}} onInitialize={value=>{api.current=value;setReady(true);}} onChange={changed} langCode="pt-BR" UIOptions={{canvasActions:{saveAsImage:true,export:{saveFileToDisk:true}}}}><MainMenu><MainMenu.DefaultItems.LoadScene/><MainMenu.DefaultItems.SaveToActiveFile/><MainMenu.DefaultItems.Export/><MainMenu.DefaultItems.SaveAsImage/><MainMenu.DefaultItems.SearchMenu/><MainMenu.DefaultItems.ClearCanvas/><MainMenu.Separator/><MainMenu.DefaultItems.ToggleTheme/><MainMenu.DefaultItems.ChangeCanvasBackground/></MainMenu></Excalidraw></div></div>;
}
createRoot(document.getElementById('root')).render(<Editor/>);
