/**
 * 主线标题旁的编号。步号是清单下标 +1，id 是任务表里的唯一 id。
 * 只给界面用，不参与领奖或推进。
 */
export function guideQuestCode(step: number, taskId: string): string {
  const n = Number.isFinite(step) ? Math.max(1, Math.floor(step)) : 1
  return `#${n} ${taskId}`
}
