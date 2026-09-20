import { computed, reactive, toValue, type MaybeRefOrGetter } from 'vue'
import { COMBAT_ATTR_LABEL } from '../sim/combatAttrs'
import type { FloatTipKind } from './floatTips'

const ATTR_LABELS_DESC = Object.values(COMBAT_ATTR_LABEL).sort((a, b) => b.length - a.length)

function splitAttrLabels(raw: string): string[] {
  const out: string[] = []
  let rest = raw.replace(/\s+/g, '')
  while (rest) {
    const found = ATTR_LABELS_DESC.find((label) => rest.startsWith(label))
    if (!found) break
    out.push(found)
    rest = rest.slice(found.length)
  }
  return out
}

/** 战报括号里的命中注：旧「弱点剑火 ×1.2」与新「枪 火 暴击 ×1.5」都收成漂字用的暴击句。 */
function formatHitNote(note: string): string | null {
  const text = note.replace(/\s*×[\d.]+$/, '').trim()
  if (!text || /^\d+\s*\/\s*\d+$/.test(text)) return null
  if (text.endsWith('暴击')) return text
  const raw = text.startsWith('弱点') ? text.slice(2).trim() : text
  const labels = splitAttrLabels(raw)
  return labels.length ? `${labels.join(' ')} 暴击` : null
}

export type EncounterTip = {
  id: number
  text: string
  kind: FloatTipKind
}

const LIFE_MS = 1400
const tipsByEncounter = reactive<Record<string, EncounterTip[]>>({})
let nextId = 1

function scheduleDrop(drop: () => void) {
  const later = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
  later(drop, LIFE_MS)
}

/** 主线订单卡本地漂字。不进全局 floatTips，切走主线页即不渲染。 */
export function pushEncounterTip(encounterId: string, text: string, kind: FloatTipKind = 'ok') {
  const idKey = encounterId.trim()
  const msg = text.trim()
  if (!idKey || !msg) return
  const id = nextId++
  const list = tipsByEncounter[idKey] ?? []
  tipsByEncounter[idKey] = [...list, { id, text: msg, kind }]
  scheduleDrop(() => {
    const cur = tipsByEncounter[idKey] ?? []
    tipsByEncounter[idKey] = cur.filter((tip) => tip.id !== id)
  })
}

/** 卡面短漂字：伤害、揭示弱点、胜负。血量看卡上条，不重复写剩余 HP。 */
export function formatCombatTip(text: string): string {
  const raw = text.trim()
  if (!raw) return ''
  if (raw.includes('揭示弱点') || raw.includes('胜利') || raw.includes('战败') || raw.includes('超时') || raw.includes('出战')) {
    return raw
  }
  const hit = raw.match(/^(.+?) 对 .+? 造成 (\d+)(?:（(?!\d+\/)([^）]+)）)?/)
  if (hit) {
    const who = hit[1]
    const dmg = hit[2]
    const note = hit[3]
    if (note === '工坊' || note?.startsWith('工坊')) return `${who} 造成 ${dmg}（工坊）`
    const crit = note ? formatHitNote(note) : null
    return crit ? `${who} 造成 ${dmg}（${crit}）` : `${who} 造成 ${dmg}`
  }
  return raw
}

export function combatTipKind(text: string): FloatTipKind {
  if (/战败|超时|倒下/.test(text)) return 'err'
  if (/揭示弱点|胜利|出战/.test(text)) return 'ok'
  return 'ok'
}

export function pushCombatLogTip(encounterId: string, text: string, kind?: FloatTipKind) {
  const tip = formatCombatTip(text)
  if (!tip) return
  pushEncounterTip(encounterId, tip, kind ?? combatTipKind(text))
}

export function encounterTipList(encounterId: string): EncounterTip[] {
  return tipsByEncounter[encounterId] ?? []
}

export function clearEncounterTips(encounterId?: string) {
  if (encounterId) {
    tipsByEncounter[encounterId] = []
    return
  }
  for (const id of Object.keys(tipsByEncounter)) {
    tipsByEncounter[id] = []
  }
}

export function useEncounterTips(encounterId: MaybeRefOrGetter<string>) {
  return {
    tips: computed(() => tipsByEncounter[toValue(encounterId)] ?? []),
  }
}
