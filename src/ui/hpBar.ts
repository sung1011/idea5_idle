/** 血条填充比例：钉在 [0, 1]。hp>hpMax 时条满，文字仍写真实 `HP: hp/hpMax`。 */
export function hpBarFill(hp: number, hpMax: number): number {
  if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) return 0
  if (hp <= 0) return 0
  return Math.min(1, hp / hpMax)
}

export function hpBarLabel(hp: number, hpMax: number): string {
  return `HP: ${hp}/${hpMax}`
}

export type HpBarTone = 'low' | 'mid' | 'full'

/** 弱点暴击时敌血条横晃时长。 */
export const HP_BAR_SHAKE_MS = 260

export function shouldShakeHpBar(prevKey: number | undefined, nextKey: number | undefined): boolean {
  return typeof nextKey === 'number' && nextKey > 0 && nextKey !== prevKey
}

/** 残血偏红，半血暖金，满血主题绿。超上限按满血上色。 */
export function hpBarTone(hp: number, hpMax: number): HpBarTone {
  const fill = hpBarFill(hp, hpMax)
  if (fill >= 1) return 'full'
  if (fill <= 0.35) return 'low'
  return 'mid'
}
