import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker, restingWorkers } from './assign'
import { itemQty } from './bank'
import { combatPartyBlockReason } from './combat'
import { COMBAT_ATTR_IDS, rollCombatWeakness, scaledAttackDamage, workerMatchesWeakness } from './combatAttrs'
import { createSave } from './createSave'
import {
  HERB_PVP_COUNTER_RULE,
  HERB_PVP_PLAYER_CAP,
  HERB_PVP_PLOT_COUNT,
  HERB_PVP_PROBE_REV,
  HERB_PVP_RANK_REWARDS,
  HERB_PVP_START_PROBES,
  HERB_PVP_RIVAL_COUNT,
  HERB_PVP_RIVAL_ONLINE_MAX,
  HERB_PVP_RIVAL_ONLINE_MIN,
  herbOnlineTargetOf,
  HERB_PVP_STAMINA_MAX,
  HERB_PVP_STAMINA_REGEN_S,
  HERB_PVP_STAMINA_REV,
  HERB_PVP_WEED_COST,
  HERB_PVP_WEED_FAST_COST,
  HERB_PVP_WEED_FAST_S,
  HERB_PVP_WEED_S,
  applyHerbRivalBump,
  beginHerbOfflineReport,
  beijingDayKey,
  classifyHerbRoll,
  finishHerbOfflineReport,
  herbCommonQty,
  herbCounterMark,
  herbPlayerRank,
  herbPlotShowsWeakness,
  herbPlotSpot,
  herbPreciousOf,
  herbProbeCells,
  herbStaminaBubbleText,
  herbStaminaFill,
  herbRankReward,
  herbStrikeDamage,
  herbWeedCost,
  herbWeedSeconds,
  herbWorkerCounters,
  hydrateHerbPvp,
  inheritHerbProgress,
  orderHerbPick,
  setHerbRollOverride,
  discardHerbClearEvents,
  discardHerbClashEvents,
  herbClashResultText,
  startHerbWeed,
  stepHerbPvp,
  takeHerbClearEvents,
  takeHerbClashEvents,
  unlockedHerbalismProducts,
  useHerbProbe,
} from './herbPvp'
import { pvpRankDiamonds } from './pvpRankDiamonds'
import { PLAYER_AVATAR_IDS } from './playerAvatarIds'
import { spawnWorker, spawnWorkerWith } from './recruit'
import { SNAPSHOT_PLAYER_NAMES, vaultQty, workerMatchesMineWeakness } from './treasureMine'
import type { CombatAttrId, HerbPlot, HerbPvpState, Save } from './types'
import { SAVE_KEY, hydrateLoadedSave, loadSave, persistSave } from '../ui/saveGame'

afterEach(() => {
  setHerbRollOverride(null)
  discardHerbClearEvents()
  discardHerbClashEvents()
})

function fresh(): Save {
  const save = createSave()
  save.herbPvp.dayKey = beijingDayKey(Date.now())
  return save
}

function quiet(save: Save): void {
  const state = save.herbPvp
  state.onlineTarget = 0
  state.targetUntilS = Number.MAX_SAFE_INTEGER
  for (const rival of state.rivals) {
    rival.onlineUntilS = null
    rival.nextOnlineAtS = Number.MAX_SAFE_INTEGER
    rival.score = 0
  }
  for (const plot of state.plots) {
    plot.weeder = null
    plot.markedRivalId = null
    plot.workerId = null
    plot.progressS = 0
  }
}

function memory(): Storage {
  const bag = new Map<string, string>()
  return {
    get length() {
      return bag.size
    },
    clear() {
      bag.clear()
    },
    getItem(key: string) {
      return bag.has(key) ? bag.get(key)! : null
    },
    key(index: number) {
      return [...bag.keys()][index] ?? null
    },
    removeItem(key: string) {
      bag.delete(key)
    },
    setItem(key: string, value: string) {
      bag.set(key, value)
    },
  }
}

function plainWeakness(attrs: readonly CombatAttrId[] | undefined): CombatAttrId {
  const have = new Set(attrs ?? [])
  return COMBAT_ATTR_IDS.find((id) => !have.has(id)) ?? COMBAT_ATTR_IDS[0]!
}

function holdRank(save: Save, rank: number): void {
  save.herbPvp.playerScore = 0
  save.herbPvp.rivals.forEach((rival, index) => {
    rival.score = index < rank - 1 ? 1 : 0
  })
}

describe('herb pvp rolls', () => {
  it('splits plot kinds on the published cuts and keeps probes as one item', () => {
    expect(classifyHerbRoll(0).kind).toBe('barren')
    expect(classifyHerbRoll(0.349999).kind).toBe('barren')
    expect(classifyHerbRoll(0.35)).toEqual({ kind: 'common' })
    expect(classifyHerbRoll(0.749999).kind).toBe('common')
    expect(classifyHerbRoll(0.75)).toEqual({ kind: 'precious' })
    expect(classifyHerbRoll(0.899999).kind).toBe('precious')
    expect(classifyHerbRoll(0.9)).toEqual({ kind: 'probe' })
    expect(classifyHerbRoll(0.95).kind).toBe('probe')
    expect(classifyHerbRoll(1).kind).toBe('probe')
  })

  it('scores precious herbs and rolls common quantity', () => {
    expect(herbPreciousOf(0)).toEqual({ tier: 'low', score: 20 })
    expect(herbPreciousOf(0.599999)).toEqual({ tier: 'low', score: 20 })
    expect(herbPreciousOf(0.6)).toEqual({ tier: 'mid', score: 40 })
    expect(herbPreciousOf(0.899999)).toEqual({ tier: 'mid', score: 40 })
    expect(herbPreciousOf(0.9)).toEqual({ tier: 'high', score: 80 })
    expect(herbCommonQty(0)).toBe(1)
    expect(herbCommonQty(0.333333)).toBe(1)
    expect(herbCommonQty(1 / 3)).toBe(2)
    expect(herbCommonQty(2 / 3)).toBe(3)
    expect(herbCommonQty(0.999999)).toBe(3)
  })

  it('draws common herbs from the workshop table and buries them at refresh', () => {
    const save = fresh()
    expect(unlockedHerbalismProducts(save)).toEqual([
      { itemId: 'herb', weight: 70 },
      { itemId: 'spice', weight: 30 },
    ])
    const rng = save.rngState
    setHerbRollOverride(() => 0.5)
    save.herbPvp = undefined as unknown as HerbPvpState
    hydrateHerbPvp(save)
    expect(save.herbPvp.plots.every((plot) => plot.kind === 'common' && plot.payload === 'herb' && plot.qty === 2)).toBe(true)
    expect(save.herbPvp.plots.every((plot) => plot.revealed === false)).toBe(true)
    expect(save.rngState).toBe(rng)
  })

  it('places a 3 by 3 footprint and drops cells outside the map', () => {
    expect(herbProbeCells(0)).toEqual([0, 1, 8, 9])
    expect(herbProbeCells(7)).toEqual([6, 7, 14, 15])
    expect(herbProbeCells(4)).toEqual([3, 4, 5, 11, 12, 13])
    expect(herbProbeCells(9)).toEqual([0, 1, 2, 8, 9, 10, 16, 17, 18])
    expect(herbProbeCells(27)).toEqual([18, 19, 20, 26, 27, 28, 34, 35, 36])
    expect(herbProbeCells(56)).toEqual([48, 49, 56, 57])
    expect(herbProbeCells(63)).toEqual([54, 55, 62, 63])
  })
})

