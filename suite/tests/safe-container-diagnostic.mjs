// A public QA result may contain these fixed states/categories only, never raw
// logs, health output, environment values, SQL, mount paths or account settings.
export function safeContainerDiagnostic(role,state={},logs=''){
 if(!state||typeof state!=='object'||Array.isArray(state))state={};
 const roles=new Set(['postgres','redis','postiz','gateway']),states=new Set(['created','running','paused','restarting','removing','exited','dead']),health=new Set(['starting','healthy','unhealthy']);
 const categories=[['memory',/out of memory|OOMKilled|cannot allocate memory/i],['permission',/permission denied|EACCES|operation not permitted/i],['database-auth',/password authentication failed|role .* does not exist/i],['connection',/ECONNREFUSED|connection refused|ENOTFOUND|EAI_AGAIN/i],['port',/EADDRINUSE|address already in use/i],['missing-code',/Cannot find module|MODULE_NOT_FOUND/i]];
 return {role:roles.has(role)?role:'other',status:states.has(state.Status)?state.Status:'unknown',health:health.has(state.Health?.Status)?state.Health.Status:'none',exitCode:Number.isInteger(state.ExitCode)&&state.ExitCode>=0&&state.ExitCode<=255?state.ExitCode:null,oomKilled:state.OOMKilled===true,running:state.Running===true,categories:categories.filter(([,pattern])=>pattern.test(logs)).map(([name])=>name)};
}
