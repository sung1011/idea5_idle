/** 界面攻速：出手间隔秒，如 `3s`。工人与敌人同一公式。内部战斗仍用间隔秒结算。 */
export function formatAtkSpeed(intervalS: number): string {
  if (!Number.isFinite(intervalS) || intervalS <= 0) return '0s'
  const rounded = Math.round(intervalS * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text}s`
}
