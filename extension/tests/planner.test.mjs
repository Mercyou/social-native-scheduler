import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlan,splitTexts,canPrepare,canSubmit} from '../planner.js';
test('blank lines split posts while single line breaks remain in the post',()=>{
  assert.deepEqual(splitTexts('第一行\r\n第二行\r\n\r\n另一条\r\n \t\r\n\r\n最后一条'),['第一行\n第二行','另一条','最后一条']);
  assert.deepEqual(splitTexts('\n\n 一条 \n\n'),['一条']);
});
test('same content and dates on both platforms, including midnight',()=>{
  const rows=createPlan({texts:['一','二'],platforms:['x','weibo'],start:'2030-01-01T23:50',intervalMinutes:25},0);
  assert.equal(rows.length,4);assert.equal(rows[0].at,rows[1].at);assert.equal(rows[2].at,'2030-01-02T00:15:00+08:00');assert.equal(rows[2].text,rows[3].text);
});
test('reject invalid, past, duplicate or empty plans',()=>{
  const base={texts:['一'],platforms:['x'],start:'2030-01-01T12:00',intervalMinutes:25};
  for(const change of [{texts:['一',' 一 ']},{texts:[]},{platforms:[]},{start:'2030-02-30T12:00'},{intervalMinutes:0},{intervalMinutes:1.5}])assert.throws(()=>createPlan({...base,...change},0));
  assert.throws(()=>createPlan(base,Date.parse('2030-01-01T11:59:00+08:00')));
});
test('uncertain or interrupted submissions cannot be retried',()=>{
  for(const status of ['preparing','submitting','needs_review','verified']){assert.equal(canPrepare({status}),false);assert.equal(canSubmit({status}),false);}
  assert.equal(canSubmit({status:'prepared'}),true);assert.equal(canPrepare({status:'planned'}),true);
});
