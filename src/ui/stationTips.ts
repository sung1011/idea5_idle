import { computed, reactive, toValue, type MaybeRefOrGetter } from 'vue'
import { formatCycleTip, type CycleGain } from '../sim/gains'
import type { StationId } from '../sim/types'
import type { FloatTipKind } from './floatTips'

export type StationTip = {
  id: number
  text: string
  kind: FloatTipKind
}

const LIFE_MS = 1400
const tipsByStation = reactive<Partial<Record<StationId, StationTip[]>>>({})
let nextId = 1

function scheduleDrop(drop: () => void) {
  const later = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
  later(drop, LIFE_MS)
}

/** 工坊站卡本地漂字。不进全局 floatTips，切走工坊页即不渲染。 */
export function pushStationTip(stationId: StationId, text: string, kind: FloatTipKind = 'ok') {
  const msg = text.trim()
  if (!msg) return
  const id = nextId++
  const list = tipsByStation[stationId] ?? []
  tipsByStation[stationId] = [...list, { id, text: msg, kind }]
  scheduleDrop(() => {
    const cur = tipsByStation[stationId] ?? []
    tipsByStation[stationId] = cur.filter((tip) => tip.id !== id)
  })
}

export function pushCycleGain(gain: CycleGain) {
  const tip = formatCycleTip(gain)
  if (tip) pushStationTip(gain.stationId, tip.text, tip.kind)
  if (gain.weak) pushStationTip(gain.stationId, '虚弱', 'err')
}

export function stationTipList(stationId: StationId): StationTip[] {
  return tipsByStation[stationId] ?? []
}

export function clearStationTips(stationId?: StationId) {
  if (stationId) {
    tipsByStation[stationId] = []
    return
  }
  for (const id of Object.keys(tipsByStation) as StationId[]) {
    tipsByStation[id] = []
  }
}

export function useStationTips(stationId: MaybeRefOrGetter<StationId>) {
  return {
    tips: computed(() => tipsByStation[toValue(stationId)] ?? []),
  }
}
