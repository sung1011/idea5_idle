import { isCombatLost, isCombatWon, isFighting } from '../sim/combat'
import { isDungeonEncounter } from '../sim/dungeonTables'
import type { EnemyEncounter } from '../sim/types'

/** 订单卡战斗钮。开过战斗（有 combat 或已出发）不再回到「开战」。 */
export type EnemyCardButton = 'claimed' | 'fighting' | 'chest' | 'loot' | 'loseReinforce' | 'start'

export type EnemyPickMode = 'start' | 'reinforce' | 'loseReinforce'

export function enemyCardButton(enc: EnemyEncounter): EnemyCardButton {
  if (enc.lootClaimed) return 'claimed'
  if (isFighting(enc)) return 'fighting'
  if (isDungeonEncounter(enc) && (isCombatWon(enc) || isCombatLost(enc))) return 'chest'
  if (isCombatWon(enc)) return 'loot'
  if (enc.departed || enc.combat) return 'loseReinforce'
  return 'start'
}

export function enemyPickCopy(mode: EnemyPickMode, max: number): {
  title: string
  hintTail: string
  confirm: string
  costsSupply: boolean
} {
  if (mode === 'loseReinforce') {
    return {
      title: '选择增援工人',
      hintTail: '增援不消耗补给，敌方回满血重开本单。',
      confirm: '增援',
      costsSupply: false,
    }
  }
  if (mode === 'reinforce') {
    return {
      title: '选择增援工人',
      hintTail: '增援不消耗补给。',
      confirm: '增援',
      costsSupply: false,
    }
  }
  return {
    title: '选择出战工人',
    hintTail: `1～${max} 人即可，不必凑满。`,
    confirm: '开战',
    costsSupply: true,
  }
}
