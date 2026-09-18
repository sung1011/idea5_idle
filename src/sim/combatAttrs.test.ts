import { describe, expect, it } from 'vitest'
import {
  COMBAT_ATTR_IDS,
  COMBAT_ATTR_LABEL,
  COMBAT_ATTR_TONE,
  ENEMY_WEAKNESS_COUNT,
  INITIAL_REVEALED_WEAKNESS_COUNT,
  combatAttrChipStyle,
  combatAttrSlotCount,
  enemyRankFor,
  enemyWeaknessView,
  ensureEnemyIntel,
  fighterRecommendLabel,
  fillWorkerCombatAttrs,
  formatWeaknessCritTip,
  hydrateWorkerCombatAttrs,
  initialRevealedWeaknessCount,
  matchingWeaknesses,
  pickDistinctAttrs,
  pickEnemyWeaknesses,
  resolveWorkerAttack,
  seedInitialRevealedWeaknesses,
  uniqueCombatAttrs,
  visibleWeaknessSlots,
  weaknessDamageMul,
} from './combatAttrs'
import { beginEnemyCombat, stepEnemyCombat } from './combat'
import { createSave } from './createSave'
import { startCombat } from './encounters'
import { fuseWorkers } from './fuse'
import { assignWorker } from './assign'
import { hydrateWorker, spawnWorker, spawnWorkerWith } from './recruit'
import type { EnemyEncounter, QualityTier } from './types'

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'test-enemy',
    label: '试敌',
    quality: 'green',
    needs: { meal: 1 },
    lootGold: 8,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire', 'ice'],
    revealedWeaknesses: [],
    ...overrides,
  }
}

describe('combat attr slots by quality', () => {
  it('unlocks 0 / 1 / 2 slots at white, green-cyan, and purple+', () => {
    const counts = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as QualityTier[]).map(combatAttrSlotCount)
    expect(counts).toEqual([0, 1, 1, 1, 2, 2, 2, 2, 2, 2])
    expect(COMBAT_ATTR_IDS).toHaveLength(12)
    expect(COMBAT_ATTR_IDS.slice(0, 6)).toEqual(['sword', 'polearm', 'dagger', 'axe', 'bow', 'staff'])
    expect(COMBAT_ATTR_IDS.slice(6)).toEqual(['fire', 'ice', 'lightning', 'wind', 'light', 'dark'])
    expect(Object.values(COMBAT_ATTR_LABEL)).toEqual(['剑', '枪', '匕首', '斧', '弓', '杖', '火', '冰', '雷', '风', '光', '暗'])
  })
})

describe('distinct attr roll', () => {
  it('never duplicates on the same worker and only fills unlocked slots', () => {
    const rolls = [0, 0, 0.5, 0.5]
    let i = 0
    const rolled = pickDistinctAttrs(2, () => rolls[i++] ?? 0.9)
    expect(rolled).toHaveLength(2)
    expect(new Set(rolled).size).toBe(2)

    const white = hydrateWorker({ id: 'w-white', qualityTier: 1 })
    expect(white.combatAttrs).toEqual([])

    const green = spawnWorkerWith(createSave(), 2, 'miner')
    expect(green.combatAttrs).toHaveLength(1)
    expect(uniqueCombatAttrs(green.combatAttrs)).toEqual(green.combatAttrs)

    const purple = spawnWorkerWith(createSave(), 5, 'cook')
    expect(purple.combatAttrs).toHaveLength(2)
    expect(new Set(purple.combatAttrs).size).toBe(2)
    expect(purple.combatAttrs.every((id) => COMBAT_ATTR_IDS.includes(id))).toBe(true)
  })

  it('keeps existing attrs on fuse / quality up and only rolls newly unlocked empty slots', () => {
    const save = createSave()
    const a = spawnWorkerWith(save, 4, 'hunter', ['fire'])
    const b = spawnWorkerWith(save, 4, 'hunter', ['ice'])
    expect(a.combatAttrs).toEqual(['fire'])
    expect(assignWorker(save, a.id, 'hunting').ok).toBe(true)
    expect(assignWorker(save, b.id, 'hunting').ok).toBe(true)
    expect(fuseWorkers(save, a.id, b.id).ok).toBe(true)
    const next = save.workers[0]
    expect(next.qualityTier).toBe(5)
    expect(next.combatAttrs[0]).toBe('fire')
    expect(next.combatAttrs).toHaveLength(2)
    expect(new Set(next.combatAttrs).size).toBe(2)

    const kept = fillWorkerCombatAttrs(
      { ...next, qualityTier: 5, combatAttrs: ['fire'] },
      () => 0,
    )
    expect(kept.combatAttrs[0]).toBe('fire')
    expect(kept.combatAttrs).toHaveLength(2)
    expect(kept.combatAttrs[1]).not.toBe('fire')
  })
})

