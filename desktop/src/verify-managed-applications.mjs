// Verify a restored profile within the same memory budget as everyday use.
// Each complete stack is stopped before the next one is opened.
export async function verifyManagedApplications(runtime, applications, fetcher = fetch) {
 const checks=[];
 for(const id of applications){
  let failure;
  try {
   const endpoint=await runtime.start(id);
   const response=await fetcher(endpoint.origin+(runtime.specs.get(id).healthPath||'/'),{headers:{'X-PA-Session':endpoint.token},signal:AbortSignal.timeout(15000)});
   await response.body?.cancel();
   if(!response.ok)throw Error('Aplicativo restaurado não respondeu: '+id);
   checks.push('Original managed '+id+' initialized its restored data under an independent runtime identity');
  }catch(error){failure=error;}
  try{await runtime.stop(id);}catch(error){failure=failure?new AggregateError([failure,error],'Falha na verificação e no encerramento do aplicativo restaurado: '+id):error;}
  if(failure)throw failure;
 }
 return checks;
}
