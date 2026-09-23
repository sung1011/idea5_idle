import { describe, expect, it } from 'vitest'
import { addToBank, itemQty } from './bank'
import { combatRosterFighters, isCombatStunned, isFighting, isWorkerInCombat, stepEnemyCombat } from './combat'
import { createSave } from './createSave'
import {
  DUNGEON_AFFIX_DEFS,
  DUNGEON_AFFIX_FX,
  DUNGEON_AFFIX_IDS,
  DUNGEON_ATTEMPTS_PER_DAY,
  DUNGEON_BOSS_STATS,
  DUNGEON_BROKER_ID,
  DUNGEON_BROKER_LABEL,
  DUNGEON_BROKER_PHASES,
  DUNGEON_BROKER_STATS,
  DUNGEON_GOLD_CHEST,
  DUNGEON_JAILER_ID,
  DUNGEON_JAILER_LABEL,
  DUNGEON_JAILER_STATS,
  DUNGEON_CHAPTER_FX,
  DUNGEON_CHEST,
  DUNGEON_NEEDS,
  DUNGEON_PARTY_MAX,
  DUNGEON_PHASES,
  DUNGEON_STUN_S,
  DUNGEON_TARGET_ROTATION,
  claimDungeonChest,
  dungeonAttemptsLeft,
  dungeonBossLiveStats,
  dungeonChestPayout,
  dungeonChestTier,
  dungeonEncounterOf,
  dungeonRefreshCountdownLabel,
  dungeonRefreshRemainS,
  dungeonScaleChapter,
  dungeonShieldBonus,
  dungeonSupplyBlockReason,
  ensureDungeonDay,
  hydrateDungeonFields,
  reinforceDungeonCombat,
  startDungeonCombat,
} from './dungeon'
import { dungeonChapterScale, dungeonStunS, onDungeonBreak, onDungeonWake, rotateDungeonTarget } from './dungeonTables'
import { exploreBoard } from './encounters'
import { spawnWorkerWith } from './recruit'
import { DAY_LENGTH_S, formatClock } from './tables'
import type { EnemyEncounter, Worker } from './types'

function stockDungeon(save: ReturnType<typeof createSave>) {
  for (const [itemId, qty] of Object.entries(DUNGEON_NEEDS)) {
    if (qty) addToBank(save, itemId as keyof typeof DUNGEON_NEEDS, qty)
  }
}

function fullWorker(save: ReturnType<typeof createSave>, name: string): Worker {
  const worker = spawnWorkerWith(save, 6, 'knight', ['fire', 'sword'])
  worker.name = name
  worker.hp = worker.hpMax
  worker.fatigueDebt = 0
  worker.assignment = null
  return worker
}

