/** 界面攻速：越大越好的整数。工人与敌人同一公式。内部战斗仍用间隔秒结算。 */
export function formatAtkSpeed(intervalS: number): number {
  if (!Number.isFinite(intervalS) || intervalS <= 0) return 0
  return Math.round(1000 / intervalS)
}
