import test from 'node:test';
import assert from 'node:assert/strict';
import {drivePage} from '../page-driver.js';
function fixture({text='测试正文',button='Schedule',proof='Jan 1, 2030, 12:00 PM',host='x.com'}={}){
  let clicked=0;
  const el=data=>({...data,getClientRects:()=>[{}],getAttribute:()=>null});
  const elements={
    '[data-testid=tweetTextarea_0]':el({isContentEditable:true,innerText:text}),
    '[data-testid=scheduledTweetIndicator]':el({innerText:proof}),
    '[data-testid=tweetButton], [data-testid=tweetButtonInline]':el({innerText:button,click:()=>clicked++})
  };
  globalThis.document={querySelector:()=>null,querySelectorAll:selector=>elements[selector]?[elements[selector]]:[]};
  globalThis.location={hostname:host};globalThis.getComputedStyle=()=>({visibility:'visible'});
  return ()=>clicked;
}
const job={platform:'x',text:'测试正文',at:'2030-01-01T12:00:00+08:00',proof:'Jan 1, 2030, 12:00 PM'};
test('page discovery works without a posting job or date',async()=>{
  fixture();document.title='X';location.href='https://x.com/home';
  const result=await drivePage('describe',{});
  assert.equal(result.url,'https://x.com/home');assert.equal(result.title,'X');
});
test('discovery reads only the signed-in X switcher, not another user profile',async()=>{
  fixture();globalThis.window={};document.title='X';location.href='https://x.com/home';
  document.querySelector=()=>({getClientRects:()=>[{}],innerText:'User\n@TestUser'});
  const result=await drivePage('describe',{});assert.equal(result.account.id,'@testuser');
});
test('Weibo identity uses logged-in account configuration and rejects absent identity',async()=>{
  fixture({host:'weibo.com'});globalThis.window={$CONFIG:{uid:12345}};
  document.title='微博';location.href='https://weibo.com';
  assert.equal((await drivePage('describe',{})).account.id,'12345');
  window.$CONFIG={uid:0};assert.equal((await drivePage('describe',{})).account,null);
});
test('scheduled submit clicks once after matching text and unchanged schedule proof',async()=>{
  const count=fixture();const result=await drivePage('submit',job);assert.equal(count(),1);assert.match(result.message,/核对/);
});
test('extension transport reports concrete errors instead of an empty result',async()=>{
  const count=fixture({text:'最后一句'});
  const result=await drivePage('submit',{...job,transportResult:true});
  assert.match(result.error,/正文与计划不一致/);assert.equal(count(),0);
});
test('never use immediate Post button, wrong text, changed time, wrong host or expired time',async()=>{
  for(const [setup,change] of [[{button:'Post'},{}],[{text:'别的草稿'},{}],[{proof:'Changed'},{}],[{host:'example.com'},{}],[{}, {at:'2000-01-01T12:00:00+08:00'}],[{}, {proof:null}]]){
    const count=fixture(setup);await assert.rejects(()=>drivePage('submit',{...job,...change}));assert.equal(count(),0);
  }
});
test('ambiguous submit buttons stop without clicking',async()=>{
  const count=fixture();const original=document.querySelectorAll;document.querySelectorAll=s=>s.includes('tweetButton]')?[...original(s),...original(s)]:original(s);
  await assert.rejects(()=>drivePage('submit',job));assert.equal(count(),0);
});
test('Weibo requires unchanged date and matching time before its exact Send button',async()=>{
  let clicked=0;
  globalThis.location={hostname:'weibo.com',pathname:'/manage/schedule'};globalThis.getComputedStyle=()=>({visibility:'visible'});
  const el=data=>({...data,getClientRects:()=>[{}],getAttribute:()=>null});
  const date=el({value:'01/01/2030'}),editor=el({value:'测试正文'});
  const menu=n=>el({querySelector:()=>({innerText:String(n)})});
  const send=el({innerText:'发送',click:()=>clicked++}),immediate=el({innerText:'立即发送',click:()=>clicked++});
  const elements={textarea:[editor],input:[date],'.multiselect':[menu(12),menu(0)],button:[send,immediate]};
  globalThis.document={querySelectorAll:s=>elements[s]||[]};
  await drivePage('submit',{...job,platform:'weibo',proof:date.value});assert.equal(clicked,1);
  date.value='01/02/2030';await assert.rejects(()=>drivePage('submit',{...job,platform:'weibo',proof:'01/01/2030'}));assert.equal(clicked,1);
});
test('explicit Weibo scheduling limits return typed errors before any send',async()=>{
  for(const [text,code] of [['今日定时发布次数已用完','schedule_limit'],['定时发布需要开通会员','schedule_permission']]){
    fixture({host:'weibo.com'});location.pathname='/manage/schedule';
    document.querySelectorAll=selector=>selector.startsWith('[role=alert]')?[{innerText:text,getClientRects:()=>[{}]}]:[];
    const result=await drivePage('prepare',{...job,platform:'weibo',transportResult:true});
    assert.equal(result.code,code);assert.equal(result.notSubmitted,true);
    const afterSubmit=await drivePage('waitSaved',{...job,platform:'weibo',transportResult:true});
    assert.equal(afterSubmit.notSubmitted,false);
  }
});
test('hidden quota feedback and quota words in post text are not platform failures',async()=>{
  let clicks=0;
  fixture({host:'weibo.com'});location.pathname='/manage/schedule';
  const feedback='今日定时发布次数已用完';
  const el=data=>({...data,getClientRects:()=>[{}],getAttribute:()=>null});
  const elements={textarea:[el({value:feedback})],input:[el({value:'01/01/2030'})],'.multiselect':[el({querySelector:()=>({innerText:'12'})}),el({querySelector:()=>({innerText:'0'})})],button:[el({innerText:'发送',click:()=>clicks++})]};
  document.querySelectorAll=s=>s.startsWith('[role=alert]')?[{innerText:feedback,getClientRects:()=>[]},{innerText:feedback,getClientRects:()=>[{}]}]:elements[s]||[];
  const result=await drivePage('submit',{...job,text:feedback,platform:'weibo',proof:'01/01/2030',transportResult:true});
  assert.equal(result.error,undefined);assert.equal(clicks,1);
});
