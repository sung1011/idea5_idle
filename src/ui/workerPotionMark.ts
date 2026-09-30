import { formatMarchClock } from '../sim/encounters'
import { potionRemainS, workerActivePotionIds } from '../sim/potions'
import { ITEM_DEF } from '../sim/tables'
import type { PotionItemId, Worker } from '../sim/types'

export function workerPotionIconIds(worker: Worker, elapsedS: number): PotionItemId[] {
  return workerActivePotionIds(worker, elapsedS)
}

/** 苦工详情里的药效剩余。赶工粉和双份雾没有倒计时。 */
export function workerPotionDetailLines(worker: Worker, elapsedS: number): string[] {
  const buff = worker.potion
  if (!buff) return []
  const lines: string[] = []
  const stim = potionRemainS(buff.stimUntil, elapsedS)
  if (stim > 0) lines.push(`${ITEM_DEF.stim.label} 剩余 ${formatMarchClock(stim)}`)
  const oil = potionRemainS(buff.beastOilUntil, elapsedS)
  if (oil > 0) lines.push(`${ITEM_DEF.beastOil.label} 剩余 ${formatMarchClock(oil)}`)
  const renew = potionRemainS(buff.renewUntil, elapsedS)
  if (renew > 0) lines.push(`${ITEM_DEF.renewSoup.label} 剩余 ${formatMarchClock(renew)}`)
  if (buff.rush) lines.push(`${ITEM_DEF.rushPowder.label} 下一轮耗时缩短 40%`)
  if (buff.doubleMist === 2 || buff.doubleMist === 3) {
    lines.push(`${ITEM_DEF.doubleMist.label} 下一轮产出 ×${buff.doubleMist}`)
  }
  return lines
}
