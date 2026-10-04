export function pendingBatch(jobs) {
  if(!jobs.length)throw new Error('请先导入文案并生成时间表');
  if(jobs.some(j=>['preparing','prepared','submitting'].includes(j.status)))throw new Error('存在中断或结果不明的条目，请先检查平台结果再继续导入');
  const pending=jobs.filter(j=>j.status==='planned');
  if(!pending.length)throw new Error('没有待导入条目，请启动检查');
  return pending;
}
export async function runSequential(items, run, progress) {
  let done=0;
  for(const item of items){await run(item);done++;progress?.(done,items.length);}
  return done;
}
