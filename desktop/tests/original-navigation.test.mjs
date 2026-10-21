import test from 'node:test';import assert from 'node:assert/strict';
import {navigateOriginalContent,originalTablePathMatches} from '../../suite/tests/original-navigation.mjs';
test('Original content retries one superseded client navigation, never persistent aborts, HTTP errors or timeouts',async()=>{
 const url='http://127.0.0.1:12345/workspaces/synthetic/responses';let calls=0;
 const page={goto:async(target,options)=>{assert.equal(target,url);assert.deepEqual(options,{waitUntil:'domcontentloaded'});if(!calls++)throw Error('page.goto: net::ERR_ABORTED');return 'original-response';}};
 assert.equal(await navigateOriginalContent(page,url),'original-response');assert.equal(calls,2);await navigateOriginalContent({goto:async(_target,options)=>{assert.equal(options.waitUntil,'commit');return 'committed original document';}},url,{waitUntil:'commit'});
 for(const message of ['net::ERR_ABORTED','Timeout 90000ms exceeded','net::ERR_CONNECTION_REFUSED']){let count=0;await assert.rejects(navigateOriginalContent({goto:async()=>{count++;throw Error(message);}},url),new RegExp(message));assert.equal(count,message==='net::ERR_ABORTED'?2:1);}
 const table='/database/11/table/22';for(const route of [table,table+'/',table+'/95',table+'/95/'])assert.equal(originalTablePathMatches(route,table),true);for(const route of ['/database/11/table/222',table+'/not-a-view',table+'/0',table+'/95/row/1','/login'])assert.equal(originalTablePathMatches(route,table),false);
});