describe('herb pvp board', () => {
  it('keeps one player with 49 named rivals on an 8 by 8 map', () => {
    const save = fresh()
    expect(save.herbPvp.plots).toHaveLength(HERB_PVP_PLOT_COUNT)
    expect(save.herbPvp.rivals).toHaveLength(HERB_PVP_RIVAL_COUNT)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX)
    expect(save.herbPvp.probes).toBe(HERB_PVP_START_PROBES)
    expect(HERB_PVP_START_PROBES).toBe(3)
    const names = new Set<string>(SNAPSHOT_PLAYER_NAMES)
    const avatars = new Set<string>(PLAYER_AVATAR_IDS)
    for (const rival of save.herbPvp.rivals) {
      expect(names.has(rival.name)).toBe(true)
      expect(avatars.has(rival.avatarId)).toBe(true)
    }
    expect(new Set(save.herbPvp.rivals.map((rival) => rival.name)).size).toBe(SNAPSHOT_PLAYER_NAMES.length)
    expect(herbPlayerRank(save)).toBe(1)
  })

  it('never puts more than eight rivals online at once', () => {
    const save = fresh()
    const state = save.herbPvp
    state.onlineTarget = HERB_PVP_RIVAL_ONLINE_MAX
    state.targetUntilS = Number.MAX_SAFE_INTEGER
    save.elapsedS = 10_000
    for (const rival of state.rivals) {
      rival.onlineUntilS = null
      rival.nextOnlineAtS = 0
    }
    for (const plot of state.plots) {
      plot.weeder = null
      plot.workerId = null
    }
    for (let i = 0; i < 12; i += 1) {
      save.elapsedS += 1
      stepHerbPvp(save, Date.now())
    }
    const online = state.rivals.filter((rival) => rival.onlineUntilS != null)
    expect(online.length).toBe(HERB_PVP_RIVAL_ONLINE_MAX)
    for (const rival of online) {
      const held = state.plots.filter((plot) => plot.weeder === rival.id)
      expect(held.length).toBeGreaterThanOrEqual(1)
      expect(held.length).toBeLessThanOrEqual(3)
    }
  })

  it('rolls only five to eight rivals and keeps at least five weeding', () => {
    expect(HERB_PVP_RIVAL_ONLINE_MIN).toBe(5)
    expect(HERB_PVP_RIVAL_ONLINE_MAX).toBe(8)
    expect(herbOnlineTargetOf(0)).toBe(5)
    expect(herbOnlineTargetOf(0.2)).toBe(5)
    expect(herbOnlineTargetOf(0.26)).toBe(6)
    expect(herbOnlineTargetOf(0.5)).toBe(7)
    expect(herbOnlineTargetOf(0.75)).toBe(8)
    expect(herbOnlineTargetOf(0.999999)).toBe(8)

    const save = fresh()
    expect(save.herbPvp.onlineTarget).toBeGreaterThanOrEqual(5)
    expect(save.herbPvp.onlineTarget).toBeLessThanOrEqual(8)

    function park(target: number): Save {
      const next = fresh()
      next.herbPvp.onlineTarget = target
      next.herbPvp.targetUntilS = Number.MAX_SAFE_INTEGER
      for (const rival of next.herbPvp.rivals) {
        rival.onlineUntilS = null
        rival.nextOnlineAtS = next.elapsedS + 50_000
        rival.plotCap = 0
      }
      for (const plot of next.herbPvp.plots) {
        plot.weeder = null
        plot.workerId = null
        plot.cleared = false
        plot.markedRivalId = null
      }
      return next
    }

    const resting = park(8)
    stepHerbPvp(resting, Date.now())
    const recalled = resting.herbPvp.rivals.filter((rival) => rival.onlineUntilS != null)
    expect(recalled).toHaveLength(HERB_PVP_RIVAL_ONLINE_MIN)
    for (const rival of recalled) {
      expect(resting.herbPvp.plots.some((plot) => plot.weeder === rival.id)).toBe(true)
    }

    const capped = park(5)
    for (const rival of capped.herbPvp.rivals) rival.nextOnlineAtS = 0
    stepHerbPvp(capped, Date.now())
    expect(capped.herbPvp.rivals.filter((rival) => rival.onlineUntilS != null)).toHaveLength(5)

    const full = park(8)
    for (const rival of full.herbPvp.rivals) rival.nextOnlineAtS = 0
    stepHerbPvp(full, Date.now())
    stepHerbPvp(full, Date.now())
    expect(full.herbPvp.rivals.filter((rival) => rival.onlineUntilS != null)).toHaveLength(8)

    const legacy = fresh()
    legacy.herbPvp.onlineTarget = 0
    expect(hydrateLoadedSave(JSON.parse(JSON.stringify(legacy)))?.herbPvp.onlineTarget).toBe(5)
    legacy.herbPvp.onlineTarget = 4
    expect(hydrateLoadedSave(JSON.parse(JSON.stringify(legacy)))?.herbPvp.onlineTarget).toBe(5)
    legacy.herbPvp.onlineTarget = 6
    expect(hydrateLoadedSave(JSON.parse(JSON.stringify(legacy)))?.herbPvp.onlineTarget).toBe(6)
    legacy.herbPvp.onlineTarget = 9
    expect(hydrateLoadedSave(JSON.parse(JSON.stringify(legacy)))?.herbPvp.onlineTarget).toBe(8)
  })
})

describe('herb pvp weeding', () => {
  it('spends stamina, blocks a fourth plot, and still allows probes at zero', () => {
    const save = fresh()
    quiet(save)
    const workers = [spawnWorker(save), spawnWorker(save), spawnWorker(save), spawnWorker(save)]
    expect(startHerbWeed(save, 0, workers[0]!.id).ok).toBe(true)
    expect(startHerbWeed(save, 1, workers[1]!.id).ok).toBe(true)
    expect(startHerbWeed(save, 2, workers[2]!.id).ok).toBe(true)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX - HERB_PVP_PLAYER_CAP * HERB_PVP_WEED_COST)
    expect(startHerbWeed(save, 3, workers[3]!.id)).toEqual({ ok: false, reason: '最多同时除 3 块' })
    expect(restingWorkers(save).map((worker) => worker.id)).not.toContain(workers[0]!.id)
    expect(assignWorker(save, workers[0]!.id, 'herbalism')).toEqual({ ok: false, reason: '正在割草' })
    expect(combatPartyBlockReason(save, [workers[0]!.id])).toContain('正在割草')

    const tired = spawnWorker(save)
    tired.hp = tired.hpMax - 1
    save.herbPvp.plots[0]!.workerId = null
    expect(startHerbWeed(save, 4, tired.id)).toEqual({ ok: false, reason: '满血才能上岗' })

    save.herbPvp.stamina = HERB_PVP_WEED_COST - 1
    const short = spawnWorker(save)
    expect(startHerbWeed(save, 4, short.id)).toEqual({ ok: false, reason: '体力不足' })
    save.herbPvp.stamina = 0
    const ready = spawnWorker(save)
    expect(startHerbWeed(save, 4, ready.id)).toEqual({ ok: false, reason: '体力不足' })
    save.herbPvp.plots[8]!.cleared = true
    expect(useHerbProbe(save, 8)).toEqual({ ok: false, reason: '只能对未除的地使用' })
    expect(save.herbPvp.probes).toBe(HERB_PVP_START_PROBES)
    expect(useHerbProbe(save, 9).ok).toBe(true)
    expect(save.herbPvp.plots[9]!.revealed).toBe(true)
    expect(save.herbPvp.plots[10]!.revealed).toBe(true)
    expect(save.herbPvp.probes).toBe(HERB_PVP_START_PROBES - 1)
    expect(save.herbPvp.stamina).toBe(0)
  })

  it('returns the worker with loot after three minutes and regens stamina offline', () => {
    const save = fresh()
    quiet(save)
    const rng = save.rngState
    const worker = spawnWorker(save)
    const plot = save.herbPvp.plots[0]!
    plot.kind = 'common'
    plot.payload = 'herb'
    plot.qty = 2
    plot.workerId = worker.id
    plot.progressS = HERB_PVP_WEED_S - 1
    save.herbPvp.stamina = 4
    save.herbPvp.staminaAccS = HERB_PVP_STAMINA_REGEN_S - 1
    stepHerbPvp(save, Date.now(), { offline: true })
    expect(plot.cleared).toBe(true)
    expect(plot.workerId).toBeNull()
    expect(itemQty(save, 'herb')).toBe(2)
    expect(worker.assignment).toBeNull()
    expect(restingWorkers(save).some((row) => row.id === worker.id)).toBe(true)
    expect(save.herbPvp.stamina).toBe(5)
    expect(save.herbPvp.staminaAccS).toBe(0)
    expect(save.rngState).toBe(rng)
  })

  it('banks score and probes when those plots finish, then refreshes a cleared map', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const precious = save.herbPvp.plots[0]!
    precious.kind = 'precious'
    precious.payload = 'high'
    precious.qty = 80
    precious.workerId = worker.id
    precious.progressS = HERB_PVP_WEED_S - 1
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.playerScore).toBe(80)

    const probe = save.herbPvp.plots[1]!
    probe.kind = 'probe'
    probe.payload = '4'
    probe.qty = 1
    probe.cleared = false
    probe.workerId = worker.id
    probe.progressS = HERB_PVP_WEED_S - 1
    const before = save.herbPvp.probes
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.probes).toBe(before + 1)

    save.herbPvp.plots[2]!.revealed = true
    for (const plot of save.herbPvp.plots) {
      plot.cleared = true
      plot.workerId = null
      plot.weeder = null
    }
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.plots.every((plot) => plot.cleared === false && plot.revealed === false)).toBe(true)
  })

  it('keeps a reveal until the map refreshes', () => {
    const save = fresh()
    quiet(save)
    expect(useHerbProbe(save, 0).ok).toBe(true)
    expect(save.herbPvp.plots[0]!.revealed).toBe(true)
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.plots[0]!.revealed).toBe(true)
  })
})

