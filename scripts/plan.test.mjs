import test from 'node:test';
import assert from 'node:assert/strict';
import {plan} from './plan.mjs';
test('synchronous platforms and midnight date rollover',()=>{
 const jobs=plan({texts:['a','b'],platforms:['weibo','x'],start:'2026-10-04T23:50:00+08:00',intervalMinutes:25});
 assert.equal(jobs.length,4);assert.equal(jobs[0].at,jobs[1].at);assert.equal(jobs[2].at,'2026-10-05T00:15:00+08:00');assert.equal(jobs[2].at,jobs[3].at);assert.ok(jobs.every(j=>j.status==='planned'));
});
test('reject ambiguous time and duplicate content',()=>{
 assert.throws(()=>plan({texts:['a'],platforms:['x'],start:'2026-10-04T18:00:00',intervalMinutes:25}));
 assert.throws(()=>plan({texts:['a','a'],platforms:['x'],start:'2026-10-04T18:00:00Z',intervalMinutes:25}));
});
