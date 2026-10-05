export function pendingBatch(jobs) {
  if(!jobs.length)throw new Error('请先导入文案并生成时间表');
  const blocked=new Set(jobs.filter(j=>['preparing','prepared','submitting'].includes(j.status)||j.needsResultCheck).map(j=>j.platform));
  const pending=jobs.filter(j=>j.status==='planned'&&!blocked.has(j.platform));
  if(!pending.length&&jobs.some(j=>j.status==='planned'))throw new Error('剩余平台有中断或结果不明的条目。可跳过未提交的条目；已提交的先检查平台结果。');
  if(!pending.length)throw new Error('没有待导入条目，请启动检查');
  return pending;
}
export function skipJob(job,reason='用户跳过此条') {
  if(!job||!['planned','preparing','prepared','submitting','needs_review'].includes(job.status))throw new Error('此条不能跳过');
  job.needsResultCheck=['submitting','needs_review'].includes(job.status);
  job.skippedFrom=job.status;job.status='skipped';job.skipReason=reason;job.skippedAt=new Date().toISOString();
  return job;
}
export function isPlatformLimit(error) {return ['schedule_limit','schedule_permission'].includes(error?.code);}
export async function runPlatformBatch(items,run,{onError,onSkip,progress}={}) {
  const blocked=new Map();let done=0,failed=0,skipped=0;
  for(const item of items){
    if(blocked.has(item.platform)){skipped++;await onSkip?.(item,blocked.get(item.platform));}
    else try{await run(item);done++;}catch(error){failed++;blocked.set(item.platform,error);await onError?.(item,error);}
    progress?.({done,failed,skipped,total:items.length});
  }
  return {done,failed,skipped,blockedPlatforms:[...blocked.keys()]};
}
export async function runSequential(items, run, progress) {
  let done=0;
  for(const item of items){await run(item);done++;progress?.(done,items.length);}
  return done;
}
