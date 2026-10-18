import test from 'node:test';import assert from 'node:assert/strict';import {wslConfiguration,wslMountScript} from '../src/wsl-installer.mjs';import {guestArguments} from '../src/guest-runtime.mjs';
test('WSL distro boot config disables automatic host-drive mounts and Windows execution while retaining its own Linux systemd',()=>{
 const script=wslConfiguration({owner:'a'.repeat(24),imageSHA256:'b'.repeat(64)});assert.ok(script.includes('[boot]\nsystemd=true'));assert.ok(script.includes('[automount]\nenabled=false\nmountFsTab=false'));assert.ok(script.includes('[interop]\nenabled=false\nappendWindowsPath=false'));assert.ok(script.includes('/etc/plataforma-runtime-owner.json'));assert.doesNotMatch(script,/\.wslconfig|--shutdown|--set-default/);assert.throws(()=>wslConfiguration({owner:'foreign',imageSHA256:'b'.repeat(64)}),/Identidade/);
});
test('Only the explicit private Windows folder is mounted, including literal spaces, quotes and shell syntax in a valid local path',()=>{
 const script=wslMountScript("C:\\Users\\João\\Own a'$(literal)\\applications");assert.ok(script.includes("'\"'\"'"));assert.ok(script.includes('/mnt/c/Users/João'));assert.ok(script.includes('mount -t drvfs -o metadata,uid=0,gid=0,umask=022 --'));assert.ok(script.includes('chmod 0700'));assert.ok(!script.includes(' C: /mnt/c'));assert.throws(()=>wslMountScript('\\\\external\\share'),/local/);assert.throws(()=>wslMountScript('C:\\bad\npath'),/inválido/);
});
test('Original container env-file paths translate to the private WSL mount without rewriting environment values',()=>{
 assert.deepEqual(guestArguments(['run','--env-file','C:\\Users\\QA User\\app\\application.env','--env','VALUE=C:\\external\\value','image'],{platform:'win32'}),['run','--env-file','/mnt/c/Users/QA User/app/application.env','--env','VALUE=C:\\external\\value','image']);
});
