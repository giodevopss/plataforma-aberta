import test from 'node:test';import assert from 'node:assert/strict';
import {navigateOriginalContent} from '../../suite/tests/original-navigation.mjs';
test('Original content retries one superseded client navigation, never persistent aborts, HTTP errors or timeouts',async()=>{
 const url='http://127.0.0.1:12345/workspaces/synthetic/responses';let calls=0;
 const page={goto:async(target,options)=>{assert.equal(target,url);assert.deepEqual(options,{waitUntil:'domcontentloaded'});if(!calls++)throw Error('page.goto: net::ERR_ABORTED');return 'original-response';}};
 assert.equal(await navigateOriginalContent(page,url),'original-response');assert.equal(calls,2);
 for(const message of ['net::ERR_ABORTED','Timeout 90000ms exceeded','net::ERR_CONNECTION_REFUSED']){let count=0;await assert.rejects(navigateOriginalContent({goto:async()=>{count++;throw Error(message);}},url),new RegExp(message));assert.equal(count,message==='net::ERR_ABORTED'?2:1);}
});