describe('hydrate old saves', () => {
  it('fills combatAttrs from quality; white stays empty', () => {
    const white = hydrateWorker({ id: 'old-white', assignment: null })
    expect(white.qualityTier).toBe(1)
    expect(white.combatAttrs).toEqual([])

    const cyan = hydrateWorker({ id: 'old-cyan', qualityTier: 4 })
    expect(cyan.combatAttrs).toHaveLength(1)

    const gold = hydrateWorker({ id: 'old-gold', qualityTier: 9 })
    expect(gold.combatAttrs).toHaveLength(2)
    expect(new Set(gold.combatAttrs).size).toBe(2)

    const kept = hydrateWorker({ id: 'kept-fire', qualityTier: 5, combatAttrs: ['fire'] })
    expect(kept.combatAttrs[0]).toBe('fire')
    expect(kept.combatAttrs).toHaveLength(2)
    expect(kept.combatAttrs[1]).not.toBe('fire')

    const trimmed = hydrateWorker({ id: 'trim-white', qualityTier: 1, combatAttrs: ['fire', 'ice'] })
    expect(trimmed.combatAttrs).toEqual([])

    const again = hydrateWorkerCombatAttrs({ ...gold }, gold.combatAttrs)
    expect(again.combatAttrs).toEqual(gold.combatAttrs)
  })
})

describe('reveal and rematch', () => {
  it('reveals only matched attrs; a miss does not reveal', () => {
    const enc = testEnemy({ weaknesses: ['fire', 'ice', 'dark'] })
    const hit = resolveWorkerAttack(enc, ['fire', 'sword'], 10)
    expect(hit.hits).toEqual(['fire'])
    expect(hit.newlyRevealed).toEqual(['fire'])
    expect(enc.revealedWeaknesses).toEqual(['fire'])
    expect(visibleWeaknessSlots(enc)).toEqual(['fire', null, null])

    const miss = resolveWorkerAttack(enc, ['bow'], 10)
    expect(miss.hits).toEqual([])
    expect(miss.newlyRevealed).toEqual([])
    expect(enc.revealedWeaknesses).toEqual(['fire'])
    expect(matchingWeaknesses(['ice', 'dark'], enc.weaknesses)).toEqual(['ice', 'dark'])
  })

  it('keeps revealedWeaknesses on rematch of the same order', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    worker.combatAttrs = ['fire']
    const enc = testEnemy({
      quality: 'purple',
      enemyRank: 'elite',
      weaknesses: ['fire', 'sword', 'bow'],
      revealedWeaknesses: ['fire'],
      needs: { meal: 1 },
    })
    save.encounters[0] = enc
    save.bank.meal = 4
    const now = 40_000
    expect(startCombat(save, 0, [worker.id], now).ok).toBe(true)
    expect(enc.revealedWeaknesses).toEqual(['fire'])
    expect(enc.combat?.enemy.hp).toBe(enc.combat?.enemy.hpMax)

    const leftoverHp = Math.max(1, (enc.combat?.enemy.hpMax ?? 2) - 44)
    enc.combat = {
      ...enc.combat!,
      outcome: 'lose',
      enemy: { ...enc.combat!.enemy, hp: leftoverHp },
    }
    const rematch = startCombat(save, 0, [worker.id], now + 1_000)
    expect(rematch.ok).toBe(true)
    expect(enc.revealedWeaknesses).toEqual(['fire'])
    expect(visibleWeaknessSlots(enc)[0]).toBe('fire')
    expect(enc.combat?.enemy.hp).toBe(leftoverHp)
  })

  it('keeps panel weakness slots aligned with combat before fight, after start, and on rematch', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 2, 'hunter', ['fire'])
    const enc = testEnemy({
      id: 'hillBrigand-orange-11-0',
      label: '山贼',
      quality: 'orange',
      enemyRank: 'elite',
      weaknesses: ['sword', 'fire', 'bow', 'dark'],
      revealedWeaknesses: [],
      needs: { potion: 4 },
    })
    save.encounters[0] = enc
    save.bank.potion = 18
    ensureEnemyIntel(enc)
    const before = enemyWeaknessView(enc)
    expect(before.weaknesses).toEqual(['sword', 'fire', 'bow', 'dark'])
    expect(before.revealed).toEqual(['sword'])
    expect(before.slots).toEqual(['sword', null, null, null])

    const now = 70_000
    expect(startCombat(save, 0, [worker.id], now).ok).toBe(true)
    expect(enc.weaknesses).toEqual(before.weaknesses)
    expect(enemyWeaknessView(enc).slots).toEqual(before.slots)

    const combat = enc.combat!
    combat.workers[0].nextActAt = now + 1_000
    combat.enemy.nextActAt = now + 9_000
    stepEnemyCombat(save, enc, now + 1_000)
    expect(enc.revealedWeaknesses).toEqual(['sword', 'fire'])
    expect(enemyWeaknessView(enc)).toEqual({
      weaknesses: ['sword', 'fire', 'bow', 'dark'],
      revealed: ['sword', 'fire'],
      slots: ['sword', 'fire', null, null],
    })
    expect(combat.logs.some((row) => row.text.includes('揭示弱点：火'))).toBe(true)
    expect(enemyWeaknessView(enc).slots).not.toContain('ice')

    enc.combat = {
      ...combat,
      outcome: 'lose',
      enemy: { ...combat.enemy, hp: Math.max(1, combat.enemy.hp) },
    }
    expect(startCombat(save, 0, [worker.id], now + 2_000).ok).toBe(true)
    expect(enemyWeaknessView(enc)).toMatchObject({
      weaknesses: ['sword', 'fire', 'bow', 'dark'],
      revealed: ['sword', 'fire'],
      slots: ['sword', 'fire', null, null],
    })
  })
})

