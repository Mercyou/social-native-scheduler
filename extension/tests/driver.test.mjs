import test from 'node:test';
import assert from 'node:assert/strict';
import {drivePage} from '../page-driver.js';
function fixture({text='测试正文',button='Schedule',proof='Jan 1, 2030, 12:00 PM',host='x.com'}={}){
  let clicked=0;
  const el=data=>({...data,getClientRects:()=>[{}],getAttribute:()=>null});
  const elements={
    '[role=dialog] [data-testid=tweetTextarea_0]':el({isContentEditable:true,innerText:text}),
    '[role=dialog] [data-testid=scheduledTweetIndicator]':el({innerText:proof}),
    '[role=dialog] [data-testid=tweetButton]':el({innerText:button,click:()=>clicked++})
  };
  globalThis.document={querySelectorAll:selector=>elements[selector]?[elements[selector]]:[]};
  globalThis.location={hostname:host};globalThis.getComputedStyle=()=>({visibility:'visible'});
  return ()=>clicked;
}
const job={platform:'x',text:'测试正文',at:'2030-01-01T12:00:00+08:00',proof:'Jan 1, 2030, 12:00 PM'};
test('scheduled submit clicks once after matching text and unchanged schedule proof',async()=>{
  const count=fixture();const result=await drivePage('submit',job);assert.equal(count(),1);assert.match(result.message,/核对/);
});
test('never use immediate Post button, wrong text, changed time, wrong host or expired time',async()=>{
  for(const [setup,change] of [[{button:'Post'},{}],[{text:'别的草稿'},{}],[{proof:'Changed'},{}],[{host:'example.com'},{}],[{}, {at:'2000-01-01T12:00:00+08:00'}],[{}, {proof:null}]]){
    const count=fixture(setup);await assert.rejects(()=>drivePage('submit',{...job,...change}));assert.equal(count(),0);
  }
});
test('ambiguous submit buttons stop without clicking',async()=>{
  const count=fixture();const original=document.querySelectorAll;document.querySelectorAll=s=>s.endsWith('tweetButton]')?[...original(s),...original(s)]:original(s);
  await assert.rejects(()=>drivePage('submit',job));assert.equal(count(),0);
});
test('Weibo requires unchanged date and matching time before its exact Send button',async()=>{
  let clicked=0;
  globalThis.location={hostname:'me.weibo.com'};globalThis.getComputedStyle=()=>({visibility:'visible'});
  const el=data=>({...data,getClientRects:()=>[{}],getAttribute:()=>null});
  const date=el({value:'01/01/2030'}),editor=el({value:'测试正文'});
  const menu=n=>el({querySelector:()=>({innerText:String(n)})});
  const send=el({innerText:'发送',click:()=>clicked++}),immediate=el({innerText:'立即发送',click:()=>clicked++});
  const elements={textarea:[editor],input:[date],'.multiselect':[menu(12),menu(0)],button:[send,immediate]};
  globalThis.document={querySelectorAll:s=>elements[s]||[]};
  await drivePage('submit',{...job,platform:'weibo',proof:date.value});assert.equal(clicked,1);
  date.value='01/02/2030';await assert.rejects(()=>drivePage('submit',{...job,platform:'weibo',proof:'01/01/2030'}));assert.equal(clicked,1);
});