describe('herb pvp clashes', () => {
  it('spends stamina only when a clash takes the plot', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const rival = save.herbPvp.rivals[0]!
    const plot = save.herbPvp.plots[0]!
    const other = save.herbPvp.plots[1]!
    plot.weeder = rival.id
    plot.progressS = 50
    other.weeder = rival.id
    other.progressS = 20
    rival.hp = 1
    rival.atk = 1
    const taken = startHerbWeed(save, 0, worker.id)
    expect(taken.ok).toBe(true)
    if (taken.ok) expect(taken.message).toContain(`花 ${HERB_PVP_WEED_COST} 体力`)
    expect(plot.workerId).toBe(worker.id)
    expect(plot.weeder).toBeNull()
    expect(plot.progressS).toBe(50)
    expect(other.weeder).toBeNull()
    expect(other.progressS).toBe(0)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX - HERB_PVP_WEED_COST)

    const home = spawnWorker(save)
    const survivor = save.herbPvp.rivals[1]!
    const blocked = save.herbPvp.plots[2]!
    blocked.weeder = survivor.id
    blocked.progressS = 12
    survivor.hp = 500
    survivor.atk = 1
    const before = save.herbPvp.stamina
    const result = startHerbWeed(save, 2, home.id)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('体力未扣')
    expect(blocked.weeder).toBe(survivor.id)
    expect(blocked.workerId).toBeNull()
    expect(blocked.progressS).toBe(12)
    expect(save.herbPvp.stamina).toBe(before)
    expect(home.hp).toBe(home.hpMax - 1)
    expect(restingWorkers(save).some((row) => row.id === home.id)).toBe(true)

    const poor = spawnWorker(save)
    const gated = save.herbPvp.plots[3]!
    const gateRival = save.herbPvp.rivals[2]!
    gated.weeder = gateRival.id
    gateRival.hp = 1
    save.herbPvp.stamina = HERB_PVP_WEED_COST - 1
    expect(startHerbWeed(save, 3, poor.id)).toEqual({ ok: false, reason: '体力不足' })
    expect(poor.hp).toBe(poor.hpMax)
    expect(gateRival.hp).toBe(1)
    expect(gated.weeder).toBe(gateRival.id)
  })

  it('sends a counter-killed worker home without a march', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const rival = save.herbPvp.rivals[0]!
    const plot = save.herbPvp.plots[3]!
    plot.weeder = rival.id
    plot.progressS = 8
    rival.hp = 500
    rival.atk = 9999
    const knocked = startHerbWeed(save, 3, worker.id)
    expect(knocked.ok).toBe(true)
    if (knocked.ok) {
      expect(knocked.message).toContain('打倒')
      expect(knocked.message).toContain('体力未扣')
    }
    expect(plot.weeder).toBe(rival.id)
    expect(plot.workerId).toBeNull()
    expect(worker.assignment).toBeNull()
    expect(worker.hp).toBe(0)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX)
  })

  it('gives the plot to a rival who knocks the player out, and keeps it when the counter lands', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const rival = save.herbPvp.rivals[2]!
    const plot = save.herbPvp.plots[4]!
    plot.workerId = worker.id
    plot.progressS = 40
    plot.weakness = 'dark'
    plot.durationS = HERB_PVP_WEED_S
    rival.combatAttrs = ['sword']
    rival.hp = 500
    rival.atk = 9999
    rival.onlineUntilS = null
    const stamina = save.herbPvp.stamina
    expect(applyHerbRivalBump(save, 4, rival.id).ok).toBe(true)
    expect(plot.workerId).toBeNull()
    expect(plot.weeder).toBe(rival.id)
    expect(plot.progressS).toBe(40)
    expect(rival.onlineUntilS).not.toBeNull()
    expect(worker.hp).toBe(0)
    expect(save.herbPvp.stamina).toBe(stamina)

    const holder = spawnWorker(save)
    const weak = save.herbPvp.rivals[3]!
    const kept = save.herbPvp.plots[5]!
    kept.workerId = holder.id
    kept.progressS = 15
    weak.hp = 1
    weak.atk = 1
    weak.onlineUntilS = save.elapsedS + 600
    expect(applyHerbRivalBump(save, 5, weak.id).ok).toBe(true)
    expect(kept.workerId).toBe(holder.id)
    expect(kept.weeder).toBeNull()
    expect(kept.progressS).toBe(15)
    expect(weak.hp).toBe(0)
  })

  it('adds precious score only for the rival who finishes the plot', () => {
    const save = fresh()
    quiet(save)
    const rival = save.herbPvp.rivals[0]!
    const plot = save.herbPvp.plots[6]!
    plot.kind = 'precious'
    plot.payload = 'mid'
    plot.qty = 40
    plot.weeder = rival.id
    plot.progressS = HERB_PVP_WEED_S - 1
    stepHerbPvp(save, Date.now())
    expect(rival.score).toBe(40)
    expect(save.herbPvp.playerScore).toBe(0)
    expect(itemQty(save, 'herb')).toBe(0)
  })
})

