import test from 'node:test';
import assert from 'node:assert/strict';
// Browser-independent context validation; popup runtime is verified separately.
// @ts-ignore JavaScript extension source is shared verbatim with the package.
import {recognize,actionUrl} from '../extension/context.js';
test('extension recognizes GitHub navigation and rejects lookalike origins',()=>{
 assert.deepEqual(recognize('https://github.com/example/repo/actions/runs/12345/job/8'),{repo:'example/repo',run:'12345'});
 assert.deepEqual(recognize('https://github.com/example/repo/tree/main'),{repo:'example/repo',run:null});
 for(const url of ['https://github.com.evil.test/example/repo','http://github.com/example/repo','https://github.com/settings/apps','https://example.test'])assert.equal(recognize(url),null);
});
test('extension actions carry context without credentials or starting jobs',()=>{
 const target=new URL(actionUrl({repo:'example/repo',run:'123'},'repair'));
 assert.equal(target.origin,'https://patchgoblin.vercel.app');assert.equal(target.pathname,'/workbench');assert.equal(target.searchParams.get('run'),'123');assert.equal(target.searchParams.has('token'),false);
});
