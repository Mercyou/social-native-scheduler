import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingBatch,runSequential} from '../batch.js';
test('import only untouched entries, never repeat a submitted entry',()=>{
  const rows=[{status:'planned',id:1},{status:'needs_review',id:2},{status:'verified',id:3}];
  assert.deepEqual(pendingBatch(rows),[rows[0]]);
  for(const status of ['preparing','prepared','submitting'])assert.throws(()=>pendingBatch([...rows,{status}]));
});
test('batch runs in order and stops before later entries on error',async()=>{
  const seen=[];await assert.rejects(runSequential([1,2,3],async n=>{seen.push(n);if(n===2)throw Error('unknown');}));assert.deepEqual(seen,[1,2]);
  const progress=[];assert.equal(await runSequential([1,2],async()=>{},n=>progress.push(n)),2);assert.deepEqual(progress,[1,2]);
});
