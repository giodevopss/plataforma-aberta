import {safeAuthDiagnostic} from './safe-container-diagnostic.mjs';
import {navigateOriginalContent} from './original-navigation.mjs';
import {createPlaneAccount,verifyPlaneRecovery} from './plane-account-workflow.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

export async function localContext(browser,endpoint){
 const context=await browser.newContext({viewport:{width:1440,height:960},locale:'en-US'});context.setDefaultNavigationTimeout(90000);context.setDefaultTimeout(90000);await context.addCookies([{url:endpoint.origin,name:'pa_session',value:endpoint.token,httpOnly:true,sameSite:'Strict'}]);context.paDiagnostics=[];context.on('requestfailed',request=>context.paDiagnostics.push({method:request.method(),url:request.url().split('?')[0],failure:request.failure()?.errorText}));context.on('response',response=>{if(response.status()>=400)context.paDiagnostics.push({method:response.request().method(),url:response.url().split('?')[0],status:response.status()});});
 await context.route('**/*',route=>new URL(route.request().url()).origin===endpoint.origin?route.continue({headers:{...route.request().headers(),'X-PA-Session':endpoint.token}}):route.abort());
 return context;
}
async function json(context,endpoint,route,options={}){
 const response=await context.request.fetch(endpoint.origin+route,{...options,headers:{'X-PA-Session':endpoint.token,...options.headers}});
 assert.ok(response.ok(),route+' '+response.status()+' '+(await response.text()).slice(0,800));return response.json();
}
export async function loginOriginal(id,context,endpoint,account,options={}){
 await context.clearCookies();const page=await context.newPage();return loginOriginalPage(id,page,endpoint,account,{...options,fresh:true});
}
export async function loginOriginalPage(id,page,endpoint,account,{returnTo,fresh=false}={}){
 const loginURL=new URL(endpoint.origin+'/auth/login');if(returnTo){assert.equal(id,'formbricks');const target=new URL(returnTo,endpoint.origin);assert.equal(target.origin,endpoint.origin);assert.ok(target.pathname.startsWith('/workspaces/'));loginURL.searchParams.set('callbackUrl',target.href);}
 let submitObserved=false,credentialsSubmitted=false;const observeRequest=request=>{try{const url=new URL(request.url());if(url.origin===endpoint.origin&&request.method()==='POST'){submitObserved=true;const body=request.postData()||'';let decoded=body;try{decoded=decodeURIComponent(body.replaceAll('+',' '));}catch{}credentialsSubmitted||=body.includes(account.password)||decoded.includes(account.password);}}catch{}};page.context().on('request',observeRequest);
 const responses=[],observe=response=>{try{const url=new URL(response.url());if(url.origin===endpoint.origin&&(url.pathname.startsWith('/api/auth/')||url.pathname==='/auth/login'&&response.request().method()==='POST'))responses.push({route:url.pathname==='/auth/login'?'page-submit':url.pathname.includes('sign-in')?'sign-in':url.pathname.includes('get-session')?'session':url.pathname.includes('callback')?'callback':'other',status:response.status()});}catch{}};page.on('response',observe);
 const sessionReady=()=>page.waitForFunction(async email=>{try{const response=await fetch('/api/auth/get-session',{credentials:'include'});if(!response.ok)return false;const value=await response.json();return value?.user?.email===email;}catch{return false;}},account.email,{timeout:90000,polling:2000});
 const openAuthenticatedDocument=async()=>{await sessionReady();if(fresh)assert.equal(submitObserved,true,'Fresh original authentication must follow an actual browser submission');await navigateOriginalContent(page,new URL(returnTo||'/',endpoint.origin).href,{waitUntil:'commit'});return page;};
 try{
  page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(90000);await page.goto(loginURL.href,{waitUntil:'domcontentloaded'});if(id==='formbricks'&&fresh){const anonymous=await page.evaluate(async()=>{const response=await fetch('/api/auth/get-session',{credentials:'include'});if(!response.ok)throw Error('Original anonymous session probe failed');const value=await response.json();return !value?.user;});assert.equal(anonymous,true,'Fresh original browser must have no authenticated session before submitting credentials');}if(!new URL(page.url()).pathname.startsWith('/auth/')){if(id==='formbricks')return await openAuthenticatedDocument();return page;}
  if(id==='formbricks'){const email=page.locator('input[name=email]'),switcher=page.getByRole('button',{name:'Log in with Email',exact:false});await Promise.race([email.or(switcher).first().waitFor(),page.waitForURL(url=>!url.pathname.startsWith('/auth/'),{timeout:45000,waitUntil:'domcontentloaded'})]);if(!new URL(page.url()).pathname.startsWith('/auth/'))return await openAuthenticatedDocument();if(!await email.isVisible())await switcher.click();}
  if(id==='formbricks')await page.waitForFunction(()=>{const email=document.querySelector('input[name=email]'),password=document.querySelector('input[name=password]'),form=password?.closest('form'),props=element=>element&&element[Object.keys(element).find(key=>key.startsWith('__reactProps$'))];return typeof props(email)?.onChange==='function'&&typeof props(password)?.onChange==='function'&&typeof props(form)?.onSubmit==='function';});
  await page.locator('input[name=email]').fill(account.email);await page.locator('input[name=password]').fill(account.password);await page.locator('button[type=submit]').click();
  // Require the original authenticated server session after the real form submit.
  // The following workflow opens its own original content; it need not wait for
  // an unrelated cold dashboard route to finish rendering first.
  if(id==='formbricks')return await openAuthenticatedDocument();
  await page.waitForURL(url=>!url.pathname.startsWith('/auth/'),{timeout:60000,waitUntil:'domcontentloaded'});return page;
 }catch(error){const state=await page.evaluate(()=>{const email=document.querySelector('input[name=email]'),password=document.querySelector('input[name=password]'),submit=document.querySelector('button[type=submit]');return {pathname:location.pathname,emailFilled:Boolean(email?.value),passwordFilled:Boolean(password?.value),submitDisabled:submit?.disabled===true,reactBound:Boolean(email&&Object.keys(email).some(key=>key.startsWith('__reactProps$'))),errorText:document.body?.innerText||''};}).catch(()=>({}));const message=String(error.message).replaceAll(account.password,'[REDACTED]').replaceAll(endpoint.token,'[REDACTED]');throw Error(message+'; fixed original auth diagnostic '+JSON.stringify({...safeAuthDiagnostic(state,responses),submitObserved,credentialsSubmitted}));}
 finally{page.removeListener('response',observe);page.context().removeListener('request',observeRequest);}
}
export async function originalAccountWorkflow({id,browser,endpoint,evidence,root,checks}){
 if(id==='plane')return createPlaneAccount({browser,endpoint,evidence,checks,localContext});
 if(!['postiz','formbricks'].includes(id))return null;
 const context=await localContext(browser,endpoint),page=await context.newPage();page.setDefaultTimeout(45000);
 const account={email:'qa-suite@plataforma.invalid',password:'Qa-'+crypto.randomBytes(20).toString('hex')+'!'};
 if(id==='formbricks'){
  await page.goto(endpoint.origin,{waitUntil:'domcontentloaded'});await page.getByText('Get started',{exact:true}).click();
  if(!await page.getByTestId('signup-name').isVisible())await page.getByTestId('signup-show-login').click();
  await page.getByTestId('signup-name').fill('Suite QA');await page.getByTestId('signup-email').fill(account.email);await page.getByTestId('signup-password').fill(account.password);await page.getByTestId('signup-submit').click();
  await page.waitForURL(url=>url.pathname.includes('signup-without-verification-success')||url.pathname==='/auth/login',{waitUntil:'domcontentloaded'});await page.close();
  const signedIn=await loginOriginal(id,context,endpoint,account);
  await signedIn.getByPlaceholder('e.g., Acme Inc').fill('Suite QA Local');await signedIn.getByRole('button',{name:'Continue',exact:true}).click();await signedIn.getByRole('button',{name:'Skip',exact:true}).click();
  await signedIn.getByText('Start from scratch',{exact:true}).click();
  await signedIn.waitForURL(/\/workspaces\/[^/]+\/surveys\/[^/]+\/edit/,{waitUntil:'domcontentloaded'});const location=new URL(signedIn.url()),workspaceId=location.pathname.split('/')[2],surveyId=location.pathname.split('/')[4];await signedIn.goto(endpoint.origin+location.pathname,{waitUntil:'domcontentloaded'});
  const surveyName=signedIn.locator('input').first();assert.match(await surveyName.inputValue(),/scratch|survey/i);await surveyName.fill('QA formulario local');await signedIn.getByRole('button',{name:'Save as draft',exact:true}).click();await signedIn.getByRole('button',{name:/^(Activate|Publish)$/}).click();await signedIn.waitForURL(/\/summary/,{waitUntil:'domcontentloaded'});await signedIn.screenshot({path:path.join(evidence,'survey-summary.png'),fullPage:true});
  const respondent=await context.newPage();await respondent.goto(endpoint.origin+'/s/'+surveyId,{waitUntil:'domcontentloaded'});await respondent.getByRole('textbox').fill('QA resposta preservada local');const submitted=respondent.waitForResponse(response=>['POST','PATCH'].includes(response.request().method())&&new URL(response.url()).origin===endpoint.origin&&response.url().includes('/responses')&&(response.request().postData()||'').includes('QA resposta preservada local'));await respondent.getByRole('button',{name:/^(Next|Submit|Finish)$/i}).last().click();assert.ok((await submitted).ok());
  const responsePath='/workspaces/'+workspaceId+'/surveys/'+surveyId+'/responses';await signedIn.goto(endpoint.origin+responsePath,{waitUntil:'domcontentloaded'});await signedIn.getByText('QA resposta preservada local',{exact:false}).first().waitFor();await signedIn.screenshot({path:path.join(evidence,'survey-response.png'),fullPage:true});checks.push('Original administrator signup/login, organization and workspace, editable survey, local activation and real respondent submission completed through the browser without external email or network');
  await context.close();return {account,workspaceId,surveyId,responsePath};
 }
 await page.goto(endpoint.origin+'/auth',{waitUntil:'domcontentloaded'});await page.locator('input[name=email]').fill(account.email);await page.locator('input[name=password]').fill(account.password);await page.locator('input[name=company]').fill('Suite QA Local');await page.getByRole('button',{name:'Create Account',exact:true}).click();await page.waitForURL(url=>url.pathname!=='/auth',{waitUntil:'domcontentloaded'});await page.close();
 const signedIn=await loginOriginal(id,context,endpoint,account);await signedIn.screenshot({path:path.join(evidence,'calendar.png'),fullPage:true});
 const tag=await json(context,endpoint,'/api/posts/tags',{method:'POST',data:{name:'QA planejamento local',color:'#336699'}});const tags=await json(context,endpoint,'/api/posts/tags');assert.ok(JSON.stringify(tags).includes('QA planejamento local'));
 const bytes=fs.readFileSync(path.join(root,'subprojetos/tests/fixtures/ocr.png'));const media=await json(context,endpoint,'/api/media/upload-simple',{method:'POST',multipart:{file:{name:'qa-local.png',mimeType:'image/png',buffer:bytes}}});assert.ok(media.id);assert.ok(media.path);const url=new URL(media.path,endpoint.origin);assert.equal(url.origin,endpoint.origin);const download=await context.request.get(url.href,{headers:{'X-PA-Session':endpoint.token}});assert.ok(download.ok());assert.deepEqual(await download.body(),bytes);
 checks.push('Original local account, calendar, persistent planning tag and byte-identical media upload/download passed without external social accounts or publishing');await context.close();return {account,tag,media,mediaHash:crypto.createHash('sha256').update(bytes).digest('hex')};
}
export async function verifyAccountPage({id,page,endpoint,state}){
 if(id==='formbricks'){try{if(new URL(page.url()).pathname!==state.responsePath)await navigateOriginalContent(page,endpoint.origin+state.responsePath);const answer=page.getByText('QA resposta preservada local',{exact:false}).first();await answer.waitFor();await answer.scrollIntoViewIfNeeded();return;}catch(error){const diagnostic=await page.evaluate(()=>({pathname:location.pathname,errorText:document.body?.innerText||''})).catch(()=>({}));throw Error(error.message+'; fixed response view diagnostic '+JSON.stringify(safeAuthDiagnostic(diagnostic)));}}
 const result=await page.evaluate(async()=>{const response=await fetch('/api/posts/tags');if(!response.ok)throw Error('Tags '+response.status);return response.json();});assert.ok(JSON.stringify(result).includes('QA planejamento local'));
 const media=await page.evaluate(async()=>{const response=await fetch('/api/media?page=1');if(!response.ok)throw Error('Media '+response.status);return response.json();});
 const items=Array.isArray(media)?media:media.results||media.data||media.media;assert.ok(Array.isArray(items),'Original media listing must return records');const restoredMedia=items.find(item=>item.id===state.media.id);assert.ok(restoredMedia,'Uploaded original media is listed after restore');const mediaURL=new URL(restoredMedia.path,endpoint.origin);assert.equal(mediaURL.origin,endpoint.origin,'Original media API must return the current local origin after restore');
 await page.evaluate(async({url,hash})=>{const response=await fetch(url);if(!response.ok)throw Error('Media download '+response.status);const bytes=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==hash)throw Error('Original media bytes changed');}, {url:mediaURL.href,hash:state.mediaHash});
}
export async function verifyRecoveredAccount({id,browser,endpoint,state,evidence,checks}){
 if(!state)return;
 if(id==='plane')return verifyPlaneRecovery({browser,endpoint,state,evidence,checks,localContext});
 const context=await localContext(browser,endpoint),page=await loginOriginal(id,context,endpoint,state.account,id==='formbricks'?{returnTo:state.responsePath}:{});
 await verifyAccountPage({id,page,endpoint,state});
 await page.screenshot({path:path.join(evidence,'restored-account.png'),fullPage:true});await context.close();checks.push('Fresh browser signed into independently restored original account and recovered its persistent workspace or planning tags and original media bytes');
}
