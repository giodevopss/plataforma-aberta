// A public QA result may contain these fixed states/categories only, never raw
// logs, health output, environment values, SQL, mount paths or account settings.
export function safeContainerDiagnostic(role,state={},logs=''){
 if(!state||typeof state!=='object'||Array.isArray(state))state={};
 const aliases={'postiz-postgres':'postgres','postiz-redis':'redis','temporal-elasticsearch':'elasticsearch','temporal-postgresql':'temporal-postgres'},roles=new Set(['postgres','redis','postiz','gateway','temporal','elasticsearch','temporal-postgres']),states=new Set(['created','running','paused','restarting','removing','exited','dead']),health=new Set(['starting','healthy','unhealthy']);
 const categories=[['memory',/out of memory|OOMKilled|cannot allocate memory/i],['permission',/permission denied|EACCES|operation not permitted/i],['database-auth',/password authentication failed|role .* does not exist/i],['connection',/ECONNREFUSED|connection refused|ENOTFOUND|EAI_AGAIN/i],['port',/EADDRINUSE|address already in use/i],['missing-code',/Cannot find module|MODULE_NOT_FOUND/i]];
 return {role:roles.has(role)?role:Object.hasOwn(aliases,role)?aliases[role]:'other',status:states.has(state.Status)?state.Status:'unknown',health:health.has(state.Health?.Status)?state.Health.Status:'none',exitCode:Number.isInteger(state.ExitCode)&&state.ExitCode>=0&&state.ExitCode<=255?state.ExitCode:null,oomKilled:state.OOMKilled===true,running:state.Running===true,categories:categories.filter(([,pattern])=>pattern.test(logs)).map(([name])=>name)};
}

// Derive a video fixture failure without publishing console messages, download
// paths, browser content, error text or any other fields from its private report.
export function safeScreenityDiagnostic(value={}){
 const phases=new Set(['launch','permission','record-fixture','play-original','crop-original','export-mp4','export-webm','capture-original','flush-draft','close-source','snapshot','restore-profile','reopen-draft','capture-restored','save-fixture','complete']);
 const categories=new Set(['timeout','assertion','other']);
 return {id:'screenity',phase:phases.has(value.phase)?value.phase:'unknown',category:categories.has(value.failureCategory)?value.failureCategory:'other',completedChecks:Array.isArray(value.checks)?Math.min(value.checks.length,100):0};
}

// Fixed auth states only: no input values, cookie/token values, body or URLs.
export function safeAuthDiagnostic(state={},responses=[]){
 const routes=new Set(['sign-in','session','callback','other']);const errors=[['credentials',/invalid.*(?:credential|password)|incorrect.*(?:password|email)/i],['verification',/verify your email|email.*not verified/i],['csrf',/csrf|invalid origin|origin.*not.*allowed/i],['rate-limit',/too many|rate limit/i],['connection',/failed to fetch|network error|connection refused/i]];
 return {location:typeof state.pathname==='string'&&state.pathname.startsWith('/auth/')?'auth':typeof state.pathname==='string'&&state.pathname.startsWith('/workspaces/')?'workspace':'other',emailFilled:state.emailFilled===true,passwordFilled:state.passwordFilled===true,submitDisabled:state.submitDisabled===true,reactBound:state.reactBound===true,errorKinds:errors.filter(([,pattern])=>pattern.test(String(state.errorText||''))).map(([name])=>name),responses:(Array.isArray(responses)?responses:[]).filter(value=>value&&routes.has(value.route)&&Number.isInteger(value.status)&&value.status>=100&&value.status<=599).slice(-12).map(value=>({route:value.route,status:value.status}))};
}
