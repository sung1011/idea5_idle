import { describe, expect, it } from 'vitest'
import { createSave } from '../createSave'
import { createWorker } from '../createWorker'
import { learnSkill } from './learnSkill'

function warriorReady() {
  const save = createSave()
  save.gold = 100
  createWorker(save, 'warrior', '甲')
  const worker = save.workers[0]
  worker.combatLevel = 3
  return { save, workerId: worker.id }
}

describe('learnSkill', () => {
  it('fails when class does not match', () => {
    const { save, workerId } = warriorReady()
    const gold = save.gold
    const result = learnSkill(save, workerId, 'firebolt')
    expect(result).toEqual({ ok: false, reason: '职业不匹配' })
    expect(save.gold).toBe(gold)
    expect(save.workers[0].knownCombatSkills).toEqual([])
  })

  it('fails when combat level is too low', () => {
    const { save, workerId } = warriorReady()
    save.workers[0].combatLevel = 1
    const gold = save.gold
    const result = learnSkill(save, workerId, 'guard')
    expect(result).toEqual({ ok: false, reason: '战斗等级不足' })
    expect(save.gold).toBe(gold)
    expect(save.workers[0].knownCombatSkills).toEqual([])
  })

  it('fails when gold is not enough', () => {
    const { save, workerId } = warriorReady()
    save.gold = 79
    const result = learnSkill(save, workerId, 'guard')
    expect(result).toEqual({ ok: false, reason: '金币不足' })
    expect(save.gold).toBe(79)
    expect(save.workers[0].knownCombatSkills).toEqual([])
  })

  it('deducts account gold and writes the skill onto that worker', () => {
    const { save, workerId } = warriorReady()
    const result = learnSkill(save, workerId, 'guard')
    expect(result).toEqual({ ok: true })
    expect(save.gold).toBe(20)
    expect(save.workers[0].knownCombatSkills).toEqual(['guard'])
  })
})
