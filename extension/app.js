import {createPlan,statusLabels,canPrepare,canSubmit} from './planner.js';
import {drivePage} from './page-driver.js';
const $ = id => document.getElementById(id);
let jobs=[], selected=null, busy=false;
const key='nativeSchedulerV1';
const notice = text => { $('notice').textContent=text; };
const current = () => jobs.find(j=>j.id===selected);
async function persist(){await chrome.storage.local.set({[key]:jobs});}
function render(){
  $('jobs').replaceChildren();
  for(const job of jobs){const b=document.createElement('button');b.className='job'+(selected===job.id?' selected':'')+(job.status==='verified'?' verified':'');b.disabled=busy;b.textContent=`${job.sequence} · ${job.platform==='x'?'X':'微博'} · ${job.at.slice(5,16).replace('T',' ')}   ${statusLabels[job.status]||job.status}`;b.onclick=()=>{selected=job.id;$('checked').checked=false;render();};$('jobs').append(b);}
  const j=current();$('current').hidden=!j;
  if(j){$('currentText').textContent=j.text;$('currentTime').textContent=j.at.replace('T',' ').replace(':00+08:00','')+' · 北京时间';$('account').value=j.account||'';$('prepare').disabled=busy||!canPrepare(j);$('submit').disabled=busy||!canSubmit(j);$('verify').disabled=busy||!['submitting','needs_review'].includes(j.status);$('reset').disabled=busy||j.status==='verified';}
  for(const id of ['plan','refresh','openX','openWeibo','list','export'])$(id).disabled=busy;
  if(jobs.length&&jobs.every(j=>j.status==='verified'))notice('全部条目均已由你在平台列表核对。已保存的任务由平台发送，可以关闭电脑。');
}
async function exclusive(fn){if(busy)return;await navigator.locks.request('native-scheduler-operation',{ifAvailable:true},async lock=>{
  if(!lock){notice('另一个助手窗口正在操作，请稍后再试');return;}
  const typedAccount=$('account').value;
  const fresh=await chrome.storage.local.get(key);jobs=Array.isArray(fresh[key])?fresh[key]:jobs;
  busy=true;render();$('account').value=typedAccount;
  try{await fn();}catch(e){notice(e.message);}finally{busy=false;render();}
});}
async function refreshTargets(){
  const previous=$('target').value;$('target').replaceChildren();
  const tabs=await chrome.tabs.query({});
  for(const tab of tabs){if(!tab.url||!/^https:\/\/(x\.com|([\w-]+\.)*weibo\.com)\//.test(tab.url))continue;
    try{const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'MAIN',func:drivePage,args:['describe',{}]});for(const frame of frames){if(!frame.result||!/^https:\/\/(x\.com|([\w-]+\.)*weibo\.com)\//.test(frame.result.url))continue;const o=document.createElement('option');o.value=JSON.stringify({tabId:tab.id,frameId:frame.frameId});o.textContent=`${frame.result.editor?'[有编辑器] ':''}${frame.result.title||'嵌入页'} · ${new URL(frame.result.url).hostname} · 框架 ${frame.frameId}`;$('target').append(o);}}
    catch { /* A tab navigating or a frame outside host permissions may be unavailable. */ }
  }
  if([...$('target').options].some(o=>o.value===previous))$('target').value=previous;
  if(!$('target').options.length)notice('未找到已打开的平台网页。先打开平台并登录，再刷新列表。');
}
function target(){if(!$('target').value)throw new Error('请选择平台网页');return JSON.parse($('target').value);}
async function drive(action,j,t){const result=await chrome.scripting.executeScript({target:{tabId:t.tabId,frameIds:[t.frameId]},world:'MAIN',func:drivePage,args:[action,j]});if(!result[0]?.result)throw new Error('网页操作没有返回结果，请检查平台页面');return result[0].result;}
async function open(platform,list=false){const urls={x:list?'https://x.com/compose/post/unsent/scheduled':'https://x.com/home',weibo:'https://me.weibo.com/content/timer'};const tab=await chrome.tabs.create({url:urls[platform]});notice('请在新打开的平台页确认账号，再回助手刷新网页列表。');return tab;}
$('plan').onclick=()=>exclusive(async()=>{
  if(jobs.length&&jobs.some(j=>!['planned','verified'].includes(j.status)))throw new Error('旧计划仍有填写中或结果待核对条目，请先处理并导出记录');
  if(jobs.length&&!confirm('用新计划替换本地清单？这不会取消平台已保存的帖子。请先导出旧记录。'))return;
  const next=createPlan({texts:$('texts').value.split(/^\s*---\s*$/m).map(t=>t.trim()).filter(Boolean),platforms:['x','weibo'].filter(p=>$(p).checked),start:$('start').value,intervalMinutes:Number($('interval').value)});
  jobs=next;selected=jobs[0].id;await persist();notice(`生成 ${jobs.length} 条平台任务。尚未提交到平台。`);
});
$('refresh').onclick=()=>exclusive(refreshTargets);
$('openX').onclick=()=>exclusive(()=>open('x'));
$('openWeibo').onclick=()=>exclusive(()=>open('weibo'));
$('prepare').onclick=()=>exclusive(async()=>{
  const j=current();if(!j||!canPrepare(j))throw new Error('该条目需要先核对结果');const account=$('account').value.trim();if(!account)throw new Error('请先在网页确认账号，并填写账号名');
  const t=target();j.status='preparing';j.account=account;j.target=t;j.proof=null;await persist();
  const r=await drive('prepare',j,t);j.status='prepared';j.proof=r.proof;await persist();notice(r.message);await chrome.tabs.update(t.tabId,{active:true});
});
$('submit').onclick=()=>exclusive(async()=>{
  const j=current();if(!j||!canSubmit(j))throw new Error('请先填写当前条目');const t=target();if(t.tabId!==j.target?.tabId||t.frameId!==j.target?.frameId)throw new Error('操作网页已改变，请重新填写');
  if(!confirm(`请确认平台账号为 ${j.account}，正文完全一致，时间为 ${j.at.slice(0,16).replace('T',' ')} 北京时间。\n已在网页逐项核对后，点击确定保存到平台。`))return;
  j.status='submitting';j.attemptedAt=new Date().toISOString();await persist();
  const r=await drive('submit',j,t);j.status='needs_review';await persist();notice(r.message);$('checked').checked=false;
});
$('list').onclick=()=>exclusive(async()=>{const j=current();if(!j)throw new Error('请选择条目');await open(j.platform,true);});
$('verify').onclick=()=>exclusive(async()=>{const j=current();if(!j||!['submitting','needs_review'].includes(j.status)||!$('checked').checked)throw new Error('先在平台列表核对完整正文和日期时间，再勾选核对结果');j.status='verified';j.verifiedAt=new Date().toISOString();j.verification='human-platform-list';await persist();$('checked').checked=false;notice('已记录人工核对结果，可选择下一条。');});
$('reset').onclick=()=>exclusive(async()=>{const j=current();if(!j||j.status==='verified')throw new Error('已核验条目不能在这里重新提交');if(!confirm('请先在待发布和已发布列表检查。确认平台没有保存这条帖子，才重置。继续？'))return;j.status='planned';j.proof=null;j.target=null;await persist();notice('已重置本地状态；没有删除或取消平台帖子。');});
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,timezone:'Asia/Shanghai',jobs},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='native-schedule-record.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
const data=await chrome.storage.local.get(key);jobs=Array.isArray(data[key])?data[key]:[];selected=jobs.find(j=>j.status!=='verified')?.id||jobs[0]?.id;const defaultTime=new Date(Date.now()+3600000+28800000).toISOString().slice(0,16);$('start').value=defaultTime;render();await refreshTargets();