describe('herb pvp day and offline', () => {
  const midnight = Date.parse('2026-09-28T16:00:00.000Z')

  it('pays the five rank bands once, then clears the scores', () => {
    expect(HERB_PVP_RANK_REWARDS.map((row) => [row.maxRank, row.sandGold, row.jewel, row.jade, row.probes])).toEqual([
      [1, 80, 24, 6, 4],
      [3, 48, 14, 3, 3],
      [10, 28, 8, 2, 2],
      [25, 14, 4, 1, 1],
      [50, 6, 2, 1, 1],
    ])
    for (const rank of [1, 2, 3, 4, 10, 11, 25, 26, 50]) {
      const save = fresh()
      quiet(save)
      holdRank(save, rank)
      save.herbPvp.dayKey = '2026-09-28'
      stepHerbPvp(save, midnight)
      const reward = herbRankReward(rank)
      expect(save.diamonds).toBe(pvpRankDiamonds(rank))
      expect(save.herbPvp.lastRewardText).toContain(`钻石 ${pvpRankDiamonds(rank)}`)
      expect(vaultQty(save, 'sandGold')).toBe(reward.sandGold)
      expect(vaultQty(save, 'jewel')).toBe(reward.jewel)
      expect(vaultQty(save, 'jade')).toBe(reward.jade)
      expect(save.herbPvp.probes).toBe(HERB_PVP_START_PROBES + reward.probes)
      expect(save.herbPvp.playerScore).toBe(0)
      expect(save.herbPvp.rivals.every((rival) => rival.score === 0)).toBe(true)
      expect(save.herbPvp.lastRewardText).toContain(`第${rank}名`)
      expect(save.messages.some((message) => message.title === '割草结算')).toBe(true)
      const sand = vaultQty(save, 'sandGold')
      const diamonds = save.diamonds
      stepHerbPvp(save, midnight + 1000)
      expect(vaultQty(save, 'sandGold')).toBe(sand)
      expect(save.diamonds).toBe(diamonds)
    }
  })

  it('ignores a clock that moves backward', () => {
    const save = fresh()
    quiet(save)
    save.herbPvp.dayKey = '2026-09-29'
    save.herbPvp.playerScore = 80
    stepHerbPvp(save, Date.parse('2026-09-28T00:00:00.000Z'))
    expect(vaultQty(save, 'sandGold')).toBe(0)
    expect(save.herbPvp.playerScore).toBe(80)
    expect(save.messages.some((message) => message.title === '割草结算')).toBe(false)
  })

  it('reports harvest, bumps, rank and yesterday in one offline note', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const plot = save.herbPvp.plots[0]!
    plot.kind = 'common'
    plot.payload = 'spice'
    plot.qty = 3
    plot.workerId = worker.id
    plot.progressS = HERB_PVP_WEED_S - 1
    const silent = fresh()
    quiet(silent)
    beginHerbOfflineReport(silent)
    expect(finishHerbOfflineReport(silent)).toBeNull()
    beginHerbOfflineReport(save)
    stepHerbPvp(save, Date.now(), { offline: true })
    const bumped = spawnWorker(save)
    const lost = save.herbPvp.plots[1]!
    lost.workerId = bumped.id
    lost.progressS = 10
    const rival = save.herbPvp.rivals[1]!
    rival.hp = 500
    rival.atk = 9999
    applyHerbRivalBump(save, 1, rival.id, true)
    save.herbPvp.dayKey = '2026-09-28'
    holdRank(save, 1)
    stepHerbPvp(save, midnight, { offline: true })
    save.herbPvp.rivals[0]!.score = 500
    const body = finishHerbOfflineReport(save)
    expect(body).toContain('除草收获：')
    expect(body).toContain('香料')
    expect(body).toContain('被撞：')
    expect(body).toContain('名次：')
    expect(body).toContain('昨日奖励：')
    expect(save.messages.some((message) => message.title === '割草结算')).toBe(false)
    expect(vaultQty(save, 'sandGold')).toBe(80)
    expect(save.diamonds).toBe(20)
  })

  it('fills defaults when an old save has no herb board', () => {
    const save = fresh()
    save.herbPvp.playerScore = 77
    save.herbPvp.stamina = 3
    save.herbPvp.probes = 0
    const dumped = JSON.parse(JSON.stringify(save)) as Save & { herbPvp?: HerbPvpState }
    const kept = hydrateLoadedSave(dumped)
    expect(kept?.herbPvp.playerScore).toBe(77)
    expect(kept?.herbPvp.stamina).toBe(3)
    expect(kept?.herbPvp.staminaRev).toBe(HERB_PVP_STAMINA_REV)
    expect(kept?.herbPvp.probes).toBe(0)
    expect(kept?.herbPvp.probeRev).toBe(HERB_PVP_PROBE_REV)

    const scaled = JSON.parse(JSON.stringify(save)) as Save
    scaled.herbPvp.stamina = 7
    scaled.herbPvp.staminaAccS = 900
    delete (scaled.herbPvp as { staminaRev?: number }).staminaRev
    const migrated = hydrateLoadedSave(scaled)
    expect(migrated?.herbPvp.playerScore).toBe(77)
    expect(migrated?.herbPvp.stamina).toBe(75)
    expect(migrated?.herbPvp.staminaAccS).toBe(0)
    expect(migrated?.herbPvp.staminaRev).toBe(HERB_PVP_STAMINA_REV)
    const again = hydrateLoadedSave(JSON.parse(JSON.stringify(migrated)))
    expect(again?.herbPvp.stamina).toBe(75)

    const partial = JSON.parse(JSON.stringify(save)) as Save
    partial.herbPvp.stamina = 7
    partial.herbPvp.staminaAccS = 100
    delete (partial.herbPvp as { staminaRev?: number }).staminaRev
    const partialKept = hydrateLoadedSave(partial)
    expect(partialKept?.herbPvp.stamina).toBe(70)
    expect(partialKept?.herbPvp.staminaAccS).toBe(100)

    const legacy = dumped as Omit<Save, 'herbPvp'> & { herbPvp?: HerbPvpState }
    delete legacy.herbPvp
    const rebuilt = hydrateLoadedSave(legacy)
    expect(rebuilt?.herbPvp.plots).toHaveLength(64)
    expect(rebuilt?.herbPvp.rivals).toHaveLength(49)
    expect(rebuilt?.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX)
    expect(rebuilt?.herbPvp.staminaRev).toBe(HERB_PVP_STAMINA_REV)
    expect(rebuilt?.herbPvp.probes).toBe(HERB_PVP_START_PROBES)
    expect(rebuilt?.herbPvp.probeRev).toBe(HERB_PVP_PROBE_REV)
    expect(rebuilt?.herbPvp.playerScore).toBe(0)
    expect(vaultQty(rebuilt!, 'jade')).toBe(0)

    const broken = JSON.parse(JSON.stringify(save)) as Save
    broken.herbPvp.plots = broken.herbPvp.plots.slice(0, 3)
    broken.herbPvp.dayKey = 'nope'
    const replaced = hydrateLoadedSave(broken)
    expect(replaced?.herbPvp.plots).toHaveLength(64)
    expect(replaced?.herbPvp.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(vaultQty(replaced!, 'sandGold')).toBe(0)
  })
})

describe('herb probes', () => {
  it('reveals the centered 3 by 3, including corners, and skips cleared cells', () => {
    const save = fresh()
    quiet(save)
    save.herbPvp.plots[1]!.cleared = true
    expect(useHerbProbe(save, 0)).toEqual({ ok: true, message: '揭开 3 块地' })
    const opened = save.herbPvp.plots.filter((plot) => plot.revealed).map((plot) => plot.index)
    expect(opened).toEqual([0, 8, 9])
    expect(save.herbPvp.plots[1]!.revealed).toBe(false)
    expect(save.herbPvp.plots[2]!.revealed).toBe(false)
    expect(save.herbPvp.probes).toBe(HERB_PVP_START_PROBES - 1)

    expect(useHerbProbe(save, 63).ok).toBe(true)
    for (const index of [54, 55, 62, 63]) expect(save.herbPvp.plots[index]!.revealed).toBe(true)
    expect(save.herbPvp.plots[53]!.revealed).toBe(false)
    expect(save.herbPvp.plots[61]!.revealed).toBe(false)

    expect(useHerbProbe(save, 27).ok).toBe(true)
    for (const index of herbProbeCells(27)) expect(save.herbPvp.plots[index]!.revealed).toBe(true)
    expect(herbProbeCells(27)).toHaveLength(9)
    expect(save.herbPvp.probes).toBe(0)
    expect(useHerbProbe(save, 4)).toEqual({ ok: false, reason: '没有侦测' })
    expect(save.herbPvp.plots[4]!.revealed).toBe(false)
  })

  it('drops the three old probe stacks and sets the new one to 3 once', () => {
    expect(SAVE_KEY).toBe('idea5Idle')
    expect(HERB_PVP_PROBE_REV).toBe(2)
    type Legacy = Omit<HerbPvpState, 'probes' | 'probeRev'> & {
      probe1?: number
      probe2?: number
      probe4?: number
      probes?: number
      probeRev?: number
    }

    function strip(save: Save): Legacy {
      const raw = save.herbPvp as Legacy
      delete raw.probes
      delete raw.probeRev
      return raw
    }

    const each = fresh()
    const eachRaw = strip(each)
    eachRaw.probe1 = 1
    eachRaw.probe2 = 1
    eachRaw.probe4 = 1
    const reset = hydrateLoadedSave(JSON.parse(JSON.stringify(each)))
    expect(reset?.herbPvp.probes).toBe(3)
    expect(reset?.herbPvp.probeRev).toBe(HERB_PVP_PROBE_REV)
    expect(reset?.herbPvp).not.toHaveProperty('probe1')
    expect(reset?.herbPvp).not.toHaveProperty('probe2')
    expect(reset?.herbPvp).not.toHaveProperty('probe4')
    const again = hydrateLoadedSave(JSON.parse(JSON.stringify(reset)))
    expect(again?.herbPvp.probes).toBe(3)

    const mixed = fresh()
    const mixedRaw = strip(mixed)
    mixedRaw.probes = 9
    mixedRaw.probe1 = 2
    mixedRaw.probe2 = 0
    mixedRaw.probe4 = 3
    expect(hydrateLoadedSave(JSON.parse(JSON.stringify(mixed)))?.herbPvp.probes).toBe(3)

    const summed = fresh()
    summed.herbPvp.probes = 8
    summed.herbPvp.probeRev = 1
    ;(summed.herbPvp as Legacy).probe1 = 4
    const corrected = hydrateLoadedSave(JSON.parse(JSON.stringify(summed)))
    expect(corrected?.herbPvp.probes).toBe(3)
    expect(corrected?.herbPvp).not.toHaveProperty('probe1')
    const stayed = hydrateLoadedSave(JSON.parse(JSON.stringify(corrected)))
    expect(stayed?.herbPvp.probes).toBe(3)

    const done = fresh()
    done.herbPvp.probes = 5
    ;(done.herbPvp as Legacy).probe1 = 9
    const kept = hydrateLoadedSave(JSON.parse(JSON.stringify(done)))
    expect(kept?.herbPvp.probes).toBe(5)
    expect(kept?.herbPvp.probeRev).toBe(HERB_PVP_PROBE_REV)
    expect(kept?.herbPvp).not.toHaveProperty('probe1')
  })
})

