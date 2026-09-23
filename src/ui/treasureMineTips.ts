import { computed, reactive, toValue, type MaybeRefOrGetter } from 'vue'
import { treasureDropTip, type TreasureDrop } from '../sim/treasureMine'
import type { FloatTipKind } from './floatTips'
import { appTab } from './appNav'

export type TreasureMineTip = {
  id: number
  text: string
  kind: FloatTipKind
}

const LIFE_MS = 1400
const tipsByMine = reactive<Record<string, TreasureMineTip[]>>({})
let nextId = 1

function scheduleDrop(drop: () => void) {
  const later = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
  later(drop, LIFE_MS)
}

/** 夺宝矿卡本地漂字。不进全局 floatTips。 */
export function pushTreasureMineTip(mineId: string, text: string, kind: FloatTipKind = 'ok') {
  const idKey = mineId.trim()
  const msg = text.trim()
  if (!idKey || !msg) return
  const id = nextId++
  const list = tipsByMine[idKey] ?? []
  tipsByMine[idKey] = [...list, { id, text: msg, kind }]
  scheduleDrop(() => {
    const cur = tipsByMine[idKey] ?? []
    tipsByMine[idKey] = cur.filter((tip) => tip.id !== id)
  })
}

/** 人在 PVP 夺宝页才挂到矿卡上。切走不播，入库仍由 sim 完成。 */
export function noteTreasureDrop(drop: TreasureDrop) {
  if (appTab.value !== 'pvp') return
  pushTreasureMineTip(drop.mineId, treasureDropTip(drop.item, drop.qty))
}

export function treasureMineTipList(mineId: string): TreasureMineTip[] {
  return tipsByMine[mineId] ?? []
}

export function clearTreasureMineTips(mineId?: string) {
  if (mineId) {
    tipsByMine[mineId] = []
    return
  }
  for (const id of Object.keys(tipsByMine)) tipsByMine[id] = []
}

export function useTreasureMineTips(mineId: MaybeRefOrGetter<string>) {
  return {
    tips: computed(() => tipsByMine[toValue(mineId)] ?? []),
  }
}
