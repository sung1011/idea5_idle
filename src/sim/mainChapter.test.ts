import { describe, expect, it } from 'vitest'
import { enemyCombatStats, isCombatLost } from './combat'
import { createSave } from './createSave'
import {
  claimLoot,
  encounterFiller,
  exploreBoard,
  generateEncounterBoard,
  hydrateEncounterFields,
  startCombat,
} from './encounters'
import {
  MAIN_CHAPTER_COMBAT_MUL,
  MAIN_CHAPTER_START,
  MAIN_LOOT_CLAIMS_GOAL,
  chapterCombatMul,
  hasLiveChapterBoss,
  hydrateMainChapterFields,
  mainChapterHeader,
  mainChapterTitle,
  mainLootClaimBarLabel,
  mainLootClaimFillPct,
  mainlineEnemyRank,
  normalizeMainChapter,
  normalizeMainLootClaims,
  shouldForceChapterBoss,
} from './mainChapter'
import { spawnWorker } from './recruit'
import { hydrateLoadedSave } from '../ui/saveGame'
import type { EnemyEncounter, Save } from './types'

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'test-enemy',
    label: '试敌',
    quality: 'green',
    needs: { meal: 1 },
    lootGold: 8,
    departed: true,
    combat: {
      startedAt: 0,
      timeoutAt: 120_000,
      workerIds: ['w-1'],
      workers: [{ id: 'w-1', label: '甲', hp: 10, hpMax: 24, atk: 4, spd: 5, nextActAt: 5_000 }],
      enemy: { id: 'enemy', label: '试敌', hp: 0, hpMax: 18, atk: 3, spd: 5, nextActAt: 5_000 },
      logs: [],
      outcome: 'win',
    },
    lootClaimed: false,
    enemyRank: 'minion',
    chapterBoss: false,
    weaknesses: ['fire', 'sword'],
    revealedWeaknesses: [],
    ...overrides,
  }
}

function put(save: Save, index: number, enc: Save['encounters'][number]) {
  save.encounters[index] = enc
}

function firstEnemyOnBoard(claims: number): EnemyEncounter {
  for (let seed = 0; seed < 80; seed++) {
    const board = generateEncounterBoard(seed, 6, { mainLootClaims: claims })
    const enemy = board.find((enc): enc is EnemyEncounter => enc.kind === 'enemy')
    if (enemy) return enemy
  }
  throw new Error('no enemy on generated boards')
}

describe('main chapter hydrate and header', () => {
  it('starts new saves at chapter 1 with 0 claims', () => {
    const save = createSave()
    expect(save.mainChapter).toBe(MAIN_CHAPTER_START)
    expect(save.mainLootClaims).toBe(0)
    expect(mainChapterTitle(save)).toBe('第 1 章')
    expect(mainLootClaimBarLabel(save)).toBe('本章战利品 0/10')
    expect(mainLootClaimFillPct(save)).toBe(0)
    expect(mainChapterHeader(save)).toBe('第 1 章 · 本章战利品 0/10')
  })

  it('hydrates missing or dirty chapter fields to chapter 1 and claims 0', () => {
    expect(normalizeMainChapter(undefined)).toBe(1)
    expect(normalizeMainChapter(0)).toBe(1)
    expect(normalizeMainChapter(-3)).toBe(1)
    expect(normalizeMainChapter(2.8)).toBe(2)
    expect(normalizeMainLootClaims(undefined)).toBe(0)
    expect(normalizeMainLootClaims(-1)).toBe(0)
    expect(normalizeMainLootClaims(10.9)).toBe(10)

    const { mainChapter: _chapter, mainLootClaims: _claims, ...omitted } = createSave()
    const raw = omitted as Save
    hydrateMainChapterFields(raw)
    expect(raw.mainChapter).toBe(1)
    expect(raw.mainLootClaims).toBe(0)

    const loaded = hydrateLoadedSave({
      ...createSave(),
      mainChapter: undefined,
      mainLootClaims: undefined,
    } as unknown)
    expect(loaded?.mainChapter).toBe(1)
    expect(loaded?.mainLootClaims).toBe(0)

    const dirty = hydrateEncounterFields({
      ...createSave(),
      mainChapter: 0,
      mainLootClaims: -4,
    } as Save)
    expect(dirty.mainChapter).toBe(1)
    expect(dirty.mainLootClaims).toBe(0)
  })

  it('shows loot-claim progress as a capped bar and switches label at 10', () => {
    expect(mainChapterTitle({ mainChapter: 3 })).toBe('第 3 章')
    expect(mainLootClaimBarLabel({ mainLootClaims: 3 })).toBe('本章战利品 3/10')
    expect(mainLootClaimFillPct({ mainLootClaims: 3 })).toBe(30)
    expect(mainLootClaimFillPct({ mainLootClaims: 9 })).toBe(90)
    expect(mainLootClaimFillPct({ mainLootClaims: 10 })).toBe(100)
    expect(mainLootClaimFillPct({ mainLootClaims: 12 })).toBe(100)
    expect(mainLootClaimBarLabel({ mainLootClaims: 9 })).toBe('本章战利品 9/10')
    expect(mainLootClaimBarLabel({ mainLootClaims: 10 })).toBe('战利品 10/10 · 下一条Boss')
    expect(mainLootClaimBarLabel({ mainLootClaims: 12 })).toBe('战利品 10/10 · 下一条Boss')
    expect(mainChapterHeader({ mainChapter: 3, mainLootClaims: 9 })).toBe('第 3 章 · 本章战利品 9/10')
    expect(mainChapterHeader({ mainChapter: 3, mainLootClaims: 10 })).toBe('第 3 章 · 战利品 10/10 · 下一条Boss')
  })
})

