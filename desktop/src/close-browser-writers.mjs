// Respect original beforeunload handlers. An unsaved original form blocks the
// checkpoint; the suite never overrides that decision or destroys its window.
export async function closeBrowserWriters(contents,{timeout=15000}={}){
 const results=await Promise.allSettled(contents.filter(item=>!item.isDestroyed()).map(item=>new Promise((resolve,reject)=>{
  let timer;const clear=()=>{clearTimeout(timer);item.removeListener('destroyed',closed);item.removeListener('will-prevent-unload',blocked);};
  const closed=()=>{clear();resolve();};
  const blocked=()=>{clear();reject(Error('Salve ou descarte as alterações no aplicativo antes de continuar.'));};
  item.once('destroyed',closed);item.once('will-prevent-unload',blocked);timer=setTimeout(()=>{clear();reject(Error('O aplicativo ainda está salvando. Aguarde antes de continuar.'));},timeout);
  try{item.close({waitForBeforeUnload:true});if(item.isDestroyed())closed();}catch(error){clear();reject(error);}
 })));
 const failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
 if(failures.length)throw new AggregateError(failures,failures[0].message);
}