describe('dungeon mvp', () => {
  it('hydrates a missing dungeon into two orders with two affixes each', () => {
    const save = createSave()
    expect(save.dungeon.encounters.map((enc) => enc.id)).toEqual([DUNGEON_JAILER_ID, DUNGEON_BROKER_ID])
    expect(save.dungeon.encounters.map((enc) => enc.label)).toEqual([DUNGEON_JAILER_LABEL, DUNGEON_BROKER_LABEL])
    for (const enc of save.dungeon.encounters) {
      expect(enc.affixIds).toHaveLength(2)
      expect(new Set(enc.affixIds).size).toBe(2)
      expect(enc.dungeon).toBe(true)
    }
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(0)
    expect(save.dungeon.attemptsUsedById[DUNGEON_BROKER_ID]).toBe(0)
    const raw = { ...save }
    delete (raw as { dungeon?: typeof save.dungeon }).dungeon
    hydrateDungeonFields(raw)
    expect(raw.dungeon.encounters).toHaveLength(2)
    expect(raw.dungeon.encounters[0].dungeon).toBe(true)
    expect(raw.dungeon.encounters[1].label).toBe(DUNGEON_BROKER_LABEL)
  })

  it('spreads a legacy single dungeon onto the two orders', () => {
    const save = createSave()
    const legacy = {
      ...save.dungeon.encounters[0],
      id: 'dungeonWarden',
      label: '地牢看守',
      combat: null,
      departed: false,
      lootClaimed: false,
    }
    save.dungeon = {
      day: save.dungeon.day,
      chapter: save.dungeon.chapter,
      affixIds: ['thickHide', 'jagged', 'richVein'],
      attemptsUsed: 1,
      encounter: legacy,
    } as unknown as typeof save.dungeon
    hydrateDungeonFields(save)
    expect(save.dungeon.encounters[0].id).toBe(DUNGEON_JAILER_ID)
    expect(save.dungeon.encounters[0].affixIds).toEqual(['thickHide', 'jagged'])
    expect(save.dungeon.encounters[1].id).toBe(DUNGEON_BROKER_ID)
    expect(save.dungeon.encounters[1].affixIds?.[0]).toBe('richVein')
    expect(save.dungeon.encounters[1].affixIds).toHaveLength(2)
    expect(new Set(save.dungeon.encounters[1].affixIds).size).toBe(2)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(1)
    expect(save.dungeon.attemptsUsedById[DUNGEON_BROKER_ID]).toBe(0)
    save.elapsedS = DAY_LENGTH_S
    ensureDungeonDay(save)
    expect(save.dungeon.encounters).toHaveLength(2)
    for (const enc of save.dungeon.encounters) {
      expect(enc.affixIds).toHaveLength(2)
      expect(new Set(enc.affixIds).size).toBe(2)
    }
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(0)
    expect(save.dungeon.attemptsUsedById[DUNGEON_BROKER_ID]).toBe(0)
  })

  it('gates start to one attempt per day and does not refund on lose', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    const now = 2_000_000_000_000
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], now).ok).toBe(true)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(DUNGEON_ATTEMPTS_PER_DAY)
    expect(dungeonAttemptsLeft(save)).toBe(0)
    const enc = dungeonEncounterOf(save)
    expect(isFighting(enc)).toBe(true)
    enc.combat!.outcome = 'lose'
    enc.combat!.enemy.hp = enc.combat!.enemy.hpMax
    const blocked = startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], now + 10)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toMatch(/宝箱|次数/)
    claimDungeonChest(save, DUNGEON_JAILER_ID)
    const spent = startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], now + 20)
    expect(spent.ok).toBe(false)
    if (!spent.ok) expect(spent.reason).toBe('今日地牢次数已用完')
  })

  it('counts down to the next game-day cut used by dungeon hard refresh', () => {
    expect(dungeonRefreshRemainS(0)).toBe(DAY_LENGTH_S)
    expect(dungeonRefreshCountdownLabel(0)).toBe(`刷新倒计时: ${formatClock(DAY_LENGTH_S)}`)
    expect(dungeonRefreshRemainS(1)).toBe(DAY_LENGTH_S - 1)
    expect(dungeonRefreshCountdownLabel(DAY_LENGTH_S - 1)).toBe('刷新倒计时: 00:00:01')
    expect(dungeonRefreshRemainS(DAY_LENGTH_S)).toBe(DAY_LENGTH_S)
    expect(dungeonRefreshCountdownLabel(39)).toBe(`刷新倒计时: ${formatClock(DAY_LENGTH_S - 39)}`)
    const save = createSave()
    save.elapsedS = DAY_LENGTH_S - 1
    expect(dungeonRefreshRemainS(save.elapsedS)).toBe(1)
    expect(save.dungeon.day).toBe(1)
    save.elapsedS = DAY_LENGTH_S
    ensureDungeonDay(save)
    expect(save.dungeon.day).toBe(2)
    expect(dungeonRefreshRemainS(save.elapsedS)).toBe(DAY_LENGTH_S)
  })

  it('resets affixes and attempts on a new game day when not fighting', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 1_000)
    dungeonEncounterOf(save).combat!.outcome = 'lose'
    claimDungeonChest(save, DUNGEON_JAILER_ID)
    const diamonds = save.diamonds
    save.elapsedS = DAY_LENGTH_S
    ensureDungeonDay(save)
    expect(save.dungeon.day).toBe(2)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(0)
    expect(save.dungeon.attemptsUsedById[DUNGEON_BROKER_ID]).toBe(0)
    expect(save.dungeon.encounters[0].affixIds).toHaveLength(2)
    expect(save.dungeon.encounters[1].affixIds).toHaveLength(2)
    expect(save.diamonds).toBe(diamonds)
    expect(dungeonEncounterOf(save).combat).toBeNull()
    expect(dungeonEncounterOf(save).lootClaimed).toBe(false)
  })

  it('force-ends a live fight on day cut and auto-grants the chest', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 1_000)
    const enc = dungeonEncounterOf(save)
    enc.affixIds = ['thickHide', 'jagged']
    enc.dungeonPhaseReached = 2
    const before = save.diamonds
    const herb = itemQty(save, 'herb')
    save.elapsedS = DAY_LENGTH_S * 2
    ensureDungeonDay(save)
    expect(save.dungeon.day).toBe(3)
    expect(isFighting(dungeonEncounterOf(save))).toBe(false)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(0)
    expect(save.diamonds).toBe(before + DUNGEON_CHEST.silver.diamonds)
    expect(itemQty(save, 'herb')).toBe(herb + (DUNGEON_CHEST.silver.items.herb ?? 0))
    expect(dungeonEncounterOf(save).combat).toBeNull()
    expect(dungeonEncounterOf(save).lootClaimed).toBe(false)
  })

  it('auto-grants an unclaimed chest then refreshes on a new day', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 2_000)
    const enc = dungeonEncounterOf(save)
    enc.affixIds = ['thickHide', 'jagged']
    enc.combat!.outcome = 'lose'
    enc.dungeonPhaseReached = 1
    const before = save.diamonds
    save.elapsedS = DAY_LENGTH_S
    ensureDungeonDay(save)
    expect(save.dungeon.day).toBe(2)
    expect(save.diamonds).toBe(before + DUNGEON_CHEST.copper.diamonds)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(0)
    expect(dungeonEncounterOf(save).combat).toBeNull()
  })

  it('allows up to 5 fighters and rejects a sixth reinforce', () => {
    const save = createSave()
    stockDungeon(save)
    const ids = ['甲', '乙', '丙', '丁', '戊', '己'].map((name) => fullWorker(save, name).id)
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, ids.slice(0, 5), 5_000).ok).toBe(true)
    const enc = dungeonEncounterOf(save)
    stepEnemyCombat(save, enc, enc.combat?.phaseEndsAt ?? 5_000)
    expect(enc.combat?.workers).toHaveLength(5)
    const sixth = reinforceDungeonCombat(save, DUNGEON_JAILER_ID, [ids[5]], 5_100)
    expect(sixth.ok).toBe(false)
    if (!sixth.ok) expect(sixth.reason).toContain(String(DUNGEON_PARTY_MAX))
  })

  it('drops a downed fighter from the dungeon order roster immediately', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    const b = fullWorker(save, '乙')
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id, b.id], 7_000).ok).toBe(true)
    const enc = dungeonEncounterOf(save)
    stepEnemyCombat(save, enc, enc.combat?.phaseEndsAt ?? 7_000)
    enc.targetRuleId = 'lowestHp'
    const combat = enc.combat
    expect(combat).toBeTruthy()
    if (!combat) return
    combat.workers[0].hp = 1
    a.hp = 1
    combat.workers[0].nextActAt = 7_000 + 9_000
    combat.workers[1].nextActAt = 7_000 + 9_000
    combat.enemy.nextActAt = 7_000 + 50
    combat.enemy.atk = 8
    stepEnemyCombat(save, enc, 7_000 + 50)
    expect(isFighting(enc)).toBe(true)
    expect(combat.workers.map((w) => w.id)).toEqual([b.id])
    expect(combatRosterFighters(combat).map((w) => w.id)).toEqual([b.id])
    expect(combat.workers.every((w) => w.hp > 0)).toBe(true)
    expect(a.assignment).toBeNull()
    expect(isWorkerInCombat(save, a.id)).toBe(true)
    expect(reinforceDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 7_100).ok).toBe(false)
    const until = combat.returning?.find((row) => row.id === a.id)?.until ?? 7_050
    combat.enemy.nextActAt = until + 100_000
    for (const row of combat.workers) row.nextActAt = until + 100_000
    stepEnemyCombat(save, enc, until)
    a.hp = a.hpMax
    a.fatigueDebt = 0
    const rejoinAt = until + 1
    expect(reinforceDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], rejoinAt).ok).toBe(true)
    const joinedAt = combat.incoming?.find((row) => row.id === a.id)?.arrivesAt ?? rejoinAt
    stepEnemyCombat(save, enc, joinedAt)
    expect(combatRosterFighters(combat).map((w) => w.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('does not spend the daily attempt when reinforcing', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    const b = fullWorker(save, '乙')
    startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 6_000)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(1)
    expect(reinforceDungeonCombat(save, DUNGEON_JAILER_ID, [b.id], 6_100).ok).toBe(true)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(1)
    const enc = dungeonEncounterOf(save)
    const joinedAt = enc.combat?.incoming?.find((row) => row.id === b.id)?.arrivesAt ?? 6_100
    stepEnemyCombat(save, enc, joinedAt)
    expect(enc.combat?.workers.some((w) => w.id === b.id)).toBe(true)
  })

  it('uses table-driven 3-phase shields and 3s stun', () => {
    const save = createSave()
    const enc = dungeonEncounterOf(save)
    enc.combat = {
      startedAt: 0,
      timeoutAt: 100_000,
      workerIds: [],
      workers: [],
      enemy: { id: 'enemy', label: '看守', hp: 100, hpMax: 100, atk: 5, spd: 4, nextActAt: 0 },
      logs: [],
      outcome: null,
      shield: 0,
      shieldMax: 5,
      stunnedUntil: null,
    }
    enc.dungeonPhase = 1
    enc.dungeonPhaseReached = 1
    expect(onDungeonBreak(enc)).toBe(DUNGEON_STUN_S * 1000)
    expect(enc.dungeonPhase).toBe(2)
    expect(enc.dungeonPendingPhase).toBe(true)
    expect(onDungeonWake(enc, enc.combat, 3_000)).toBe(true)
    expect(enc.combat.shield).toBe(DUNGEON_PHASES[1].shield + (enc.dungeonShieldBonus ?? 0))
    expect(enc.weaknesses).toEqual([...DUNGEON_PHASES[1].weaknesses])
    expect(enc.dungeonMechanic).toBe(DUNGEON_PHASES[1].mechanic)
    onDungeonBreak(enc)
    onDungeonWake(enc, enc.combat, 6_000)
    expect(enc.dungeonPhase).toBe(3)
    expect(enc.combat.shield).toBe(DUNGEON_PHASES[2].shield + (enc.dungeonShieldBonus ?? 0))
    const stun = onDungeonBreak(enc)
    expect(stun).toBe(DUNGEON_STUN_S * 1000)
    expect(enc.dungeonPhase).toBe(3)
    expect(enc.dungeonPendingPhase).toBeFalsy()
  })

  it('rotates pinned dungeon target rules', () => {
    const enc = dungeonEncounterOf(createSave())
    enc.targetRuleId = DUNGEON_TARGET_ROTATION[0]
    rotateDungeonTarget(enc, 10_000)
    expect(enc.targetRuleId).toBe(DUNGEON_TARGET_ROTATION[1])
    rotateDungeonTarget(enc, 20_000)
    expect(enc.targetRuleId).toBe(DUNGEON_TARGET_ROTATION[2])
  })

  it('tiers the chest by phase reached and pays diamonds plus items', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 8_000)
    const enc = dungeonEncounterOf(save)
    enc.dungeonPhaseReached = 1
    enc.combat!.outcome = 'lose'
    expect(dungeonChestTier(enc)).toBe('copper')
    enc.dungeonPhaseReached = 2
    expect(dungeonChestTier(enc)).toBe('silver')
    enc.combat!.outcome = 'win'
    enc.dungeonPhaseReached = 3
    expect(dungeonChestTier(enc)).toBe('gold')
    const before = save.diamonds
    const result = claimDungeonChest(save, DUNGEON_JAILER_ID)
    expect(result.ok).toBe(true)
    expect(save.diamonds).toBeGreaterThanOrEqual(before + DUNGEON_CHEST.gold.diamonds)
    expect(save.dungeon.encounters[0].lootClaimed).toBe(true)
  })

  it('requires dungeon supply and does not touch battlefield slots', () => {
    const save = createSave()
    const battlefield = save.encounters.map((enc) => enc.id)
    const a = fullWorker(save, '甲')
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 9_000).ok).toBe(false)
    expect(dungeonSupplyBlockReason(save)?.startsWith('货不够')).toBe(true)
    stockDungeon(save)
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 9_000).ok).toBe(true)
    expect(save.encounters.map((enc) => enc.id)).toEqual(battlefield)
  })

  it('keeps dungeon stun window at 3s during a live break', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    const now = 12_000
    dungeonEncounterOf(save).affixIds = ['thickHide', 'jagged']
    startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], now)
    const enc = dungeonEncounterOf(save) as EnemyEncounter
    stepEnemyCombat(save, enc, enc.combat?.phaseEndsAt ?? now)
    enc.combat!.shield = 1
    enc.combat!.workers[0].combatAttrs = ['fire']
    enc.combat!.workers[0].nextActAt = now + 50
    enc.combat!.enemy.nextActAt = now + 50_000
    enc.weaknesses = ['fire']
    stepEnemyCombat(save, enc, now + 80)
    expect(enc.combat!.shield).toBe(0)
    expect(isCombatStunned(enc.combat!, now + 80)).toBe(true)
    expect((enc.combat!.stunnedUntil ?? 0) - (now + 50)).toBe(DUNGEON_STUN_S * 1000)
  })

  it('explore never mutates the dungeon instance', () => {
    const save = createSave()
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 11_000).ok).toBe(true)
    const snap = {
      day: save.dungeon.day,
      affixIds: save.dungeon.encounters.map((enc) => [...(enc.affixIds ?? [])]),
      attemptsUsed: save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID],
      encounterId: save.dungeon.encounters[0].id,
    }
    expect(exploreBoard(save).ok).toBe(true)
    expect(save.dungeon.day).toBe(snap.day)
    expect(save.dungeon.encounters.map((enc) => enc.affixIds)).toEqual(snap.affixIds)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(snap.attemptsUsed)
    expect(save.dungeon.encounters[0].id).toBe(snap.encounterId)
    expect(isFighting(dungeonEncounterOf(save))).toBe(true)
  })

  it('uses the harsher dungeon supply table including salve', () => {
    expect(DUNGEON_NEEDS).toEqual({ herb: 12, spice: 6, meal: 4, salve: 3 })
    const save = createSave()
    addToBank(save, 'herb', 12)
    addToBank(save, 'spice', 6)
    addToBank(save, 'meal', 4)
    const a = fullWorker(save, '甲')
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 13_000).ok).toBe(false)
    expect(dungeonSupplyBlockReason(save)).toMatch(/回春散/)
    addToBank(save, 'salve', 3)
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 13_000).ok).toBe(true)
  })

  it('writes full numbered effect text for every affix', () => {
    for (const id of DUNGEON_AFFIX_IDS) {
      expect(DUNGEON_AFFIX_DEFS[id].effect).toMatch(/\d/)
      expect(DUNGEON_AFFIX_DEFS[id].effect.length).toBeGreaterThan(DUNGEON_AFFIX_DEFS[id].tip.length)
    }
  })

  it('rolls two affixes per order from the 10-id pool', () => {
    expect(DUNGEON_AFFIX_IDS).toEqual([
      'thickHide',
      'quickened',
      'heavyHands',
      'ironShield',
      'jagged',
      'richVein',
      'shortStun',
      'workshopRage',
      'slowReinforce',
      'dullEdge',
    ])
    expect(DUNGEON_AFFIX_FX.thickHideHpMul).toBe(1.4)
    expect(DUNGEON_AFFIX_FX.ironShieldBonus).toBe(2)
    expect(DUNGEON_AFFIX_FX.workshopRageMul).toBe(1.5)
    expect(dungeonStunS(true)).toBe(2)
    const fresh = createSave()
    expect(fresh.dungeon.encounters).toHaveLength(2)
    for (const enc of fresh.dungeon.encounters) expect(enc.affixIds).toHaveLength(2)
  })

  it('scales the daily dungeon by the locked chapter and ignores mid-day chapter ups', () => {
    const save = createSave()
    save.dungeon.encounters[0].affixIds = ['richVein', 'jagged']
    expect(save.dungeon.chapter).toBe(1)
    expect(dungeonChapterScale(1)).toEqual({ hpMul: 1, spdMul: 1, atkMul: 1, shield: 0 })
    const base = dungeonBossLiveStats(save, DUNGEON_JAILER_ID)
    expect(base.hp).toBe(DUNGEON_BOSS_STATS.hp)
    expect(dungeonShieldBonus(save, save.dungeon.encounters[0])).toBe(0)
    save.mainChapter = 5
    expect(dungeonScaleChapter(save)).toBe(1)
    expect(dungeonBossLiveStats(save, DUNGEON_JAILER_ID)).toEqual(base)
    save.elapsedS = DAY_LENGTH_S
    ensureDungeonDay(save)
    expect(save.dungeon.chapter).toBe(5)
    expect(dungeonScaleChapter(save)).toBe(5)
    save.dungeon.encounters[0].affixIds = ['richVein', 'jagged']
    const scaled = dungeonBossLiveStats(save, DUNGEON_JAILER_ID)
    expect(scaled.hp).toBe(Math.round(DUNGEON_BOSS_STATS.hp * DUNGEON_CHAPTER_FX.hpMulPerChapter ** 4))
    expect(scaled.spd).toBeLessThan(base.spd)
    expect(dungeonShieldBonus(save, save.dungeon.encounters[0])).toBe(1)
    expect(dungeonChapterScale(3).shield).toBe(1)
  })

  it('hydrates a dungeon fight without leftover 0-hp roster shells', () => {
    const save = createSave()
    const downed = fullWorker(save, '倒')
    const alive = fullWorker(save, '活')
    save.dungeon.encounters[0].combat = {
      startedAt: 1,
      timeoutAt: 100_000,
      workerIds: [downed.id, alive.id],
      workers: [
        { id: downed.id, label: '倒', hp: 0, hpMax: 24, atk: 4, spd: 5, nextActAt: 2 },
        { id: alive.id, label: '活', hp: 20, hpMax: 24, atk: 4, spd: 5, nextActAt: 3 },
      ],
      enemy: { id: 'enemy', label: '看守', hp: 100, hpMax: 100, atk: 5, spd: 4, nextActAt: 4 },
      logs: [],
      outcome: null,
    }
    hydrateDungeonFields(save)
    const combat = dungeonEncounterOf(save).combat
    expect(combat?.workers.map((w) => w.id)).toEqual([alive.id])
    expect(combatRosterFighters(combat).map((w) => w.id)).toEqual([alive.id])
  })

  it('keeps an already-spawned old dungeon at chapter 1 when the field is missing', () => {
    const save = createSave()
    save.mainChapter = 6
    delete (save.dungeon as { chapter?: number }).chapter
    hydrateDungeonFields(save)
    expect(save.dungeon.chapter).toBe(1)
    expect(dungeonScaleChapter(save)).toBe(1)
  })

  it('keeps attempts and currency payouts on each order', () => {
    const save = createSave()
    stockDungeon(save)
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    const b = fullWorker(save, '乙')
    expect(startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 20_000).ok).toBe(true)
    const blocked = startDungeonCombat(save, DUNGEON_BROKER_ID, [a.id], 20_050)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toMatch(/正在战斗/)
    expect(startDungeonCombat(save, DUNGEON_BROKER_ID, [b.id], 20_100).ok).toBe(true)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(1)
    expect(save.dungeon.attemptsUsedById[DUNGEON_BROKER_ID]).toBe(1)
    const jailer = save.dungeon.encounters[0]
    const broker = save.dungeon.encounters[1]
    jailer.affixIds = ['thickHide', 'jagged']
    broker.affixIds = ['richVein', 'dullEdge']
    jailer.combat!.outcome = 'win'
    jailer.dungeonPhaseReached = 3
    broker.combat!.outcome = 'win'
    broker.dungeonPhaseReached = 3
    expect(dungeonChestPayout(save, jailer)).toMatchObject({ diamonds: DUNGEON_CHEST.gold.diamonds, gold: 0 })
    expect(dungeonChestPayout(save, broker).gold).toBe(
      Math.round(DUNGEON_GOLD_CHEST.gold.gold * DUNGEON_AFFIX_FX.richVeinDiamondMul),
    )
    expect(dungeonChestPayout(save, broker).diamonds).toBe(0)
    const diamonds = save.diamonds
    const gold = save.gold
    expect(claimDungeonChest(save, DUNGEON_JAILER_ID).ok).toBe(true)
    expect(save.diamonds).toBe(diamonds + DUNGEON_CHEST.gold.diamonds)
    expect(save.gold).toBe(gold)
    expect(claimDungeonChest(save, DUNGEON_BROKER_ID).ok).toBe(true)
    expect(save.gold).toBe(gold + Math.round(DUNGEON_GOLD_CHEST.gold.gold * DUNGEON_AFFIX_FX.richVeinDiamondMul))
    expect(save.diamonds).toBe(diamonds + DUNGEON_CHEST.gold.diamonds)
    expect(startDungeonCombat(save, DUNGEON_BROKER_ID, [b.id], 20_200).ok).toBe(false)
    expect(DUNGEON_JAILER_STATS.hp).toBeGreaterThan(DUNGEON_BROKER_STATS.hp)
    expect(DUNGEON_JAILER_STATS.spd).toBeGreaterThan(DUNGEON_BROKER_STATS.spd)
    expect(save.dungeon.encounters[0].dungeonMechanic).not.toBe(DUNGEON_BROKER_PHASES[0].mechanic)
  })

  it('settles both orders on the day cut', () => {
    const save = createSave()
    stockDungeon(save)
    stockDungeon(save)
    const a = fullWorker(save, '甲')
    const b = fullWorker(save, '乙')
    startDungeonCombat(save, DUNGEON_JAILER_ID, [a.id], 21_000)
    startDungeonCombat(save, DUNGEON_BROKER_ID, [b.id], 21_100)
    const jailer = save.dungeon.encounters[0]
    const broker = save.dungeon.encounters[1]
    jailer.affixIds = ['thickHide', 'jagged']
    broker.affixIds = ['dullEdge', 'shortStun']
    broker.combat!.outcome = 'lose'
    broker.dungeonPhaseReached = 2
    const diamonds = save.diamonds
    const gold = save.gold
    save.elapsedS = DAY_LENGTH_S
    ensureDungeonDay(save)
    expect(save.diamonds).toBe(diamonds + DUNGEON_CHEST.copper.diamonds)
    expect(save.gold).toBe(gold + DUNGEON_GOLD_CHEST.silver.gold)
    expect(save.dungeon.encounters.every((enc) => enc.combat == null && !enc.lootClaimed)).toBe(true)
    expect(save.dungeon.attemptsUsedById[DUNGEON_JAILER_ID]).toBe(0)
    expect(save.dungeon.attemptsUsedById[DUNGEON_BROKER_ID]).toBe(0)
  })
})