describe('damage multiplier per acting worker', () => {
  it('uses 1 / 1.2 / 1.5 from this worker only, never the party sum', () => {
    expect(weaknessDamageMul(0)).toBe(1)
    expect(weaknessDamageMul(1)).toBe(1.2)
    expect(weaknessDamageMul(2)).toBe(1.5)

    const enc = testEnemy({ weaknesses: ['fire', 'ice'] })
    expect(resolveWorkerAttack(enc, [], 10).damage).toBe(10)
    expect(resolveWorkerAttack(enc, ['bow'], 10).mul).toBe(1)
    expect(resolveWorkerAttack(enc, ['fire'], 10)).toMatchObject({ mul: 1.2, damage: 12 })
    expect(resolveWorkerAttack(enc, ['fire', 'ice'], 10)).toMatchObject({ mul: 1.5, damage: 15 })

    const save = createSave()
    const a = spawnWorkerWith(save, 2, 'miner', ['fire'])
    const b = spawnWorkerWith(save, 2, 'miner', ['ice'])
    a.name = '甲'
    b.name = '乙'
    const fight = testEnemy({
      quality: 'purple',
      enemyRank: 'elite',
      weaknesses: ['dark', 'fire', 'ice'],
    })
    save.encounters[0] = fight
    const now = 50_000
    const combat = beginEnemyCombat(fight, [a, b], now)
    combat.workers[0].nextActAt = now + 1_000
    combat.workers[1].nextActAt = now + 2_000
    combat.enemy.nextActAt = now + 9_000
    const hp0 = combat.enemy.hp
    stepEnemyCombat(save, fight, now + 1_000)
    expect(combat.enemy.hp).toBe(hp0 - Math.round(combat.workers[0].atk * 1.2))
    const hp1 = combat.enemy.hp
    stepEnemyCombat(save, fight, now + 2_000)
    expect(combat.enemy.hp).toBe(hp1 - Math.round(combat.workers[1].atk * 1.2))
    expect(fight.revealedWeaknesses).toEqual(['dark', 'fire', 'ice'])
    expect(combat.logs.some((row) => row.text.includes('揭示弱点'))).toBe(true)
    expect(combat.logs.some((row) => /火 暴击 ×1\.2/.test(row.text))).toBe(true)
    expect(combat.logs.every((row) => !row.text.includes('弱点') || row.text.includes('揭示弱点'))).toBe(true)
  })
})

