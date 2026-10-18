window.EXCALIDRAW_ASSET_PATH='/';
import('./editor.jsx').catch(error=>{
  const root=document.getElementById('root');
  root.textContent='Não foi possível abrir o editor: '+error.message;
});
