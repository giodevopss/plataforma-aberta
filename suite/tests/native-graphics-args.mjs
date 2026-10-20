// Hosted Mac Intel EGL initialization failed while an owned VZ guest was in
// use. This affects disposable VM integration QA only. Normal native installer
// and GPU/editor tests keep their real hardware rendering and sandbox settings.
export function nativeGraphicsQAArgs({platform=process.platform,architecture=process.arch,env=process.env}={}){
 return platform==='darwin'&&architecture==='x64'&&env.CI==='true'&&env.GITHUB_REPOSITORY==='giodevopss/plataforma-aberta'&&env.PA_OWN_VM_ACCEPTANCE==='1'&&Boolean(env.PA_DESKTOP_TEST_GUEST_CONFIG||env.PA_COMBINED_GUEST)?['--disable-gpu']:[];
}
