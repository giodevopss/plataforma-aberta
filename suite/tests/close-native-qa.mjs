// Only disposable CI fixtures may be force-terminated after capturing a failure.
export async function closeNativeQA(application,{strict=true,timeout=15000}={}){
 if(!application)return;if(process.env.CI!=='true')throw Error('Native QA cleanup requires a disposable runner.');const child=application.process();let timer;
 const exit=new Promise((resolve,reject)=>{if(child.exitCode!==null)return child.exitCode===0?resolve():reject(Error('Native app exited with code '+child.exitCode));child.once('exit',code=>code===0?resolve():reject(Error('Native app exited with code '+code)));});const close=application.evaluate(({app})=>{setImmediate(()=>app.quit());return true;});close.catch(()=>{});
 try{await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native application did not close gracefully within '+timeout+' ms')),timeout);})]);}catch(error){child.kill('SIGKILL');if(strict)throw error;}finally{clearTimeout(timer);}
}
