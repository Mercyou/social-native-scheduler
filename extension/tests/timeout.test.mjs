import test from 'node:test';
import assert from 'node:assert/strict';
import {withTimeout} from '../timeout.js';
test('hung browser operation returns an actionable error',async()=>{
  await assert.rejects(withTimeout(new Promise(()=>{}),20),/超时/);
});
test('normal browser completion passes through',async()=>{
  assert.equal(await withTimeout(Promise.resolve('done'),100),'done');
});
