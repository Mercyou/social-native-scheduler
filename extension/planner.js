export function splitTexts(value) {
  return value.replace(/\r\n?/g,'\n').split(/\n[ \t]*\n(?:[ \t]*\n)*/).map(text=>text.trim()).filter(Boolean);
}
export function createPlan({texts, platforms, start, intervalMinutes}, now = Date.now()) {
  if (!Array.isArray(texts) || !texts.length || texts.some(t => typeof t !== 'string' || !t.trim())) throw new Error('请填写至少一条文案');
  texts = texts.map(t => t.trim());
  if (new Set(texts).size !== texts.length) throw new Error('存在重复文案，请先调整');
  if (!platforms.length || new Set(platforms).size !== platforms.length || platforms.some(p => !['x','weibo'].includes(p))) throw new Error('请选择平台');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) throw new Error('请选择完整开始时间');
  const ms = Date.parse(start + ':00+08:00');
  if (!Number.isFinite(ms) || new Date(ms + 28800000).toISOString().slice(0,16) !== start) throw new Error('日期无效');
  if (ms <= now + 120000) throw new Error('开始时间至少留出两分钟，请为整批操作留足时间');
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 10080) throw new Error('间隔需为 1–10080 分钟的整数');
  return texts.flatMap((text, i) => platforms.map(platform => ({id: crypto.randomUUID(), sequence:i+1, platform, text, at:new Date(ms + i * intervalMinutes * 60000 + 28800000).toISOString().slice(0,19)+'+08:00', status:'planned', account:''})));
}
export const statusLabels = {planned:'未填写', preparing:'填写中断 / 需检查', prepared:'已填写', submitting:'结果待核对', needs_review:'已点保存 / 待核对', verified:'人工已核对',skipped:'已跳过 / 未提交'};
export function canPrepare(job) { return ['planned','prepared'].includes(job.status); }
export function canSubmit(job) { return job.status === 'prepared'; }