describe('herb clear events', () => {
  it('emits a live harvest and skips an offline finish', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const plot = save.herbPvp.plots[0]!
    plot.kind = 'common'
    plot.payload = 'herb'
    plot.qty = 2
    plot.workerId = worker.id
    plot.progressS = HERB_PVP_WEED_S - 1
    plot.durationS = HERB_PVP_WEED_S
    stepHerbPvp(save, Date.now(), { offline: true })
    expect(plot.cleared).toBe(true)
    expect(takeHerbClearEvents()).toEqual([])

    const live = fresh()
    quiet(live)
    const mower = spawnWorker(live)
    const herb = live.herbPvp.plots[4]!
    herb.kind = 'common'
    herb.payload = 'herb'
    herb.qty = 2
    herb.workerId = mower.id
    herb.progressS = HERB_PVP_WEED_S - 1
    herb.durationS = HERB_PVP_WEED_S
    stepHerbPvp(live, Date.now())
    expect(takeHerbClearEvents()).toEqual([{ plotIndex: 4, tone: 'self', text: '草 ×2', alert: false }])
  })

  it('names the rival and alerts only when the clear touches a player plot', () => {
    const save = fresh()
    quiet(save)
    const rival = save.herbPvp.rivals[0]!
    const stolen = save.herbPvp.plots[0]!
    stolen.kind = 'barren'
    stolen.weeder = rival.id
    stolen.progressS = HERB_PVP_WEED_S - 1
    stolen.durationS = HERB_PVP_WEED_S
    const mine = save.herbPvp.plots[1]!
    const worker = spawnWorker(save)
    mine.workerId = worker.id
    mine.progressS = 10
    mine.durationS = HERB_PVP_WEED_S
    stepHerbPvp(save, Date.now())
    expect(takeHerbClearEvents()).toEqual([
      { plotIndex: 0, tone: 'rival', text: `${rival.name} 割走了`, alert: true },
    ])

    const far = fresh()
    quiet(far)
    const other = far.herbPvp.rivals[1]!
    const edge = far.herbPvp.plots[0]!
    edge.weeder = other.id
    edge.progressS = HERB_PVP_WEED_S - 1
    edge.durationS = HERB_PVP_WEED_S
    const away = far.herbPvp.plots[3]!
    const person = spawnWorker(far)
    away.workerId = person.id
    away.progressS = 1
    away.durationS = HERB_PVP_WEED_S
    stepHerbPvp(far, Date.now())
    expect(takeHerbClearEvents()).toEqual([
      { plotIndex: 0, tone: 'rival', text: `${other.name} 割走了`, alert: false },
    ])
  })

  it('emits every live finish from one step so the view can cap playback', () => {
    const save = fresh()
    quiet(save)
    for (let index = 0; index < 4; index += 1) {
      const plot = save.herbPvp.plots[index]!
      plot.weeder = save.herbPvp.rivals[index]!.id
      plot.progressS = HERB_PVP_WEED_S - 1
      plot.durationS = HERB_PVP_WEED_S
    }
    stepHerbPvp(save, Date.now())
    const events = takeHerbClearEvents()
    expect(events).toHaveLength(4)
    expect(events.every((event) => event.tone === 'rival' && event.text.endsWith('割走了'))).toBe(true)
  })
})

describe('herb clash events', () => {
  it('records the settled blow when the player strikes first', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorkerWith(save, 5, 'herbalist', ['fire'])
    worker.name = '割草甲'
    const rival = save.herbPvp.rivals[2]!
    const plot = save.herbPvp.plots[6]!
    plot.weakness = 'sword'
    plot.weeder = rival.id
    plot.durationS = HERB_PVP_WEED_S
    rival.hp = 1
    rival.hpMax = 80
    rival.atk = 40
    const playerHp = worker.hp
    expect(startHerbWeed(save, 6, worker.id).ok).toBe(true)
    const [event] = takeHerbClashEvents()
    expect(event?.plotIndex).toBe(6)
    expect(event?.attacker).toBe('player')
    expect(event?.result).toBe('took')
    expect(herbClashResultText(event!.result)).toBe('抢下这块地')
    expect(event?.player.name).toBe('割草甲')
    expect(event?.player.classId).toBe('herbalist')
    expect(event?.player.race).toBe(worker.race)
    expect(event?.player.qualityTier).toBe(worker.qualityTier)
    expect(event?.player.workerId).toBe(worker.id)
    expect(event?.player.hpStart).toBe(playerHp)
    expect(event?.player.hpEnd).toBe(playerHp)
    expect(event?.rival.name).toBe(rival.name)
    expect(event?.rival.avatarId).toBe(rival.avatarId)
    expect(event?.rival.hpStart).toBe(1)
    expect(event?.rival.hpEnd).toBe(0)
    expect(event?.playerDamage).toBe(1)
    expect(event?.rivalDamage).toBe(0)
    expect(takeHerbClashEvents()).toEqual([])
  })

  it('records a trade when neither side dies on the first hit', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const rival = save.herbPvp.rivals[0]!
    const plot = save.herbPvp.plots[1]!
    plot.weeder = rival.id
    plot.durationS = HERB_PVP_WEED_S
    rival.hp = 500
    rival.hpMax = 500
    rival.atk = 3
    const playerHp = worker.hp
    expect(startHerbWeed(save, 1, worker.id).ok).toBe(true)
    const [event] = takeHerbClashEvents()
    expect(event?.attacker).toBe('player')
    expect(event?.result).toBe('lost')
    expect(herbClashResultText('lost')).toBe('没打过')
    expect(event?.playerDamage).toBe(event!.rival.hpStart - event!.rival.hpEnd)
    expect(event?.rivalDamage).toBe(playerHp - event!.player.hpEnd)
    expect(event?.playerDamage).toBeGreaterThan(0)
    expect(event?.rivalDamage).toBeGreaterThan(0)
    expect(event?.player.hpEnd).toBeLessThan(playerHp)
    expect(plot.workerId).toBeNull()
  })

  it('records an incoming bump with the player defending, and skips offline replay', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorkerWith(save, 5, 'herbalist', ['sword'])
    const plot = save.herbPvp.plots[4]!
    plot.workerId = worker.id
    plot.progressS = 8
    plot.durationS = HERB_PVP_WEED_S
    const rival = save.herbPvp.rivals[3]!
    rival.hp = 1
    rival.hpMax = 40
    rival.atk = 1
    expect(applyHerbRivalBump(save, 4, rival.id, true).ok).toBe(true)
    expect(takeHerbClashEvents()).toEqual([])

    const live = fresh()
    quiet(live)
    const mower = spawnWorker(live)
    const mine = live.herbPvp.plots[5]!
    mine.workerId = mower.id
    mine.progressS = 4
    mine.durationS = HERB_PVP_WEED_S
    const foe = live.herbPvp.rivals[4]!
    foe.hp = 400
    foe.hpMax = 400
    foe.atk = 1
    expect(applyHerbRivalBump(live, 5, foe.id).ok).toBe(true)
    const [event] = takeHerbClashEvents()
    expect(event?.attacker).toBe('rival')
    expect(event?.plotIndex).toBe(5)
    expect(event?.result).toBe('held')
    expect(herbClashResultText('held')).toBe('还在除')
    expect(event?.rivalDamage).toBeGreaterThan(0)
    expect(event?.playerDamage).toBeGreaterThan(0)
    expect(event?.player.hpEnd).toBe(mower.hp)
    expect(event?.rival.hpEnd).toBe(foe.hp)
    expect(mine.workerId).toBe(mower.id)
  })
})

