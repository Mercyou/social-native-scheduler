// This self-contained function runs in the selected page's MAIN world.
// No credentials, page fetches, hidden APIs, or immediate-post fallbacks.
export async function drivePage(action, job) {
  let submissionAttempted=action==='waitSaved';
  try {
  const visible = e => !!e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const checkScheduleAccess=()=>{
    if(job.platform!=='weibo')return;
    const feedback=[...document.querySelectorAll('[role=alert],[role=dialog],.woo-modal-wrap,.woo-toast-main,.el-message,.el-dialog,.ant-message-notice,.ant-modal,.W_layer')].filter(visible);
    for(const node of feedback){
      let text=node.innerText||'';
      for(const line of (job.text||'').split('\n').filter(Boolean))text=text.replaceAll(line,'');
      const scheduling=/(定时|预约)/.test(text);
      const quota=scheduling&&/(?:次数|额度|上限|限额)[\s\S]{0,30}(?:用完|不足|已满|达到|耗尽|超出|限制)|(?:用完|不足|已满|达到|耗尽|超出)[\s\S]{0,30}(?:次数|额度|上限|限额)|(?:每天|每日|当日|今日)[\s\S]{0,30}(?:只能|最多|仅能|限制)/.test(text);
      const permission=scheduling&&/(?:仅限|仅对|需要|需开通|请开通|请升级)[\s\S]{0,20}(?:会员|VIP|权限)|非会员|暂无权限|无权限|没有权限|权限不足|会员专享/.test(text);
      if(quota||permission)throw Object.assign(new Error(text.trim().slice(0,400)),{code:quota?'schedule_limit':'schedule_permission'});
    }
  };
  if (action==='describe') {
    let account=null;
    if(location.hostname==='x.com') {
      const switcher=document.querySelector('[data-testid=SideNav_AccountSwitcher_Button]');
      const handle=visible(switcher)?switcher.innerText.match(/@[A-Za-z0-9_]+/):null;
      if(handle)account={id:handle[0].toLowerCase(),label:switcher.innerText.trim().replace(/\n+/g,' '),platform:'x'};
    } else if(/(^|\.)weibo\.com$/.test(location.hostname)) {
      const uid=String(window.$CONFIG?.uid||window.config?.uid||'');
      if(/^\d+$/.test(uid)&&uid!=='0')account={id:uid,label:window.$CONFIG?.nick||window.config?.screen_name||`微博账号 ${uid}`,platform:'weibo'};
    }
    return {url:location.href,title:document.title,account,editor:!![...document.querySelectorAll('textarea,[contenteditable=true]')].find(visible)};
  }
  const one = (selector, scope=document) => {const els=[...scope.querySelectorAll(selector)].filter(visible); if(els.length!==1) throw new Error('网页控件不存在或不唯一：'+selector); return els[0];};
  const wait = async fn => {for(let i=0;i<40;i++){checkScheduleAccess();const r=fn();if(r)return r;await new Promise(r=>setTimeout(r,150));}throw new Error('页面未准备好，请检查登录、弹窗和平台提示');};
  const checkDeadline=()=>{if(job.operationDeadline&&Date.now()>job.operationDeadline)throw new Error('操作已超时，停止后续网页修改');};
  const click = e => {checkDeadline();if(!visible(e)||e.disabled||e.getAttribute('aria-disabled')==='true')throw new Error('控件不可用');e.click();};
  const normalize = text => text.replace(/\r\n/g,'\n').trim();
  const set = (e,value) => {
    checkDeadline();
    if(e.isContentEditable){
      e.focus();const selection=getSelection(),range=document.createRange();range.selectNodeContents(e);selection.removeAllRanges();selection.addRange(range);
      const transfer=new DataTransfer();transfer.setData('text/plain',value);
      const paste=new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true});
      const accepted=e.dispatchEvent(paste);
      // Draft.js handles the paste as one editor transaction. Only use native
      // insertion when the editor did not intercept it. Do not forge input data.
      if(accepted)document.execCommand('insertText',false,value);
    }
    else {const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur();}
  };
  const read = e => normalize(e.isContentEditable?e.innerText:e.value);
  const parts = job.at.slice(0,16).split(/[-T:]/).map(Number);
  const [year,month,day,hour,minute]=parts;
  const pad = n => String(n).padStart(2,'0');
  const buttons = (text,scope=document) => [...scope.querySelectorAll('button')].filter(e=>visible(e)&&text.test(e.innerText.trim()));
  const uniqueButton = (re,scope) => {const matches=buttons(re,scope);if(matches.length!==1)throw new Error('没有唯一的定时控件：'+re);return matches[0];};
  if(Date.parse(job.at)<=Date.now()+60000) throw new Error('计划时间已过或距离发送不足一分钟，请修改计划');
  checkScheduleAccess();
  if(action==='waitSaved'){
    await wait(()=>{
      const editors=[...document.querySelectorAll(job.platform==='x'?'[data-testid=tweetTextarea_0]':'textarea')].filter(visible);
      return !editors.length||editors.every(e=>read(e)==='');
    });
    return {message:'编辑器已关闭，服务器结果待核对'};
  }
  if(job.platform==='x') {
    if(location.hostname!=='x.com')throw new Error('请选择 X 网页');
    if(action==='openEditor'){
      if(![...document.querySelectorAll('[data-testid=tweetTextarea_0]')].some(visible))click(one('[data-testid=SideNav_NewTweet_Button]'));
      return {message:'正在打开编辑器'};
    }
    if(action==='prepare') {
      await wait(()=>[...document.querySelectorAll('[data-testid=tweetTextarea_0]')].some(visible));
      const editor=one('[data-testid=tweetTextarea_0]');
      if(read(editor)&&read(editor)!==normalize(job.text)&&!job.text.split('\n').map(normalize).includes(read(editor)))throw new Error('编辑器已有其他正文，请先处理草稿');
      set(editor,job.text);
      await wait(()=>read(editor)===normalize(job.text));
      await new Promise(r=>setTimeout(r,250));
      if(read(editor)!==normalize(job.text))throw new Error('X 未保留完整正文，停止保存');
      click(one('[data-testid=scheduleOption]'));
      await wait(()=>[...document.querySelectorAll('select')].filter(visible).length>=6);
      const findSelect = aliases => {const labels=[...document.querySelectorAll('label')].filter(e=>visible(e)&&aliases.includes(e.innerText.trim()));if(labels.length!==1)throw new Error('日期标签变化，请在平台手动设置');const l=labels[0];const s=l.control||document.getElementById(l.htmlFor)||document.getElementById(l.id.replace('_LABEL',''))||l.querySelector('select');if(!s||s.tagName!=='SELECT')throw new Error('日期选择器变化');return s;};
      const settings=[[['Year','年'],year],[['Month','月'],month],[['Day','日'],day],[['Hour','小时','时'],hour%12||12],[['Minute','分钟','分'],minute],[['AM/PM','上午/下午'],hour>=12?'pm':'am']];
      for(const [labels,v] of settings){const s=findSelect(labels);const o=[...s.options].find(o=>String(o.value).toLowerCase()===String(v))||[...s.options].find(o=>o.text.trim().toLowerCase()===String(v));if(!o)throw new Error('日期选项不存在，请在平台手动设置');set(s,o.value);await new Promise(r=>setTimeout(r,100));if(s.value!==o.value)throw new Error('时间没有选中');}
      for(const [labels,v] of settings){const s=findSelect(labels);const selected=s.selectedOptions[0];if(s.value.toLowerCase()!==String(v)&&selected?.text.trim().toLowerCase()!==String(v))throw new Error('日期控件发生变化，已停止');}
      const body=document.body.innerText;
      if(!/China Standard Time|中国标准时间|北京时间/.test(body))throw new Error('X 当前时区无法确认为北京时间，请先在网页确认');
      click(one('[data-testid=scheduledConfirmationPrimaryAction]'));
      await wait(()=>[...document.querySelectorAll('[data-testid=scheduledTweetIndicator]')].some(visible));
      return {proof:one('[data-testid=scheduledTweetIndicator]').innerText,message:'正文与日期控件已填写。请核对网页日期、AM/PM、北京时间，再保存。'};
    }
    if(action==='submit') {
      const editor=one('[data-testid=tweetTextarea_0]');if(read(editor)!==normalize(job.text))throw new Error('正文与计划不一致');
      if(!job.proof||one('[data-testid=scheduledTweetIndicator]').innerText!==job.proof)throw new Error('定时时间提示发生变化，请重新填写并核对');
      const b=one('[data-testid=tweetButton], [data-testid=tweetButtonInline]');if(!/^(Schedule|定时|定时发送|定时发布)$/.test(b.innerText.trim()))throw new Error('按钮不是定时保存，已停止');
      submissionAttempted=true;click(b);return {message:'已点击定时保存。请在 X 待发布列表逐条核对正文和时间。'};
    }
  } else {
    if(!/(^|\.)weibo\.com$/.test(location.hostname))throw new Error('请选择微博网页或定时页框架');
    if(!/^\/manage\/schedule\/?$/.test(location.pathname))throw new Error('当前是微博普通页面，请使用定时管理页；已停止，避免立即发送');
    const getEditor = () => {
      const candidates=[...document.querySelectorAll('textarea')].filter(visible);
      if(candidates.length!==1)throw new Error('请选择定时编辑器所在框架，并关闭其他草稿弹窗');
      return candidates[0];
    };
    if(action==='prepare') {
      if(![...document.querySelectorAll('textarea')].some(visible))click(uniqueButton(/^发布定时微博$/));
      await wait(()=>[...document.querySelectorAll('textarea')].some(visible));
      const editor=getEditor();if(read(editor)&&read(editor)!==normalize(job.text))throw new Error('编辑器已有其他正文，请先处理草稿');set(editor,job.text);if(read(editor)!==normalize(job.text))throw new Error('正文填入失败');
      const locateDates=()=>{
        const named=[...document.querySelectorAll('.wbpro-datapicker input')].filter(visible);
        if(named.length)return named;
        return [...document.querySelectorAll('input')].filter(e=>visible(e)&&(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/.test(e.value||e.getAttribute('value')||'')||e.type==='date'));
      };
      await wait(()=>locateDates().length===1);
      const dates=locateDates();
      if(dates.length!==1)throw new Error('微博定时编辑器的日期控件未加载，请刷新平台页面后继续');
      const date=dates[0];const value=date.type==='date'||/^\d{4}-/.test(date.value)?`${year}-${pad(month)}-${pad(day)}`:/^\d{4}\//.test(date.value)?`${year}/${pad(month)}/${pad(day)}`:`${pad(month)}/${pad(day)}/${year}`;
      if(date.value!==value){set(date,value);await new Promise(r=>setTimeout(r,250));if(date.value!==value)throw new Error('日期未生效，请在平台手动选择');}
      for(const [index,val,suffix] of [[0,hour,'时'],[1,minute,'分']]) {
        const menus=[...document.querySelectorAll('.multiselect')].filter(visible);if(menus.length!==2)throw new Error('时间控件变化，请在平台手动设置');const menu=menus[index];
        const trigger=menu.querySelector('.multiselect__select');if(!visible(trigger))throw new Error('时间下拉入口不可用');
        checkDeadline();trigger.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));
        await wait(()=>[...menu.querySelectorAll('.multiselect__option')].some(visible));
        const options=[...menu.querySelectorAll('.multiselect__option')].filter(e=>visible(e)&&new RegExp('^0?'+val+'\\s*'+suffix+'$').test(e.innerText.trim()));if(options.length!==1)throw new Error('时间选项不存在');click(options[0]);await new Promise(r=>setTimeout(r,150));const shown=menu.querySelector('.multiselect__single')?.innerText;if(parseInt(shown)!==val)throw new Error('时间未生效');
      }
      return {proof:date.value,message:'正文和时间已填写，请在微博网页再次确认年月日、小时和分钟。'};
    }
    if(action==='submit') {
      if(read(getEditor())!==normalize(job.text))throw new Error('正文与计划不一致');
      if(!job.proof||![...document.querySelectorAll('input')].some(e=>visible(e)&&e.value===job.proof))throw new Error('日期发生变化，请重新填写并核对');
      const menus=[...document.querySelectorAll('.multiselect')].filter(visible);if(menus.length!==2||parseInt(menus[0].querySelector('.multiselect__single')?.innerText)!==hour||parseInt(menus[1].querySelector('.multiselect__single')?.innerText)!==minute)throw new Error('网页时间与计划不一致');
      const send=uniqueButton(/^发送$/);checkScheduleAccess();submissionAttempted=true;click(send);return {message:'已点击定时编辑器的发送。请在待发布列表核对正文和完整日期时间。'};
    }
  }
  throw new Error('不支持的操作');
  }catch(error){if(job?.transportResult)return {error:error.message,code:error.code||'',notSubmitted:!submissionAttempted};throw error;}
}