describe('loot claim counter and chapter boss spawn', () => {
  it('increments claims on successful loot, not on rematch or lose', () => {
    const save = createSave()
    save.gold = 20
    const worker = spawnWorker(save)
    save.bank.meal = 8
    const won = testEnemy({ id: 'claim-me' })
    put(save, 0, won)
    expect(claimLoot(save, 0).ok).toBe(true)
    expect(save.mainLootClaims).toBe(1)
    expect(save.mainChapter).toBe(1)
    expect(won.lootClaimed).toBe(true)

    const lost = testEnemy({
      id: 'lose-me',
      combat: {
        startedAt: 0,
        timeoutAt: 120_000,
        workerIds: [worker.id],
        workers: [{ id: worker.id, label: '甲', hp: 0, hpMax: 24, atk: 4, spd: 5, nextActAt: 5_000 }],
        enemy: { id: 'enemy', label: '试敌', hp: 8, hpMax: 18, atk: 3, spd: 5, nextActAt: 5_000 },
        logs: [],
        outcome: 'lose',
      },
    })
    put(save, 0, lost)
    expect(isCombatLost(lost)).toBe(true)
    expect(claimLoot(save, 0).ok).toBe(false)
    expect(save.mainLootClaims).toBe(1)
    expect(startCombat(save, 0, [worker.id], 4_000).ok).toBe(true)
    expect(save.mainLootClaims).toBe(1)
    expect(lost.chapterBoss).not.toBe(true)
  })

  it('does not turn the 10th claimed order into a boss; the next spawn is the chapter boss', () => {
    const save = createSave()
    save.mainLootClaims = 9
    const tenth = testEnemy({ id: 'tenth-minion', enemyRank: 'minion', chapterBoss: false })
    put(save, 0, tenth)
    expect(claimLoot(save, 0).ok).toBe(true)
    expect(save.mainLootClaims).toBe(MAIN_LOOT_CLAIMS_GOAL)
    expect(tenth.chapterBoss).toBe(false)
    expect(tenth.enemyRank).toBe('minion')
    expect(tenth.lootClaimed).toBe(true)
    expect(save.mainChapter).toBe(1)

    const recycled = save.encounters[0]
    expect(recycled.kind).toBe('enemy')
    if (recycled.kind === 'enemy') {
      expect(recycled.id).not.toBe('tenth-minion')
      expect(recycled.chapterBoss).toBe(true)
      expect(recycled.enemyRank).toBe('boss')
      expect(recycled.label).toContain('首领')
      expect(recycled.lootClaimed).toBe(false)
    }

    const next = firstEnemyOnBoard(save.mainLootClaims)
    expect(next.chapterBoss).toBe(true)
    expect(next.enemyRank).toBe('boss')
    expect(next.label).toContain('首领')

    const before = firstEnemyOnBoard(9)
    expect(before.chapterBoss).not.toBe(true)
    expect(before.enemyRank).not.toBe('boss')
  })

  it('after 10 claims the next enemy order is always the chapter boss', () => {
    for (let seed = 0; seed < 40; seed++) {
      const one = generateEncounterBoard(seed, 1, { mainLootClaims: MAIN_LOOT_CLAIMS_GOAL })
      expect(one).toHaveLength(1)
      expect(one[0].kind).toBe('enemy')
      if (one[0].kind === 'enemy') {
        expect(one[0].chapterBoss).toBe(true)
        expect(one[0].enemyRank).toBe('boss')
      }

      const fill = encounterFiller(seed, { mainLootClaims: MAIN_LOOT_CLAIMS_GOAL })
      const first = fill(0)
      expect(first.kind).toBe('enemy')
      if (first.kind === 'enemy') {
        expect(first.chapterBoss).toBe(true)
        expect(first.enemyRank).toBe('boss')
      }
      const second = fill(1)
      expect(second.kind === 'enemy' && second.chapterBoss === true).toBe(false)
    }
  })

  it('explore after 10 claims forces the next refreshable slot to be the chapter boss', () => {
    for (let i = 0; i < 16; i++) {
      const save = createSave()
      save.mainLootClaims = MAIN_LOOT_CLAIMS_GOAL
      save.gold = 10_000
      save.encounters = [
        {
          kind: 'passerby',
          id: `trade-block-${i}`,
          label: '换货路人',
          quality: 'green',
          wants: { wood: 1 },
          offers: { meal: 1 },
          completed: false,
        },
      ]
      expect(exploreBoard(save).ok).toBe(true)
      const bosses = save.encounters.filter(
        (enc): enc is EnemyEncounter => enc.kind === 'enemy' && enc.chapterBoss === true && !enc.lootClaimed,
      )
      expect(bosses).toHaveLength(1)
      expect(bosses[0].enemyRank).toBe('boss')
      expect(bosses[0].id).not.toBe(`trade-block-${i}`)
    }
  })

  it('hydrates a stuck 10-claim board by recycling the claimed slot into the chapter boss', () => {
    const claimed = testEnemy({
      id: 'stuck-claimed',
      lootClaimed: true,
      chapterBoss: false,
      enemyRank: 'minion',
    })
    const loaded = hydrateEncounterFields({
      ...createSave(),
      mainLootClaims: MAIN_LOOT_CLAIMS_GOAL,
      encounters: [claimed],
    })
    expect(loaded.mainLootClaims).toBe(MAIN_LOOT_CLAIMS_GOAL)
    expect(loaded.encounters[0].kind).toBe('enemy')
    if (loaded.encounters[0].kind === 'enemy') {
      expect(loaded.encounters[0].id).not.toBe('stuck-claimed')
      expect(loaded.encounters[0].chapterBoss).toBe(true)
      expect(loaded.encounters[0].enemyRank).toBe('boss')
    }
  })

  it('only forces one chapter boss among a freshly filled board', () => {
    const board = generateEncounterBoard(0, 6, { mainLootClaims: 10 })
    const bosses = board.filter((enc): enc is EnemyEncounter => enc.kind === 'enemy' && enc.chapterBoss === true)
    const extras = board.filter((enc): enc is EnemyEncounter => enc.kind === 'enemy' && enc.chapterBoss !== true)
    expect(board[0].kind).toBe('enemy')
    expect(bosses).toHaveLength(1)
    expect(bosses[0].enemyRank).toBe('boss')
    expect(extras.every((enc) => enc.enemyRank !== 'boss')).toBe(true)
    expect(shouldForceChapterBoss({ mainLootClaims: 10 }, [])).toBe(true)
    expect(shouldForceChapterBoss({ mainLootClaims: 10 }, bosses)).toBe(false)
    expect(hasLiveChapterBoss(bosses)).toBe(true)
  })

  it('keeps regular orders in the minion / elite pool before the chapter boss', () => {
    expect(mainlineEnemyRank('green', false)).toBe('minion')
    expect(mainlineEnemyRank('blue', false)).toBe('minion')
    expect(mainlineEnemyRank('purple', false)).toBe('elite')
    expect(mainlineEnemyRank('orange', false)).toBe('elite')
    expect(mainlineEnemyRank('green', true)).toBe('boss')
  })
})