describe('herb plot weakness', () => {
  it('rolls one shared weakness per plot and rerolls the whole map', () => {
    const save = fresh()
    quiet(save)
    expect(HERB_PVP_COUNTER_RULE).toBe('苦工克制这块地的弱点：割草 2 分钟、只扣 7 点体力')
    expect(save.herbPvp.plots).toHaveLength(64)
    const seen = new Set(save.herbPvp.plots.map((plot) => plot.weakness))
    expect(seen.size).toBeGreaterThan(1)
    for (const plot of save.herbPvp.plots) {
      expect(COMBAT_ATTR_IDS).toContain(plot.weakness)
      expect(herbPlotShowsWeakness(plot)).toBe(true)
    }
    expect(rollCombatWeakness(0)).toBe(COMBAT_ATTR_IDS[0])
    expect(rollCombatWeakness(0.999)).toBe(COMBAT_ATTR_IDS[COMBAT_ATTR_IDS.length - 1])

    for (const plot of save.herbPvp.plots) {
      plot.cleared = true
      plot.workerId = null
      plot.weeder = null
    }
    setHerbRollOverride(() => 0)
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.plots.every((plot) => plot.weakness === 'sword' && plot.kind === 'barren' && !plot.cleared)).toBe(true)
    const hidden = save.herbPvp.plots[0]!
    expect(herbPlotShowsWeakness(hidden)).toBe(true)
    hidden.revealed = true
    expect(herbPlotShowsWeakness(hidden)).toBe(false)
    hidden.revealed = false
    hidden.cleared = true
    expect(herbPlotShowsWeakness(hidden)).toBe(false)

    for (const plot of save.herbPvp.plots) {
      plot.cleared = true
      plot.revealed = false
      plot.workerId = null
      plot.weeder = null
    }
    setHerbRollOverride(() => 0.999)
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.plots.every((plot) => plot.weakness === 'dark' && !plot.cleared)).toBe(true)
    const open = save.herbPvp.plots[1]!
    open.kind = 'common'
    open.revealed = true
    expect(herbPlotShowsWeakness(open)).toBe(true)
  })

  it('uses the same counter check as a mine weakness', () => {
    const samples: Array<[CombatAttrId[] | undefined, CombatAttrId[] | undefined]> = [
      [undefined, undefined],
      [[], []],
      [['fire'], ['fire']],
      [['fire', 'fire'], ['fire']],
      [['sword', 'fire'], ['ice', 'fire']],
      [['sword'], ['fire', 'ice']],
      [undefined, ['fire']],
    ]
    for (const [attrs, weak] of samples) {
      expect(workerMatchesMineWeakness(attrs, weak)).toBe(workerMatchesWeakness(attrs, weak))
      expect(herbWorkerCounters(attrs, weak?.[0])).toBe(workerMatchesWeakness(attrs, weak?.[0] ? [weak[0]] : []))
    }
    expect(herbWeedSeconds(true)).toBe(HERB_PVP_WEED_FAST_S)
    expect(herbWeedSeconds(false)).toBe(HERB_PVP_WEED_S)
    expect(herbWeedCost(true)).toBe(HERB_PVP_WEED_FAST_COST)
    expect(herbWeedCost(false)).toBe(HERB_PVP_WEED_COST)
    expect(herbStrikeDamage(12)).toBe(scaledAttackDamage(12, 1))
  })

  it('keeps finished ratio and rescales the remainder onto the new duration', () => {
    expect(inheritHerbProgress(90, HERB_PVP_WEED_S, HERB_PVP_WEED_FAST_S)).toBe(60)
    expect(HERB_PVP_WEED_FAST_S - inheritHerbProgress(90, HERB_PVP_WEED_S, HERB_PVP_WEED_FAST_S)).toBe(60)
    expect(inheritHerbProgress(60, HERB_PVP_WEED_FAST_S, HERB_PVP_WEED_S)).toBe(90)
    expect(HERB_PVP_WEED_S - inheritHerbProgress(60, HERB_PVP_WEED_FAST_S, HERB_PVP_WEED_S)).toBe(90)
    expect(inheritHerbProgress(50, HERB_PVP_WEED_S, HERB_PVP_WEED_S)).toBe(50)
  })

  it('weeds in two minutes for 7 stamina when the worker counters, else three minutes for 10', () => {
    const save = fresh()
    quiet(save)
    const fast = spawnWorkerWith(save, 2, 'herbalist', ['fire'])
    const plot = save.herbPvp.plots[0]!
    plot.kind = 'common'
    plot.payload = 'herb'
    plot.qty = 2
    plot.weakness = 'fire'
    const started = startHerbWeed(save, 0, fast.id)
    expect(started.ok).toBe(true)
    if (started.ok) expect(started.message).toContain('花 7 体力')
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX - HERB_PVP_WEED_FAST_COST)
    expect(plot.durationS).toBe(HERB_PVP_WEED_FAST_S)
    plot.progressS = HERB_PVP_WEED_FAST_S - 1
    stepHerbPvp(save, Date.now())
    expect(plot.cleared).toBe(true)
    expect(itemQty(save, 'herb')).toBe(2)

    const slow = spawnWorkerWith(save, 2, 'herbalist', ['sword'])
    const other = save.herbPvp.plots[1]!
    other.kind = 'common'
    other.payload = 'herb'
    other.qty = 2
    other.weakness = 'fire'
    save.herbPvp.stamina = HERB_PVP_WEED_FAST_COST
    expect(startHerbWeed(save, 1, slow.id)).toEqual({ ok: false, reason: '体力不足' })
    save.herbPvp.stamina = HERB_PVP_WEED_COST
    const slowStart = startHerbWeed(save, 1, slow.id)
    expect(slowStart.ok).toBe(true)
    if (slowStart.ok) expect(slowStart.message).toContain('花 10 体力')
    expect(other.durationS).toBe(HERB_PVP_WEED_S)
    expect(save.herbPvp.stamina).toBe(0)
    other.progressS = HERB_PVP_WEED_FAST_S
    stepHerbPvp(save, Date.now())
    expect(other.cleared).toBe(false)
    expect(other.progressS).toBe(HERB_PVP_WEED_FAST_S + 1)
    other.progressS = HERB_PVP_WEED_S - 1
    stepHerbPvp(save, Date.now())
    expect(other.cleared).toBe(true)
    expect(itemQty(save, 'herb')).toBe(4)

    const again = spawnWorkerWith(save, 2, 'herbalist', ['fire'])
    const gated = save.herbPvp.plots[2]!
    gated.weakness = 'fire'
    save.herbPvp.stamina = HERB_PVP_WEED_FAST_COST - 1
    expect(startHerbWeed(save, 2, again.id)).toEqual({ ok: false, reason: '体力不足' })
    save.herbPvp.stamina = HERB_PVP_WEED_FAST_COST
    expect(startHerbWeed(save, 2, again.id).ok).toBe(true)
    expect(save.herbPvp.stamina).toBe(0)
  })

  it('charges 7 or 10 on a successful steal and rescales inherited progress', () => {
    const save = fresh()
    quiet(save)
    const fast = spawnWorkerWith(save, 2, 'herbalist', ['fire'])
    const rival = save.herbPvp.rivals[0]!
    rival.hp = 1
    rival.atk = 1
    rival.combatAttrs = ['sword']
    const plot = save.herbPvp.plots[0]!
    plot.weakness = 'fire'
    plot.weeder = rival.id
    plot.durationS = HERB_PVP_WEED_S
    plot.progressS = 90
    const taken = startHerbWeed(save, 0, fast.id)
    expect(taken.ok).toBe(true)
    if (taken.ok) expect(taken.message).toContain('花 7 体力')
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX - 7)
    expect(plot.workerId).toBe(fast.id)
    expect(plot.durationS).toBe(HERB_PVP_WEED_FAST_S)
    expect(plot.progressS).toBe(60)

    const slow = spawnWorkerWith(save, 2, 'herbalist', ['sword'])
    const rival2 = save.herbPvp.rivals[1]!
    rival2.hp = 1
    rival2.atk = 1
    const kept = save.herbPvp.plots[1]!
    kept.weakness = 'fire'
    kept.weeder = rival2.id
    kept.durationS = HERB_PVP_WEED_FAST_S
    kept.progressS = 60
    const before = save.herbPvp.stamina
    const plain = startHerbWeed(save, 1, slow.id)
    expect(plain.ok).toBe(true)
    if (plain.ok) expect(plain.message).toContain('花 10 体力')
    expect(save.herbPvp.stamina).toBe(before - 10)
    expect(kept.durationS).toBe(HERB_PVP_WEED_S)
    expect(kept.progressS).toBe(90)

    const holder = spawnWorkerWith(save, 2, 'herbalist', ['ice'])
    const thief = save.herbPvp.rivals[2]!
    const lost = save.herbPvp.plots[2]!
    lost.workerId = holder.id
    lost.weakness = 'fire'
    lost.durationS = HERB_PVP_WEED_S
    lost.progressS = 90
    thief.combatAttrs = ['fire']
    thief.hp = 500
    thief.atk = 9999
    thief.onlineUntilS = null
    const stamina = save.herbPvp.stamina
    expect(applyHerbRivalBump(save, 2, thief.id).ok).toBe(true)
    expect(lost.workerId).toBeNull()
    expect(lost.weeder).toBe(thief.id)
    expect(lost.durationS).toBe(HERB_PVP_WEED_FAST_S)
    expect(lost.progressS).toBe(60)
    expect(save.herbPvp.stamina).toBe(stamina)
  })

  it('does not change clash damage when the worker counters the plot', () => {
    function wound(attrs: CombatAttrId[]): number {
      const save = fresh()
      quiet(save)
      const worker = spawnWorkerWith(save, 5, 'herbalist', attrs)
      const rival = save.herbPvp.rivals[0]!
      const plot = save.herbPvp.plots[0]!
      plot.weakness = 'fire'
      plot.weeder = rival.id
      plot.durationS = HERB_PVP_WEED_S
      rival.hp = 500
      rival.atk = 1
      rival.combatAttrs = ['ice']
      startHerbWeed(save, 0, worker.id)
      return 500 - rival.hp
    }
    expect(wound(['fire', 'sword'])).toBe(wound(['ice', 'bow']))
    expect(wound(['fire', 'sword'])).toBeGreaterThan(0)
  })

  it('lets a countering rival finish in two minutes', () => {
    const save = fresh()
    quiet(save)
    save.elapsedS = 5_000
    save.herbPvp.onlineTarget = 1
    save.herbPvp.targetUntilS = Number.MAX_SAFE_INTEGER
    const rival = save.herbPvp.rivals[0]!
    for (const row of save.herbPvp.rivals) {
      row.onlineUntilS = null
      row.nextOnlineAtS = Number.MAX_SAFE_INTEGER
      row.combatAttrs = ['sword']
    }
    rival.nextOnlineAtS = 0
    rival.combatAttrs = ['fire']
    for (const plot of save.herbPvp.plots) {
      plot.cleared = false
      plot.weeder = null
      plot.workerId = null
      plot.weakness = 'fire'
      plot.progressS = 0
      plot.durationS = 0
      plot.kind = 'barren'
    }
    const stamina = save.herbPvp.stamina
    stepHerbPvp(save, Date.now())
    const held = save.herbPvp.plots.filter((plot) => plot.weeder === rival.id)
    expect(held.length).toBeGreaterThanOrEqual(1)
    expect(held.every((plot) => plot.durationS === HERB_PVP_WEED_FAST_S && plot.progressS === 0)).toBe(true)
    expect(save.herbPvp.stamina).toBe(stamina)
    const plot = held[0]!
    plot.progressS = HERB_PVP_WEED_FAST_S - 1
    stepHerbPvp(save, Date.now())
    expect(plot.cleared).toBe(true)

    const slow = save.herbPvp.rivals[1]!
    slow.nextOnlineAtS = 0
    slow.combatAttrs = ['sword']
    slow.onlineUntilS = null
    save.herbPvp.onlineTarget = 2
    for (const row of save.herbPvp.plots) {
      if (row.weeder || row.workerId) continue
      row.weakness = 'fire'
      row.cleared = false
    }
    stepHerbPvp(save, Date.now())
    const slowHeld = save.herbPvp.plots.filter((plot) => plot.weeder === slow.id)
    expect(slowHeld.length).toBeGreaterThanOrEqual(1)
    expect(slowHeld.every((plot) => plot.durationS === HERB_PVP_WEED_S)).toBe(true)
  })

  it('fills old plots with a weakness without moving an in-progress end', () => {
    expect(SAVE_KEY).toBe('idea5Idle')
    const save = fresh()
    quiet(save)
    const worker = spawnWorkerWith(save, 5, 'herbalist', ['fire'])
    const plot = save.herbPvp.plots[3]!
    plot.workerId = worker.id
    plot.progressS = 40
    plot.weakness = undefined as unknown as HerbPlot['weakness']
    plot.durationS = undefined as unknown as number
    const rival = save.herbPvp.rivals[4]!
    rival.combatAttrs = undefined as unknown as CombatAttrId[]
    const dumped = JSON.parse(JSON.stringify(save)) as Save
    const kept = hydrateLoadedSave(dumped)
    const again = kept?.herbPvp.plots[3]
    expect(again?.workerId).toBe(worker.id)
    expect(again?.progressS).toBe(40)
    expect(again?.durationS).toBe(HERB_PVP_WEED_S)
    expect(HERB_PVP_WEED_S - (again?.progressS ?? 0)).toBe(HERB_PVP_WEED_S - 40)
    expect(COMBAT_ATTR_IDS).toContain(again?.weakness)
    expect(kept?.herbPvp.plots.every((row) => COMBAT_ATTR_IDS.includes(row.weakness))).toBe(true)
    expect(kept?.herbPvp.rivals[4]?.combatAttrs.length).toBe(2)
    const weak = again?.weakness
    const twice = hydrateLoadedSave(JSON.parse(JSON.stringify(kept)))
    expect(twice?.herbPvp.plots[3]?.weakness).toBe(weak)
    expect(twice?.herbPvp.plots[3]?.progressS).toBe(40)
    expect(twice?.herbPvp.plots[3]?.durationS).toBe(HERB_PVP_WEED_S)
  })

  it('sorts countering workers first and marks them', () => {
    const workers = [
      { id: 'a', combatAttrs: ['sword'] as CombatAttrId[] },
      { id: 'b', combatAttrs: ['fire'] as CombatAttrId[] },
      { id: 'c', combatAttrs: ['ice'] as CombatAttrId[] },
      { id: 'd', combatAttrs: ['fire', 'bow'] as CombatAttrId[] },
    ]
    expect(orderHerbPick(workers, 'fire').map((worker) => worker.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(workers.map((worker) => worker.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(herbCounterMark(workers[1]?.combatAttrs, 'fire')).toBe('克制')
    expect(herbCounterMark(workers[3]?.combatAttrs, 'fire')).toBe('克制')
    expect(herbCounterMark(workers[0]?.combatAttrs, 'fire')).toBeNull()
    expect(herbCounterMark(['sword'], undefined)).toBeNull()
  })
})

describe('herb pvp rival marks', () => {
  it('marks the rival after a clash, including when the worker is sent home', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const rival = save.herbPvp.rivals[0]!
    const plot = save.herbPvp.plots[2]!
    plot.weeder = rival.id
    plot.progressS = 12
    plot.durationS = HERB_PVP_WEED_S
    rival.hp = 500
    rival.hpMax = 500
    rival.atk = 1
    const stamina = save.herbPvp.stamina
    const result = startHerbWeed(save, 2, worker.id)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('体力未扣')
    expect(plot.weeder).toBe(rival.id)
    expect(plot.workerId).toBeNull()
    expect(plot.progressS).toBe(12)
    expect(plot.markedRivalId).toBe(rival.id)
    expect(save.herbPvp.stamina).toBe(stamina)
    expect(restingWorkers(save).some((row) => row.id === worker.id)).toBe(true)
    expect(worker.hp).toBeLessThan(worker.hpMax)
    const spot = herbPlotSpot(save, plot)
    expect(spot?.name).toBe(rival.name)
    expect(spot?.avatarId).toBe(rival.avatarId)
    expect(spot?.hp).toBe(rival.hp)
    expect(spot?.hp).toBeLessThan(spot?.hpMax ?? 0)
    rival.hp -= 3
    rival.name = '改过的名字'
    rival.avatarId = 'lion'
    expect(herbPlotSpot(save, plot)).toMatchObject({ name: '改过的名字', avatarId: 'lion', hp: rival.hp })
    stepHerbPvp(save, Date.now())
    expect(plot.markedRivalId).toBe(rival.id)
    expect(plot.progressS).toBe(13)
    expect(herbPlotSpot(save, plot)?.hp).toBe(rival.hp)

    const downed = spawnWorker(save)
    const hard = save.herbPvp.rivals[4]!
    const blocked = save.herbPvp.plots[6]!
    blocked.weeder = hard.id
    blocked.progressS = 8
    blocked.durationS = HERB_PVP_WEED_S
    hard.hp = 500
    hard.hpMax = 500
    hard.atk = 9999
    const knocked = startHerbWeed(save, 6, downed.id)
    expect(knocked.ok).toBe(true)
    expect(downed.hp).toBe(0)
    expect(downed.assignment).toBeNull()
    expect(blocked.markedRivalId).toBe(hard.id)
    expect(blocked.weeder).toBe(hard.id)
    expect(blocked.progressS).toBe(8)
    expect(hard.hp).toBeGreaterThan(0)
    expect(hard.hp).toBeLessThan(500)
    expect(herbPlotSpot(save, blocked)?.hp).toBe(hard.hp)
    expect(save.herbPvp.stamina).toBe(stamina)
  })

  it('clears the mark when the rival finishes the plot, dies, or leaves', () => {
    const save = fresh()
    quiet(save)
    const rival = save.herbPvp.rivals[0]!
    const done = save.herbPvp.plots[0]!
    const kept = save.herbPvp.plots[1]!
    done.kind = 'barren'
    done.weeder = rival.id
    done.markedRivalId = rival.id
    done.durationS = HERB_PVP_WEED_S
    done.progressS = HERB_PVP_WEED_S - 1
    kept.kind = 'barren'
    kept.weeder = rival.id
    kept.markedRivalId = rival.id
    kept.durationS = HERB_PVP_WEED_S
    kept.progressS = 4
    stepHerbPvp(save, Date.now())
    expect(done.cleared).toBe(true)
    expect(done.markedRivalId).toBeNull()
    expect(herbPlotSpot(save, done)).toBeNull()
    expect(kept.markedRivalId).toBe(rival.id)
    expect(kept.weeder).toBe(rival.id)
    expect(herbPlotSpot(save, kept)?.rivalId).toBe(rival.id)

    rival.hp = 1
    rival.atk = 1
    const worker = spawnWorker(save)
    kept.weakness = plainWeakness(worker.combatAttrs)
    const progress = kept.progressS
    const taken = startHerbWeed(save, 1, worker.id)
    expect(taken.ok).toBe(true)
    expect(kept.markedRivalId).toBeNull()
    expect(herbPlotSpot(save, kept)).toBeNull()
    expect(kept.workerId).toBe(worker.id)
    expect(kept.weeder).toBeNull()
    expect(kept.progressS).toBe(progress)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX - HERB_PVP_WEED_COST)

    const other = save.herbPvp.rivals[1]!
    const stale = save.herbPvp.plots[3]!
    stale.markedRivalId = other.id
    stale.weeder = null
    stale.cleared = false
    other.hp = 20
    other.onlineUntilS = save.elapsedS
    stepHerbPvp(save, Date.now())
    expect(stale.markedRivalId).toBeNull()
    expect(other.onlineUntilS).toBeNull()
  })

  it('marks a rival who is weeding when a probe opens the cell', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const rival = save.herbPvp.rivals[2]!
    const occupied = save.herbPvp.plots[0]!
    const empty = save.herbPvp.plots[1]!
    const outside = save.herbPvp.plots[2]!
    const own = save.herbPvp.plots[16]!
    occupied.weeder = rival.id
    occupied.revealed = true
    occupied.progressS = 7
    occupied.durationS = HERB_PVP_WEED_S
    empty.weeder = null
    own.workerId = worker.id
    own.progressS = 3
    own.durationS = HERB_PVP_WEED_S
    expect(useHerbProbe(save, 0).ok).toBe(true)
    expect(occupied.markedRivalId).toBe(rival.id)
    expect(occupied.revealed).toBe(true)
    expect(occupied.progressS).toBe(7)
    expect(herbPlotSpot(save, occupied)?.name).toBe(rival.name)
    expect(herbPlotSpot(save, occupied)?.hp).toBe(rival.hp)
    expect(empty.revealed).toBe(true)
    expect(empty.markedRivalId).toBeNull()
    expect(herbPlotSpot(save, empty)).toBeNull()
    expect(outside.revealed).toBe(false)
    expect(outside.markedRivalId).toBeNull()
    expect(save.herbPvp.probes).toBe(HERB_PVP_START_PROBES - 1)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX)
    expect(useHerbProbe(save, 16).ok).toBe(true)
    expect(own.revealed).toBe(true)
    expect(own.markedRivalId).toBeNull()
    expect(own.workerId).toBe(worker.id)
    expect(save.herbPvp.probes).toBe(HERB_PVP_START_PROBES - 2)
  })

  it('clears every mark when the map refreshes', () => {
    const save = fresh()
    quiet(save)
    const first = save.herbPvp.rivals[0]!
    const second = save.herbPvp.rivals[1]!
    save.herbPvp.plots[0]!.markedRivalId = first.id
    save.herbPvp.plots[0]!.weeder = first.id
    save.herbPvp.plots[4]!.markedRivalId = second.id
    for (const plot of save.herbPvp.plots) {
      plot.cleared = true
      plot.workerId = null
      plot.weeder = null
    }
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.plots).toHaveLength(HERB_PVP_PLOT_COUNT)
    expect(save.herbPvp.plots.every((plot) => plot.markedRivalId == null && plot.revealed === false && plot.cleared === false)).toBe(
      true,
    )
  })

  it('keeps marks in the save and leaves old boards unmarked', () => {
    const save = fresh()
    quiet(save)
    const rival = save.herbPvp.rivals[3]!
    const plot = save.herbPvp.plots[5]!
    plot.weeder = rival.id
    plot.markedRivalId = rival.id
    plot.progressS = 9
    plot.durationS = HERB_PVP_WEED_S
    expect(SAVE_KEY).toBe('idea5Idle')
    const store = memory()
    persistSave(save, store)
    const raw = store.getItem(SAVE_KEY) ?? ''
    expect(raw).toContain(rival.id)
    const loaded = loadSave(store)
    const kept = loaded?.herbPvp.plots[5]
    expect(kept?.markedRivalId).toBe(rival.id)
    expect(kept?.progressS).toBe(9)
    expect(herbPlotSpot(loaded!, kept!)?.name).toBe(rival.name)
    expect(herbPlotSpot(loaded!, kept!)?.hp).toBe(rival.hp)

    const legacy = JSON.parse(JSON.stringify(save)) as Save
    for (const row of legacy.herbPvp.plots) delete (row as { markedRivalId?: string }).markedRivalId
    const old = hydrateLoadedSave(legacy)
    expect(old?.herbPvp.plots.every((row) => row.markedRivalId == null)).toBe(true)
    expect(old?.herbPvp.plots[5]!.weeder).toBe(rival.id)

    const junk = JSON.parse(JSON.stringify(save)) as Save
    junk.herbPvp.plots[0]!.markedRivalId = 'no-such'
    junk.herbPvp.plots[0]!.weeder = rival.id
    const cleaned = hydrateLoadedSave(junk)
    expect(cleaned?.herbPvp.plots[0]!.markedRivalId).toBeNull()
    expect(cleaned?.herbPvp.plots[5]!.markedRivalId).toBe(rival.id)
  })
})

