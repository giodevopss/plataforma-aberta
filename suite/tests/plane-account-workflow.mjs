import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

async function csrf(context,endpoint){
 const response=await context.request.get(endpoint.origin+'/auth/get-csrf-token/',{headers:{'X-PA-Session':endpoint.token}});assert.ok(response.ok());const body=await response.json();assert.ok(body.csrf_token);return body.csrf_token;
}
async function request(context,endpoint,route,options={}){
 const token=await csrf(context,endpoint);const response=await context.request.fetch(endpoint.origin+route,{...options,headers:{'X-PA-Session':endpoint.token,'X-CSRFToken':token,Origin:endpoint.origin,Referer:endpoint.origin+'/',...options.headers}});assert.ok(response.ok(),route+' '+response.status()+' '+(await response.text()).slice(0,1000));return response.json();
}
export async function loginPlane(context,endpoint,account){
 const token=await csrf(context,endpoint);const response=await context.request.post(endpoint.origin+'/auth/sign-in/',{headers:{'X-PA-Session':endpoint.token,Origin:endpoint.origin,Referer:endpoint.origin+'/'},form:{email:account.email,password:account.password,csrfmiddlewaretoken:token}});assert.ok(response.ok(),'Original Plane sign-in failed');assert.ok(!(new URL(response.url())).searchParams.has('error_code'),'Original Plane sign-in redirected with an error');
 await request(context,endpoint,'/api/users/me/');
}
export async function createPlaneAccount({browser,endpoint,evidence,checks,localContext}){
 const context=await localContext(browser,endpoint),page=await context.newPage();page.setDefaultTimeout(60000);const account={email:'qa-suite@plataforma.invalid',password:'Qa-'+crypto.randomBytes(20).toString('hex')+'!'};
 await page.goto(endpoint.origin);await page.getByText('Get started',{exact:true}).click();for(const [name,value]of Object.entries({first_name:'Suite',last_name:'QA',email:account.email,company_name:'Suite QA Local',password:account.password,confirm_password:account.password}))await page.locator('input[name="'+name+'"]').fill(value);
 const telemetry=page.getByRole('checkbox',{name:'Allow Plane to anonymously collect usage events'});await telemetry.uncheck();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(url=>url.pathname.startsWith('/god-mode/')&&!url.searchParams.has('error_code'));await page.screenshot({path:path.join(evidence,'instance-administrator.png'),fullPage:true});
 const workspace=await request(context,endpoint,'/api/instances/workspaces/',{method:'POST',data:{name:'QA workspace local',slug:'qa-local'}});assert.ok(workspace.id);await loginPlane(context,endpoint,account);console.log('plane: administrator and original workspace created');
 await page.goto(endpoint.origin+'/onboarding');await page.getByPlaceholder('Enter your full name',{exact:true}).fill('Suite QA');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(url=>url.pathname!=='/onboarding');console.log('plane: original user onboarding completed');
 const project=await request(context,endpoint,'/api/workspaces/qa-local/projects/',{method:'POST',data:{name:'QA projeto profissional',identifier:'LOCAL',description:'Projeto local preservado no backup',network:0}});assert.ok(project.id);
 const issue=await request(context,endpoint,'/api/workspaces/qa-local/projects/'+project.id+'/issues/',{method:'POST',data:{name:'QA tarefa preservada',description_html:'<p>Documento da equipe local</p>',priority:'high'}});assert.ok(issue.id);assert.equal(issue.name,'QA tarefa preservada');
 checks.push('Original Plane administrator onboarding, local workspace and authenticated original project/task APIs created persistent work without external network');
 const state={account,workspaceId:workspace.id,projectId:project.id,issueId:issue.id,projectPath:'/qa-local/projects/'+project.id+'/issues/'};await page.goto(endpoint.origin+state.projectPath);await page.getByText('QA tarefa preservada',{exact:true}).first().waitFor();fs.writeFileSync(path.join(evidence,'project-interface.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(evidence,'project-interface.png'),fullPage:true});await context.close();return state;
}
export async function verifyPlaneRecovery({browser,endpoint,state,evidence,checks,localContext}){
 const context=await localContext(browser,endpoint);await loginPlane(context,endpoint,state.account);const project=await request(context,endpoint,'/api/workspaces/qa-local/projects/'+state.projectId+'/');assert.equal(project.name,'QA projeto profissional');const issue=await request(context,endpoint,'/api/workspaces/qa-local/projects/'+state.projectId+'/issues/'+state.issueId+'/');assert.equal(issue.name,'QA tarefa preservada');assert.equal(issue.priority,'high');const page=await context.newPage();await page.goto(endpoint.origin+state.projectPath);await page.getByText('QA tarefa preservada',{exact:true}).first().waitFor();await page.screenshot({path:path.join(evidence,'restored-project.png'),fullPage:true});fs.writeFileSync(path.join(evidence,'restored-project.txt'),await page.locator('body').innerText());await context.close();checks.push('Fresh independent Plane recovery preserves administrator login, workspace, project and task content/priority through original authenticated APIs and visible original task-list interface');
}

export async function loginPlanePage(page,endpoint){
 await page.goto(endpoint.origin);const email=page.locator('input[name="email"]:visible');await Promise.race([email.waitFor({timeout:60000}),page.waitForURL(url=>url.pathname.startsWith('/qa-local/'),{timeout:60000})]);if(await email.isVisible())return false;return true;
}
export async function verifyPlanePage({page,endpoint,state}){
 if(!await loginPlanePage(page,endpoint)){await page.locator('input[name="email"]:visible').fill(state.account.email);if(!await page.locator('input[name="password"]').isVisible())await page.getByRole('button',{name:'Continue',exact:true}).click();await page.locator('input[name="password"]').fill(state.account.password);await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname.startsWith('/qa-local/'),{timeout:60000});}
 await page.goto(endpoint.origin+state.projectPath);await page.getByText('QA tarefa preservada',{exact:true}).first().waitFor({timeout:60000});
}
