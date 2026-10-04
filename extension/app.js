import {createPlan,splitTexts,statusLabels,canPrepare,canSubmit} from './planner.js';
import {drivePage} from './page-driver.js';
import {withTimeout} from './timeout.js';
import {pendingBatch,runSequential} from './batch.js';
const $ = id => document.getElementById(id);
let jobs=[], selected=null, busy=false;
const targets=new Map();
const key='nativeSchedulerV1';
const notice = text => { $('notice').textContent=text; };
const current = () => jobs.find(j=>j.id===selected);
async function persist(){await chrome.storage.local.set({[key]:jobs});}
function render(){
  $('jobs').replaceChildren();
  for(const job of jobs){const b=document.createElement('button');b.className='job'+(selected===job.id?' selected':'')+(job.status==='verified'?' verified':'');b.disabled=busy;b.textContent=`${job.sequence} · ${job.platform==='x'?'X':'微博'} · ${job.at.slice(5,16).replace('T',' ')}   ${statusLabels[job.status]||job.status}`;b.onclick=()=>{selected=job.id;$('checked').checked=false;render();};$('jobs').append(b);}
  const j=current();$('current').hidden=!j;
  if(j){$('currentText').textContent=j.text;$('currentTime').textContent=j.at.replace('T',' ').replace(':00+08:00','')+' · 北京时间';$('prepare').disabled=busy||!canPrepare(j);$('submit').disabled=busy||!canSubmit(j);$('sync').disabled=busy||!canPrepare(j);$('verify').disabled=busy||!['submitting','needs_review'].includes(j.status);$('reset').disabled=busy||j.status==='verified';}
  for(const id of ['plan','refresh','openX','openWeibo','list','export','batch','checkAll','verifyAll'])$(id).disabled=busy;
  if(jobs.length&&jobs.every(j=>j.status==='verified'))notice('全部条目均已由你在平台列表核对。已保存的任务由平台发送，可以关闭电脑。');
}
async function exclusive(fn){if(busy)return;await navigator.locks.request('native-scheduler-operation',{ifAvailable:true},async lock=>{
  if(!lock){notice('另一个助手窗口正在操作，请稍后再试');return;}
  const fresh=await chrome.storage.local.get(key);jobs=Array.isArray(fresh[key])?fresh[key]:jobs;
  busy=true;render();
  try{await fn();}catch(e){notice(e.message);}finally{busy=false;render();}
});}
async function refreshTargets(){
  const previous=$('target').value;$('target').replaceChildren();targets.clear();
  const tabs=await chrome.tabs.query({});
  const failures=[];
  for(const tab of tabs){if(!tab.url||!/^https:\/\/(x\.com|([\w-]+\.)*weibo\.com)\//.test(tab.url))continue;
    try{
      let frames;
      try{frames=await withTimeout(chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'MAIN',func:drivePage,args:['describe',{}]}),8000);}
      catch(e){failures.push(`${new URL(tab.url).hostname} 的嵌入页：${e.message}`);frames=await withTimeout(chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',func:drivePage,args:['describe',{}]}),8000);}
      const own=frames.find(f=>f.result?.account);
      for(const frame of frames){if(!frame.result){failures.push(`${tab.title||tab.url}：${frame.error?.message||'页面检查未返回结果，请刷新平台页后重试'}`);continue;}if(!/^https:\/\/(x\.com|([\w-]+\.)*weibo\.com)\//.test(frame.result.url))continue;const o=document.createElement('option');o.value=JSON.stringify({tabId:tab.id,frameId:frame.frameId});const identity=frame.result.account?frame:own;targets.set(o.value,{account:identity?.result.account,identityFrameId:identity?.frameId,identityTabId:tab.id,url:frame.result.url,incognito:!!tab.incognito,platform:new URL(frame.result.url).hostname==='x.com'?'x':'weibo'});o.textContent=`${identity?.result.account?.label||'账号未识别'} · ${frame.result.editor?'编辑器 · ':''}${frame.result.title||'嵌入页'}`;$('target').append(o);}
    }
    catch(e){failures.push(`${tab.title||tab.url}：${e.message}`);}
  }
  // Creator frames may lack account metadata. Use a live home page in the same
  // browser context only when every detected identity agrees on one account.
  for(const option of $('target').options){const info=targets.get(option.value);if(info.account||info.platform!=='weibo')continue;
    const candidates=[...targets.values()].filter(v=>v.account?.platform==='weibo'&&v.incognito===info.incognito);
    if(new Set(candidates.map(v=>v.account.id)).size===1){const source=candidates[0];info.account=source.account;info.identityTabId=source.identityTabId;info.identityFrameId=source.identityFrameId;option.textContent=option.textContent.replace('账号未识别',source.account.label);}
  }
  if([...$('target').options].some(o=>o.value===previous))$('target').value=previous;
  if(failures.length)notice('部分网页无法连接：\n'+failures.join('\n')+'\n请在扩展详情里允许访问对应网站，再刷新平台页和此列表。');
  else if(!$('target').options.length)notice('未找到已打开的平台网页。先打开平台并登录，再刷新列表。');
  else notice(`已找到 ${$('target').options.length} 个可操作网页 / 框架。请选择对应平台。`);
}
function target(){if(!$('target').value)throw new Error('请选择平台网页');return JSON.parse($('target').value);}
async function selectedAccount(j,t){
  const info=targets.get($('target').value);
  if(!info?.account)throw new Error('此页面未识别到登录账号，请打开平台首页并登录后刷新列表');
  const rows=await withTimeout(chrome.scripting.executeScript({target:{tabId:info.identityTabId,frameIds:[info.identityFrameId]},world:'MAIN',func:drivePage,args:['describe',{}]}),8000);
  const live=rows[0]?.result?.account;
  if(!live||live.platform!==j.platform||live.id!==info.account.id)throw new Error('账号已变化或平台不匹配，请刷新账号列表');
  return live;
}
async function drive(action,j,t){
  await chrome.tabs.update(t.tabId,{active:true});
  if(action==='prepare'&&j.platform==='x'){
    await withTimeout(chrome.scripting.executeScript({target:{tabId:t.tabId,frameIds:[t.frameId]},world:'MAIN',func:drivePage,args:['openEditor',{...j,operationDeadline:Date.now()+5000}]}),6000);
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  const operationJob={...j,transportResult:true,operationDeadline:Date.now()+14000};
  const result=await withTimeout(chrome.scripting.executeScript({target:{tabId:t.tabId,frameIds:[t.frameId]},world:'MAIN',func:drivePage,args:[action,operationJob]}));
  if(!result[0]?.result)throw new Error(result[0]?.error?.message||'网页操作没有返回结果，请检查平台页面');
  if(result[0].result.error)throw new Error(result[0].result.error);
  return result[0].result;
}
async function open(platform,list=false){const urls={x:list?'https://x.com/compose/post/unsent/scheduled':'https://x.com/home',weibo:'https://weibo.com/manage/schedule?type=0&hasnav=0'};if(platform==='weibo'&&!list)await chrome.tabs.create({url:'https://weibo.com',active:false});const tab=await chrome.tabs.create({url:urls[platform]});notice('登录后回助手刷新账号列表即可选择。');return tab;}
$('plan').onclick=()=>exclusive(async()=>{
  if(jobs.length&&jobs.some(j=>!['planned','verified'].includes(j.status)))throw new Error('旧计划仍有填写中或结果待核对条目，请先处理并导出记录');
  if(jobs.length&&!confirm('用新计划替换本地清单？这不会取消平台已保存的帖子。请先导出旧记录。'))return;
  const next=createPlan({texts:splitTexts($('texts').value),platforms:['x','weibo'].filter(p=>$(p).checked),start:$('start').value,intervalMinutes:Number($('interval').value)});
  jobs=next;selected=jobs[0].id;await persist();notice(`生成 ${jobs.length} 条平台任务。尚未提交到平台。`);
});
$('refresh').onclick=()=>exclusive(refreshTargets);
$('openX').onclick=()=>exclusive(()=>open('x'));
$('openWeibo').onclick=()=>exclusive(()=>open('weibo'));
async function syncGroup(group){
  if(group.some(j=>j.platform==='weibo')&&![...targets.values()].some(info=>info.platform==='weibo'&&new URL(info.url).pathname==='/manage/schedule')){await chrome.tabs.create({url:'https://weibo.com/manage/schedule?type=0&hasnav=0'});await new Promise(resolve=>setTimeout(resolve,1500));await refreshTargets();}
  // Resolve all destinations and identities before any submission.
  const resolved=[];
  for(const j of group){
    const options=[...$('target').options].filter(o=>targets.get(o.value)?.account?.platform===j.platform&&(j.platform!=='weibo'||new URL(targets.get(o.value).url).pathname==='/manage/schedule'));
    if(!options.length)throw new Error(`${j.platform} 未找到登录账号，请刷新账号列表`);
    const preferred=options.find(o=>o.value===$('target').value);
    if(!preferred&&new Set(options.map(o=>targets.get(o.value).account.id)).size!==1)throw new Error(`${j.platform} 有多个账号，请先选择目标账号`);
    const option=preferred||options.find(o=>/编辑器/.test(o.textContent))||options.find(o=>/定时|timer/i.test(o.textContent))||options[0];
    $('target').value=option.value;const t=target(),account=await selectedAccount(j,t);resolved.push({j,t,account,option});
  }
  await runSequential(resolved,async({j,t,account,option})=>{
    $('target').value=option.value;selected=j.id;notice(`正在同步到 ${account.label}：填写正文与时间…`);
    j.status='preparing';j.account=account.label;j.accountId=account.id;j.target=t;j.proof=null;await persist();
    const prepared=await drive('prepare',j,t);j.proof=prepared.proof;j.status='prepared';await persist();
    const live=await selectedAccount(j,t);if(live.id!==j.accountId)throw new Error('账号已变化，停止同步');
    j.status='submitting';j.attemptedAt=new Date().toISOString();await persist();notice(`正在同步到 ${account.label}：保存原生定时…`);
    await drive('submit',j,t);
    await drive('waitSaved',j,t);j.status='needs_review';await persist();
  },(done,total)=>notice(`已导入 ${done}/${total} 条平台任务，结果待统一检查。`));
  notice(`本批 ${resolved.length} 条已点击定时保存并退出编辑器。点击“启动检查”，核对平台列表。`);
}
$('sync').onclick=()=>exclusive(async()=>{
  const chosen=current();if(!chosen)throw new Error('请选择一条任务');
  const group=jobs.filter(j=>j.sequence===chosen.sequence&&j.status==='planned');
  if(!group.length)throw new Error('此条已操作过，请先核对平台结果');
  await syncGroup(group);
});
$('batch').onclick=()=>exclusive(async()=>{
  const pending=pendingBatch(jobs);
  await refreshTargets();
  await syncGroup(pending);
});
$('checkAll').onclick=()=>exclusive(async()=>{
  const review=jobs.filter(j=>['needs_review','submitting'].includes(j.status));
  if(!review.length)throw new Error('还没有待检查的提交结果');
  for(const platform of new Set(review.map(j=>j.platform)))await open(platform,true);
  $('batchReview').hidden=false;$('allChecked').checked=false;
  $('reviewRows').replaceChildren();
  for(const j of review){const row=document.createElement('p');row.textContent=`${j.platform} · ${j.at.slice(0,16).replace('T',' ')} 北京时间\n${j.text}`;row.style.whiteSpace='pre-wrap';$('reviewRows').append(row);}
  notice(`已打开平台列表。按下方清单统一核对 ${review.length} 条的正文和完整时间。`);
});
$('verifyAll').onclick=()=>exclusive(async()=>{
  if(!$('allChecked').checked)throw new Error('先在平台列表核对本批全部条目，再勾选');
  const review=jobs.filter(j=>['needs_review','submitting'].includes(j.status));
  if(!review.length)throw new Error('没有待核对条目');
  for(const j of review){j.status='verified';j.verifiedAt=new Date().toISOString();j.verification='human-platform-list-batch';}
  await persist();$('batchReview').hidden=true;notice(`已记录 ${review.length} 条的整批人工核对结果。`);
});
$('prepare').onclick=()=>exclusive(async()=>{
  const j=current();if(!j||!canPrepare(j))throw new Error('该条目需要先核对结果');
  const t=target(),account=await selectedAccount(j,t);j.status='preparing';j.account=account.label;j.accountId=account.id;j.target=t;j.proof=null;await persist();
  const r=await drive('prepare',j,t);j.status='prepared';j.proof=r.proof;await persist();notice(r.message);await chrome.tabs.update(t.tabId,{active:true});
});
$('submit').onclick=()=>exclusive(async()=>{
  const j=current();if(!j||!canSubmit(j))throw new Error('请先填写当前条目');const t=target();if(t.tabId!==j.target?.tabId||t.frameId!==j.target?.frameId)throw new Error('操作网页已改变，请重新填写');
  const live=await selectedAccount(j,t);if(!j.accountId||live.id!==j.accountId)throw new Error('账号与填写时不同，请重新填写');
  j.status='submitting';j.attemptedAt=new Date().toISOString();await persist();
  const r=await drive('submit',j,t);j.status='needs_review';await persist();notice(r.message);$('checked').checked=false;
});
$('list').onclick=()=>exclusive(async()=>{const j=current();if(!j)throw new Error('请选择条目');await open(j.platform,true);});
$('verify').onclick=()=>exclusive(async()=>{const j=current();if(!j||!['submitting','needs_review'].includes(j.status)||!$('checked').checked)throw new Error('先在平台列表核对完整正文和日期时间，再勾选核对结果');j.status='verified';j.verifiedAt=new Date().toISOString();j.verification='human-platform-list';await persist();$('checked').checked=false;notice('已记录人工核对结果，可选择下一条。');});
$('reset').onclick=()=>exclusive(async()=>{const j=current();if(!j||j.status==='verified')throw new Error('已核验条目不能在这里重新提交');if(!confirm('请先在待发布和已发布列表检查。确认平台没有保存这条帖子，才重置。继续？'))return;j.status='planned';j.proof=null;j.target=null;await persist();notice('已重置本地状态；没有删除或取消平台帖子。');});
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,timezone:'Asia/Shanghai',jobs},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='native-schedule-record.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
const data=await chrome.storage.local.get(key);jobs=Array.isArray(data[key])?data[key]:[];selected=jobs.find(j=>j.status!=='verified')?.id||jobs[0]?.id;const defaultTime=new Date(Date.now()+3600000+28800000).toISOString().slice(0,16);$('start').value=defaultTime;render();await refreshTargets();
