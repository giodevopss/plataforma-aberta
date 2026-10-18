import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareGraphiteAssets} from './graphite-open-assets.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const cache=path.join(root,'desktop/.cache'),upstream=path.join(root,'subprojetos/graphite/upstream'),source=path.join(cache,'graphite-source');
const commit=JSON.parse(fs.readFileSync(path.join(root,'subprojetos/graphite/UPSTREAM.json'))).commit;
if(execFileSync('git',['rev-parse','HEAD'],{cwd:upstream,encoding:'utf8'}).trim()!==commit)throw Error('Graphite diverge do commit fixado.');
const cargoBin=process.env.PA_GRAPHITE_CARGO_BIN||path.join(cache,'cargo/bin'),bindgen=process.env.PA_GRAPHITE_BINDGEN_BIN||path.join(cache,'build-tools/wasm-bindgen'),about=process.env.PA_GRAPHITE_ABOUT_BIN||path.join(cache,'build-tools/cargo-about/cargo-about-0.9.2-aarch64-apple-darwin');
if(!fs.existsSync(path.join(cargoBin,'cargo'))||!fs.existsSync(path.join(bindgen,'wasm-bindgen'))||!fs.existsSync(path.join(about,'cargo-about')))throw Error('Toolchain isolada ainda não preparada: Rust 1.99.0, wasm32-unknown-unknown, wasm-bindgen 0.2.121 e cargo-about 0.9.2. Consulte desktop/README.md.');
const env={...process.env,CARGO_HOME:path.join(cache,'cargo'),RUSTUP_HOME:process.env.RUSTUP_HOME||path.join(cache,'rustup'),CARGO_BUILD_JOBS:'2',CARGO_INCREMENTAL:'0',PATH:[cargoBin,bindgen,about,process.env.PATH].join(path.delimiter)};
function run(binary,args,cwd){execFileSync(binary,args,{cwd,env,stdio:'inherit'});}
if(!execFileSync('rustc',['--version'],{env,encoding:'utf8'}).includes('1.99.0'))throw Error('Rust 1.99.0 is required.');
if(!fs.existsSync(source)){
 fs.mkdirSync(source,{recursive:true});
 const archive=execFileSync('git',['archive',commit],{cwd:upstream,maxBuffer:512_000_000});
 execFileSync('tar',['-x','-C',source],{input:archive});
 fs.cpSync(path.join(upstream,'.git'),path.join(source,'.git'),{recursive:true});
 run('git',['apply',path.join(root,'desktop/scripts/graphite-desktop.patch')],source);
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'desktop/scripts/graphite-persistence-provenance.json')));
 for(const file of provenance.files){const original=path.join(source,file.path);if(file.original_sha256===null){if(fs.existsSync(original))throw Error('Unexpected existing persistence module: '+file.path);}else if(crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex')!==file.original_sha256)throw Error('Original persistence source differs: '+file.path);}
 run('git',['apply','--check',path.join(root,'desktop/scripts/graphite-persistence.patch')],source);
 run('git',['apply',path.join(root,'desktop/scripts/graphite-persistence.patch')],source);
 for(const file of provenance.files)if(crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file.path))).digest('hex')!==file.patched_sha256)throw Error('Persistence patch differs: '+file.path);
}
if(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()!==commit)throw Error('Cópia de compilação Graphite diverge do commit fixado.');
if(!execFileSync('wasm-bindgen',['--version'],{env,encoding:'utf8'}).includes('0.2.121'))throw Error('Versão wasm-bindgen incompatível.');
const frontend=path.join(source,'frontend');
prepareGraphiteAssets(source);
if(!fs.existsSync(path.join(frontend,'node_modules')))run(process.platform==='win32'?'npm.cmd':'npm',['ci'],frontend);
const disk=fs.statfsSync(source);if(disk.bavail*disk.bsize<8_000_000_000)throw Error('A compilação Rust completa requer pelo menos 8 GB livres para os artefatos temporários neste host.');
// Exercise the actual production comparator in an isolated tiny Rust crate,
// retaining the serde_json version from the original pinned lockfile.
const checkpointTests=path.join(cache,'graphite-checkpoint-test');fs.mkdirSync(checkpointTests,{recursive:true});const serdeVersion=fs.readFileSync(path.join(source,'Cargo.lock'),'utf8').match(/name = "serde_json"\nversion = "([0-9.]+)"/)?.[1];if(!serdeVersion)throw Error('Pinned serde_json version missing.');fs.writeFileSync(path.join(checkpointTests,'Cargo.toml'),'[package]\nname = "plataforma-persistence-checkpoint-tests"\nversion = "0.1.0"\nedition = "2024"\n[workspace]\n[lib]\npath = '+JSON.stringify(path.join(source,'editor/src/persistence_checkpoint.rs'))+'\n[dependencies]\nserde_json = { version = "='+serdeVersion+'", features = ["preserve_order", "float_roundtrip"] }\n');run('cargo',['test','--manifest-path',path.join(checkpointTests,'Cargo.toml')],checkpointTests);
run('cargo',['build','--lib','--package','graphite-wasm-wrapper','--target','wasm32-unknown-unknown','--release'],source);
const pkg=path.join(frontend,'wrapper/pkg');
run('wasm-bindgen',['--target','web','--out-name','graphite_wasm_wrapper','--out-dir',pkg,'--no-demangle',path.join(process.env.CARGO_TARGET_DIR||path.join(source,'target'),'wasm32-unknown-unknown/release/graphite_wasm_wrapper.wasm')],source);
// Binaryen 130 crashed with SIGBUS on this host. It is optional; the valid
// wasm-bindgen release artifact retains the complete engine without that pass.
const wasm=fs.readFileSync(path.join(pkg,'graphite_wasm_wrapper_bg.wasm'));
if(wasm.length<1_000_000)throw Error('Artefato WASM ausente ou truncado.');await WebAssembly.compile(wasm);
run(process.platform==='win32'?'npm.cmd':'npm',['exec','vite','--','build','--base=/graphite/'],frontend);
const out=path.join(root,'desktop/resources/graphite');fs.rmSync(out,{recursive:true,force:true});fs.cpSync(path.join(frontend,'dist'),out,{recursive:true});
const emitted=fs.readdirSync(path.join(out,'assets')).filter(f=>f.endsWith('.wasm'));if(emitted.length!==1)throw Error('Saída WASM inesperada.');
const distributed=fs.readFileSync(path.join(out,'assets',emitted[0]));await WebAssembly.compile(distributed);
fs.writeFileSync(path.join(root,'desktop/resources/graphite-provenance.json'),JSON.stringify({repository:'https://github.com/GraphiteEditor/Graphite',commit,integration:'Complete original Rust/WASM engine and Svelte UI',wasm_bytes:distributed.length,wasm_sha256:crypto.createHash('sha256').update(distributed).digest('hex'),optimization:'Rust release plus wasm-bindgen; optional Binaryen pass omitted after SIGBUS',patch:'scripts/graphite-desktop.patch',persistencePatch:'scripts/graphite-persistence.patch',persistence_patch_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'desktop/scripts/graphite-persistence.patch'))).digest('hex'),storage:'Original IndexedDB and OPFS with awaited verified document persistence; full product backup acceptance separate'},null,2)+'\n');
