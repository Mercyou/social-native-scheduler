import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingBatch,runSequential,runPlatformBatch,skipJob,isPlatformLimit} from '../batch.js';
test('import only untouched entries, never repeat a submitted entry',()=>{
  const rows=[{status:'planned',id:1},{status:'needs_review',id:2},{status:'verified',id:3}];
  assert.deepEqual(pendingBatch(rows),[rows[0]]);
  for(const status of ['preparing','prepared','submitting'])assert.throws(()=>pendingBatch([...rows,{status}]));
});
test('interrupted Weibo does not block untouched X tasks',()=>{
  const rows=[{platform:'weibo',status:'preparing'},{platform:'x',status:'planned'},{platform:'weibo',status:'planned'}];
  assert.deepEqual(pendingBatch(rows),[rows[1]]);
  skipJob(rows[0]);assert.equal(rows[0].needsResultCheck,false);
  assert.deepEqual(pendingBatch(rows),[rows[1],rows[2]]);
});
test('skipping an uncertain submission preserves review and blocks only that platform',()=>{
  const rows=[{platform:'weibo',status:'submitting'},{platform:'x',status:'planned'},{platform:'weibo',status:'planned'}];
  skipJob(rows[0]);assert.equal(rows[0].needsResultCheck,true);assert.equal(rows[0].skippedFrom,'submitting');
  assert.deepEqual(pendingBatch(rows),[rows[1]]);
  assert.throws(()=>skipJob({status:'verified'}));assert.throws(()=>skipJob(rows[0]));
});
test('quota stops remaining Weibo attempts and continues X exactly once',async()=>{
  const jobs=[{id:1,platform:'x'},{id:2,platform:'weibo'},{id:3,platform:'x'},{id:4,platform:'weibo'}];
  const seen=[],skipped=[];
  const result=await runPlatformBatch(jobs,async j=>{seen.push(j.id);if(j.id===2)throw Object.assign(Error('定时额度不足'),{code:'schedule_limit'});},{onSkip:j=>skipped.push(j.id)});
  assert.deepEqual(seen,[1,2,3]);assert.deepEqual(skipped,[4]);assert.deepEqual(result,{done:2,failed:1,skipped:1,blockedPlatforms:['weibo']});
  assert.equal(isPlatformLimit({code:'schedule_permission'}),true);assert.equal(isPlatformLimit(Error('网页操作超时')),false);
});
test('unknown X result still permits Weibo without retrying another X post',async()=>{
  const seen=[];
  await runPlatformBatch([{id:1,platform:'x'},{id:2,platform:'weibo'},{id:3,platform:'x'}],async j=>{seen.push(j.id);if(j.id===1)throw Error('No response');});
  assert.deepEqual(seen,[1,2]);
});
test('batch runs in order and stops before later entries on error',async()=>{
  const seen=[];await assert.rejects(runSequential([1,2,3],async n=>{seen.push(n);if(n===2)throw Error('unknown');}));assert.deepEqual(seen,[1,2]);
  const progress=[];assert.equal(await runSequential([1,2],async()=>{},n=>progress.push(n)),2);assert.deepEqual(progress,[1,2]);
});
