import { findWorker } from '../createWorker'
import { COMBAT_SKILL_DEF, COMBAT_SKILL_IDS } from '../tables/combatSkillDef'
import type { ActionResult, CombatSkillId, Save } from '../types'

function isCombatSkillId(id: string): id is CombatSkillId {
  return (COMBAT_SKILL_IDS as string[]).includes(id)
}

/** 扣账号 gold，写入该 worker 的 knownCombatSkills。不服务伐木/采矿/炼金。 */
export function learnSkill(save: Save, workerId: string, skillId: CombatSkillId): ActionResult {
  if (!isCombatSkillId(skillId)) return { ok: false, reason: '没有这个战斗技能' }

  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }

  const def = COMBAT_SKILL_DEF[skillId]
  if (def.classId !== worker.classId) return { ok: false, reason: '职业不匹配' }
  if (worker.combatLevel < def.unlockLevel) return { ok: false, reason: '战斗等级不足' }
  if (worker.knownCombatSkills.includes(skillId)) return { ok: false, reason: '已学会该技能' }
  if (save.gold < def.goldCost) return { ok: false, reason: '金币不足' }

  save.gold -= def.goldCost
  worker.knownCombatSkills.push(skillId)
  return { ok: true }
}