describe('chapter advance on boss loot', () => {
  it('advances chapter, resets claims, clears leftover enemies, and keeps trades', () => {
    const save = createSave()
    save.mainChapter = 1
    save.mainLootClaims = 10
    save.gold = 4
    const leftover = testEnemy({ id: 'old-minion', lootClaimed: true, chapterBoss: false })
    leftover.combat = { ...leftover.combat!, outcome: 'win', enemy: { ...leftover.combat!.enemy, hp: 0 } }
    const boss = testEnemy({
      id: 'chapter-boss',
      enemyRank: 'boss',
      chapterBoss: true,
      lootGold: 20,
    })
    const trade = {
      kind: 'artisan' as const,
      id: 'keep-artisan',
      label: '灶头加餐',
      quality: 'green' as const,
      wants: { meal: 1 },
      rewardGold: 12,
      buffMul: 1.12,
      buffDurationS: 150,
      completed: false,
    }
    save.encounters = [leftover, boss, trade]
    const result = claimLoot(save, 1)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('进入第 2 章')
    expect(save.mainChapter).toBe(2)
    expect(save.mainLootClaims).toBe(0)
    expect(save.gold).toBe(24)
    expect(save.encounters.some((enc) => enc.id === 'old-minion')).toBe(false)
    expect(save.encounters.some((enc) => enc.id === 'chapter-boss')).toBe(false)
    expect(save.encounters.some((enc) => enc.kind === 'artisan' && enc.id === 'keep-artisan')).toBe(true)
    expect(save.encounters.some((enc) => enc.kind === 'enemy' && enc.chapterBoss)).toBe(false)
    expect(mainChapterTitle(save)).toBe('第 2 章')
    expect(mainLootClaimBarLabel(save)).toBe('本章战利品 0/10')
    expect(mainLootClaimFillPct(save)).toBe(0)
    expect(mainChapterHeader(save)).toBe('第 2 章 · 本章战利品 0/10')
  })

  it('stays on the chapter after a boss loss so the same boss can rematch', () => {
    const save = createSave()
    save.mainLootClaims = 10
    save.bank.meal = 4
    const worker = spawnWorker(save)
    const boss = testEnemy({
      id: 'stay-boss',
      chapterBoss: true,
      enemyRank: 'boss',
      departed: true,
      combat: {
        startedAt: 0,
        timeoutAt: 120_000,
        workerIds: [worker.id],
        workers: [{ id: worker.id, label: '甲', hp: 0, hpMax: 24, atk: 4, spd: 5, nextActAt: 5_000 }],
        enemy: { id: 'enemy', label: '首领', hp: 8, hpMax: 18, atk: 3, spd: 5, nextActAt: 5_000 },
        logs: [],
        outcome: 'lose',
      },
    })
    put(save, 0, boss)
    expect(claimLoot(save, 0).ok).toBe(false)
    expect(save.mainChapter).toBe(1)
    expect(save.mainLootClaims).toBe(10)
    expect(startCombat(save, 0, [worker.id], 8_000).ok).toBe(true)
    expect(save.mainChapter).toBe(1)
    expect(save.mainLootClaims).toBe(10)
    expect(save.encounters[0].kind === 'enemy' && save.encounters[0].chapterBoss).toBe(true)
  })
})

describe('chapter combat mul', () => {
  it('layers mild HP / ATK growth on top of quality / rank math', () => {
    expect(chapterCombatMul(1)).toBe(1)
    expect(chapterCombatMul(2)).toBe(MAIN_CHAPTER_COMBAT_MUL[2])
    expect(chapterCombatMul(2)).toBeGreaterThan(1)
    const base = enemyCombatStats('green', 'minion', 1)
    const next = enemyCombatStats('green', 'minion', 2)
    const late = enemyCombatStats('green', 'minion', 12)
    expect(next.hp).toBeGreaterThan(base.hp)
    expect(next.atk).toBeGreaterThanOrEqual(base.atk)
    expect(next.spd).toBe(base.spd)
    expect(late.hp).toBeGreaterThan(next.hp)
    expect(enemyCombatStats('green', 'minion')).toEqual(base)
  })
})
