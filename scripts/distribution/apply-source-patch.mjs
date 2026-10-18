// A copied source tree must not inherit the surrounding publication repository.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
export function applySourcePatch({directory,patch}){directory=fs.realpathSync(directory);patch=fs.realpathSync(patch);const env={...process.env,GIT_CEILING_DIRECTORIES:path.dirname(directory)};for(const args of [['apply','--check',patch],['apply',patch]])execFileSync('git',['-C',directory,...args],{env,stdio:'pipe'});}