describe('weakness crit float copy', () => {
  it('joins hit attr labels then 暴击, without 弱点×', () => {
    expect(formatWeaknessCritTip([])).toBe('')
    expect(formatWeaknessCritTip(['polearm'])).toBe('枪 暴击')
    expect(formatWeaknessCritTip(['polearm', 'fire'])).toBe('枪 火 暴击')
    expect(formatWeaknessCritTip(['dagger', 'fire'])).toBe('匕首 火 暴击')
    expect(formatWeaknessCritTip(['polearm'])).not.toContain('弱点')
    expect(formatWeaknessCritTip(['polearm', 'fire'])).not.toMatch(/×/)
  })

  it('writes a two-hit strike log as 枪 火 暴击 ×1.5 without changing the mul', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 5, 'artisan', ['polearm', 'fire'])
    worker.name = '甲'
    const enc = testEnemy({ weaknesses: ['polearm', 'fire'] })
    const now = 80_000
    const combat = beginEnemyCombat(enc, [worker], now)
    combat.workers[0].nextActAt = now + 1_000
    combat.enemy.nextActAt = now + 9_000
    const hp0 = combat.enemy.hp
    stepEnemyCombat(save, enc, now + 1_000)
    expect(combat.enemy.hp).toBe(hp0 - Math.round(combat.workers[0].atk * 1.5))
    expect(combat.logs.some((row) => /枪 火 暴击 ×1\.5/.test(row.text))).toBe(true)
    expect(combat.logs.every((row) => !/弱点(?!：)/.test(row.text))).toBe(true)
  })
})