describe('herb stamina bubble', () => {
  it('says the bar is full', () => {
    expect(herbStaminaBubbleText(100, 0, 0)).toBe('已满')
    expect(herbStaminaBubbleText(HERB_PVP_STAMINA_MAX, 40, 0.8)).toBe('已满')
    expect(herbStaminaFill(100, 0, 0.4)).toBe(1)
  })

  it('counts minutes and seconds to the next point, and hours to full', () => {
    expect(herbStaminaBubbleText(63, 0, 0)).toBe('3 分 0 秒后 +1、1 小时 51 分后回满')
    expect(herbStaminaBubbleText(63, 90, 0)).toBe('1 分 30 秒后 +1、1 小时 50 分后回满')
    expect(herbStaminaBubbleText(99, 135, 0)).toBe('0 分 45 秒后 +1、0 小时 1 分后回满')
    expect(herbStaminaBubbleText(0, 0, 0)).toBe('3 分 0 秒后 +1、5 小时 0 分后回满')
    expect(herbStaminaBubbleText(63, 0, 0.4)).toBe('3 分 0 秒后 +1、1 小时 51 分后回满')
    expect(herbStaminaBubbleText(63, 1, 0)).toBe('2 分 59 秒后 +1、1 小时 51 分后回满')
    expect(herbStaminaFill(63, 0, 0)).toBeCloseTo(63 / 100)
    expect(herbStaminaFill(63, 90, 0)).toBeCloseTo(63.5 / 100)
  })
})