describe('enemy weakness tables', () => {
  it('rolls 2-3 for minions and 3-4 for elite/boss, distinct', () => {
    expect(ENEMY_WEAKNESS_COUNT.minion).toEqual({ min: 2, max: 3 })
    expect(ENEMY_WEAKNESS_COUNT.elite).toEqual({ min: 3, max: 4 })
    expect(ENEMY_WEAKNESS_COUNT.boss).toEqual({ min: 3, max: 4 })
    expect(enemyRankFor('gray')).toBe('minion')
    expect(enemyRankFor('green')).toBe('minion')
    expect(enemyRankFor('blue')).toBe('minion')
    expect(enemyRankFor('purple')).toBe('elite')
    expect(enemyRankFor('orange')).toBe('elite')

    for (let seed = 0; seed < 24; seed++) {
      const minion = pickEnemyWeaknesses(seed, 0, 'minion')
      const elite = pickEnemyWeaknesses(seed, 1, 'elite')
      const boss = pickEnemyWeaknesses(seed, 2, 'boss')
      expect(minion.length).toBeGreaterThanOrEqual(2)
      expect(minion.length).toBeLessThanOrEqual(3)
      expect(elite.length).toBeGreaterThanOrEqual(3)
      expect(elite.length).toBeLessThanOrEqual(4)
      expect(boss.length).toBeGreaterThanOrEqual(3)
      expect(boss.length).toBeLessThanOrEqual(4)
      expect(new Set(minion).size).toBe(minion.length)
    }

    const old = ensureEnemyIntel({
      ...testEnemy(),
      weaknesses: [],
      revealedWeaknesses: ['fire'],
    })
    expect(old.weaknesses.length).toBeGreaterThanOrEqual(2)
    expect(old.revealedWeaknesses.every((id) => old.weaknesses.includes(id))).toBe(true)
    expect(old.revealedWeaknesses).toHaveLength(Math.min(2, old.weaknesses.length))
    if (old.weaknesses.includes('fire')) expect(old.revealedWeaknesses).toContain('fire')

    const short = ensureEnemyIntel({
      ...testEnemy({ quality: 'orange', enemyRank: 'elite' }),
      weaknesses: ['ice', 'sword'],
      revealedWeaknesses: ['ice'],
    })
    expect(short.weaknesses.slice(0, 2)).toEqual(['ice', 'sword'])
    expect(short.weaknesses.length).toBeGreaterThanOrEqual(3)
    expect(short.revealedWeaknesses).toEqual(['ice'])
    expect(visibleWeaknessSlots(short)[0]).toBe('ice')
    expect(short.weaknesses[0]).not.toBe('fire')
  })

  it('seeds initial revealed 2/1/0 for minion/elite/boss without rerolling weaknesses', () => {
    expect(INITIAL_REVEALED_WEAKNESS_COUNT).toEqual({ minion: 2, elite: 1, boss: 0 })
    expect(initialRevealedWeaknessCount('minion')).toBe(2)
    expect(initialRevealedWeaknessCount('elite')).toBe(1)
    expect(initialRevealedWeaknessCount('boss')).toBe(0)

    const minion = ensureEnemyIntel(
      testEnemy({
        enemyRank: 'minion',
        weaknesses: ['fire', 'ice', 'dark'],
        revealedWeaknesses: [],
      }),
    )
    expect(minion.weaknesses).toEqual(['fire', 'ice', 'dark'])
    expect(minion.revealedWeaknesses).toEqual(['fire', 'ice'])

    const elite = ensureEnemyIntel(
      testEnemy({
        quality: 'purple',
        enemyRank: 'elite',
        weaknesses: ['sword', 'fire', 'bow'],
        revealedWeaknesses: [],
      }),
    )
    expect(elite.weaknesses).toEqual(['sword', 'fire', 'bow'])
    expect(elite.revealedWeaknesses).toEqual(['sword'])

    const boss = ensureEnemyIntel(
      testEnemy({
        quality: 'orange',
        enemyRank: 'boss',
        weaknesses: ['axe', 'wind', 'light', 'dark'],
        revealedWeaknesses: [],
      }),
    )
    expect(boss.weaknesses).toEqual(['axe', 'wind', 'light', 'dark'])
    expect(boss.revealedWeaknesses).toEqual([])
    expect(visibleWeaknessSlots(boss)).toEqual([null, null, null, null])
  })

  it('reveals more on hit and keeps intel after hydrate / rematch', () => {
    const boss = testEnemy({
      quality: 'orange',
      enemyRank: 'boss',
      weaknesses: ['fire', 'ice', 'dark'],
      revealedWeaknesses: [],
    })
    ensureEnemyIntel(boss)
    expect(boss.revealedWeaknesses).toEqual([])
    const hit = resolveWorkerAttack(boss, ['ice', 'bow'], 10)
    expect(hit.hits).toEqual(['ice'])
    expect(hit.newlyRevealed).toEqual(['ice'])
    expect(boss.revealedWeaknesses).toEqual(['ice'])
    ensureEnemyIntel(boss)
    expect(boss.weaknesses).toEqual(['fire', 'ice', 'dark'])
    expect(boss.revealedWeaknesses).toEqual(['ice'])

    const minion = testEnemy({
      weaknesses: ['fire', 'ice', 'dark'],
      revealedWeaknesses: ['dark'],
    })
    seedInitialRevealedWeaknesses(minion)
    expect(minion.revealedWeaknesses).toEqual(['dark', 'fire'])
    expect(minion.weaknesses).toEqual(['fire', 'ice', 'dark'])
  })

  it('labels pick list 推荐 / 强烈推荐 from revealed hits only', () => {
    const enc = testEnemy({
      weaknesses: ['fire', 'ice', 'dark'],
      revealedWeaknesses: ['fire'],
    })
    expect(fighterRecommendLabel(['bow'], enc)).toBeNull()
    expect(fighterRecommendLabel(['fire'], enc)).toBe('推荐')
    expect(fighterRecommendLabel(['fire', 'ice'], enc)).toBe('推荐')
    expect(fighterRecommendLabel(['ice', 'dark'], enc)).toBeNull()
    enc.revealedWeaknesses = ['fire', 'ice']
    expect(fighterRecommendLabel(['fire', 'ice'], enc)).toBe('强烈推荐')
    expect(fighterRecommendLabel(['ice'], enc)).toBe('推荐')
    expect(fighterRecommendLabel(['dark'], enc)).toBeNull()
    expect(fighterRecommendLabel([], enc)).toBeNull()
  })

  it('gives fire a red chip and ice a cyan chip so they cannot share the old blue drop look', () => {
    expect(COMBAT_ATTR_TONE.fire.ink).not.toBe(COMBAT_ATTR_TONE.ice.ink)
    expect(COMBAT_ATTR_TONE.fire.fill).not.toBe(COMBAT_ATTR_TONE.ice.fill)
    expect(combatAttrChipStyle('fire').color).toBe('#c0392b')
    expect(combatAttrChipStyle('ice').color).toBe('#1a7a9a')
  })
})
