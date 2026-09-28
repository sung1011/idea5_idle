import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker, restingWorkers } from './assign'
import { itemQty } from './bank'
import { combatPartyBlockReason } from './combat'
import { createSave } from './createSave'
import {
  HERB_PVP_PLAYER_CAP,
  HERB_PVP_PLOT_COUNT,
  HERB_PVP_RANK_REWARDS,
  HERB_PVP_RIVAL_COUNT,
  HERB_PVP_RIVAL_ONLINE_MAX,
  HERB_PVP_STAMINA_MAX,
  HERB_PVP_STAMINA_REGEN_S,
  HERB_PVP_WEED_S,
  applyHerbRivalBump,
  beginHerbOfflineReport,
  beijingDayKey,
  classifyHerbRoll,
  finishHerbOfflineReport,
  herbCommonQty,
  herbPlayerRank,
  herbPreciousOf,
  herbProbeCells,
  herbRankReward,
  hydrateHerbPvp,
  setHerbRollOverride,
  startHerbWeed,
  stepHerbPvp,
  unlockedHerbalismProducts,
  useHerbProbe,
} from './herbPvp'
import { PLAYER_AVATAR_IDS } from './playerAvatarIds'
import { spawnWorker } from './recruit'
import { SNAPSHOT_PLAYER_NAMES, vaultQty } from './treasureMine'
import type { HerbPvpState, Save } from './types'
import { hydrateLoadedSave } from '../ui/saveGame'

afterEach(() => {
  setHerbRollOverride(null)
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
    plot.workerId = null
    plot.progressS = 0
  }
}

function holdRank(save: Save, rank: number): void {
  save.herbPvp.playerScore = 0
  save.herbPvp.rivals.forEach((rival, index) => {
    rival.score = index < rank - 1 ? 1 : 0
  })
}

describe('herb pvp rolls', () => {
  it('splits plot kinds and probe sizes on the published cuts', () => {
    expect(classifyHerbRoll(0).kind).toBe('barren')
    expect(classifyHerbRoll(0.349999).kind).toBe('barren')
    expect(classifyHerbRoll(0.35)).toEqual({ kind: 'common', probeSize: null })
    expect(classifyHerbRoll(0.749999).kind).toBe('common')
    expect(classifyHerbRoll(0.75)).toEqual({ kind: 'precious', probeSize: null })
    expect(classifyHerbRoll(0.899999).kind).toBe('precious')
    expect(classifyHerbRoll(0.9)).toEqual({ kind: 'probe', probeSize: 1 })
    expect(classifyHerbRoll(0.949999)).toEqual({ kind: 'probe', probeSize: 1 })
    expect(classifyHerbRoll(0.95)).toEqual({ kind: 'probe', probeSize: 2 })
    expect(classifyHerbRoll(0.979999)).toEqual({ kind: 'probe', probeSize: 2 })
    expect(classifyHerbRoll(0.98)).toEqual({ kind: 'probe', probeSize: 4 })
    expect(classifyHerbRoll(1).probeSize).toBe(4)
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

  it('places probe footprints from the chosen cell', () => {
    expect(herbProbeCells(0, 1)).toEqual([0])
    expect(herbProbeCells(0, 2)).toEqual([0, 1])
    expect(herbProbeCells(7, 2)).toEqual([7, 6])
    expect(herbProbeCells(0, 4)).toEqual([0, 1, 8, 9])
    expect(herbProbeCells(7, 4)).toEqual([6, 7, 14, 15])
    expect(herbProbeCells(63, 4)).toEqual([54, 55, 62, 63])
    expect(herbProbeCells(56, 4)).toEqual([48, 49, 56, 57])
  })
})

describe('herb pvp board', () => {
  it('keeps one player with 49 named rivals on an 8 by 8 map', () => {
    const save = fresh()
    expect(save.herbPvp.plots).toHaveLength(HERB_PVP_PLOT_COUNT)
    expect(save.herbPvp.rivals).toHaveLength(HERB_PVP_RIVAL_COUNT)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX)
    expect(save.herbPvp.probe1).toBe(1)
    expect(save.herbPvp.probe2).toBe(1)
    expect(save.herbPvp.probe4).toBe(1)
    const names = new Set<string>(SNAPSHOT_PLAYER_NAMES)
    const avatars = new Set<string>(PLAYER_AVATAR_IDS)
    for (const rival of save.herbPvp.rivals) {
      expect(names.has(rival.name)).toBe(true)
      expect(avatars.has(rival.avatarId)).toBe(true)
    }
    expect(new Set(save.herbPvp.rivals.map((rival) => rival.name)).size).toBe(SNAPSHOT_PLAYER_NAMES.length)
    expect(herbPlayerRank(save)).toBe(1)
  })

  it('never puts more than five rivals online at once', () => {
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
})

describe('herb pvp weeding', () => {
  it('spends stamina, blocks a fourth plot, and still allows probes at zero', () => {
    const save = fresh()
    quiet(save)
    const workers = [spawnWorker(save), spawnWorker(save), spawnWorker(save), spawnWorker(save)]
    expect(startHerbWeed(save, 0, workers[0]!.id).ok).toBe(true)
    expect(startHerbWeed(save, 1, workers[1]!.id).ok).toBe(true)
    expect(startHerbWeed(save, 2, workers[2]!.id).ok).toBe(true)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX - HERB_PVP_PLAYER_CAP)
    expect(startHerbWeed(save, 3, workers[3]!.id)).toEqual({ ok: false, reason: '最多同时除 3 块' })
    expect(restingWorkers(save).map((worker) => worker.id)).not.toContain(workers[0]!.id)
    expect(assignWorker(save, workers[0]!.id, 'herbalism')).toEqual({ ok: false, reason: '正在割草' })
    expect(combatPartyBlockReason(save, [workers[0]!.id])).toContain('正在割草')

    const tired = spawnWorker(save)
    tired.hp = tired.hpMax - 1
    save.herbPvp.plots[0]!.workerId = null
    expect(startHerbWeed(save, 4, tired.id)).toEqual({ ok: false, reason: '满血才能上岗' })

    save.herbPvp.stamina = 0
    const ready = spawnWorker(save)
    expect(startHerbWeed(save, 4, ready.id)).toEqual({ ok: false, reason: '体力不足' })
    save.herbPvp.plots[8]!.cleared = true
    expect(useHerbProbe(save, 8, 1)).toEqual({ ok: false, reason: '只能对未除的地使用' })
    expect(save.herbPvp.probe1).toBe(1)
    expect(useHerbProbe(save, 9, 2).ok).toBe(true)
    expect(save.herbPvp.plots[9]!.revealed).toBe(true)
    expect(save.herbPvp.plots[10]!.revealed).toBe(true)
    expect(save.herbPvp.probe2).toBe(0)
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
    const before = save.herbPvp.probe4
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.probe4).toBe(before + 1)

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
    expect(useHerbProbe(save, 0, 1).ok).toBe(true)
    expect(save.herbPvp.plots[0]!.revealed).toBe(true)
    stepHerbPvp(save, Date.now())
    expect(save.herbPvp.plots[0]!.revealed).toBe(true)
  })
})

describe('herb pvp clashes', () => {
  it('inherits progress after a killing first blow and does not refund a failed clash', () => {
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
    expect(startHerbWeed(save, 0, worker.id).ok).toBe(true)
    expect(plot.workerId).toBe(worker.id)
    expect(plot.weeder).toBeNull()
    expect(plot.progressS).toBe(50)
    expect(other.weeder).toBeNull()
    expect(other.progressS).toBe(0)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX - 1)

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
    expect(blocked.weeder).toBe(survivor.id)
    expect(blocked.workerId).toBeNull()
    expect(blocked.progressS).toBe(12)
    expect(save.herbPvp.stamina).toBe(before - 1)
    expect(home.hp).toBe(home.hpMax - 1)
    expect(restingWorkers(save).some((row) => row.id === home.id)).toBe(true)
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
    if (knocked.ok) expect(knocked.message).toContain('打倒')
    expect(plot.weeder).toBe(rival.id)
    expect(plot.workerId).toBeNull()
    expect(worker.assignment).toBeNull()
    expect(worker.hp).toBe(0)
    expect(save.herbPvp.stamina).toBe(HERB_PVP_STAMINA_MAX - 1)
  })

  it('gives the plot to a rival who knocks the player out, and keeps it when the counter lands', () => {
    const save = fresh()
    quiet(save)
    const worker = spawnWorker(save)
    const rival = save.herbPvp.rivals[2]!
    const plot = save.herbPvp.plots[4]!
    plot.workerId = worker.id
    plot.progressS = 40
    rival.hp = 500
    rival.atk = 9999
    rival.onlineUntilS = null
    expect(applyHerbRivalBump(save, 4, rival.id).ok).toBe(true)
    expect(plot.workerId).toBeNull()
    expect(plot.weeder).toBe(rival.id)
    expect(plot.progressS).toBe(40)
    expect(rival.onlineUntilS).not.toBeNull()
    expect(worker.hp).toBe(0)

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
    expect(HERB_PVP_RANK_REWARDS.map((row) => [row.maxRank, row.sandGold, row.jewel, row.jade, row.probe1, row.probe2, row.probe4])).toEqual([
      [1, 80, 24, 6, 2, 1, 1],
      [3, 48, 14, 3, 1, 1, 1],
      [10, 28, 8, 2, 1, 1, 0],
      [25, 14, 4, 1, 1, 0, 0],
      [50, 6, 2, 1, 1, 0, 0],
    ])
    for (const rank of [1, 2, 3, 4, 10, 11, 25, 26, 50]) {
      const save = fresh()
      quiet(save)
      holdRank(save, rank)
      save.herbPvp.dayKey = '2026-09-28'
      stepHerbPvp(save, midnight)
      const reward = herbRankReward(rank)
      expect(vaultQty(save, 'sandGold')).toBe(reward.sandGold)
      expect(vaultQty(save, 'jewel')).toBe(reward.jewel)
      expect(vaultQty(save, 'jade')).toBe(reward.jade)
      expect(save.herbPvp.probe1).toBe(1 + reward.probe1)
      expect(save.herbPvp.probe2).toBe(1 + reward.probe2)
      expect(save.herbPvp.probe4).toBe(1 + reward.probe4)
      expect(save.herbPvp.playerScore).toBe(0)
      expect(save.herbPvp.rivals.every((rival) => rival.score === 0)).toBe(true)
      expect(save.herbPvp.lastRewardText).toContain(`第${rank}名`)
      expect(save.messages.some((message) => message.title === '割草结算')).toBe(true)
      const sand = vaultQty(save, 'sandGold')
      stepHerbPvp(save, midnight + 1000)
      expect(vaultQty(save, 'sandGold')).toBe(sand)
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
  })

  it('fills defaults when an old save has no herb board', () => {
    const save = fresh()
    save.herbPvp.playerScore = 77
    save.herbPvp.stamina = 3
    save.herbPvp.probe1 = 0
    const dumped = JSON.parse(JSON.stringify(save)) as Save & { herbPvp?: HerbPvpState }
    const kept = hydrateLoadedSave(dumped)
    expect(kept?.herbPvp.playerScore).toBe(77)
    expect(kept?.herbPvp.stamina).toBe(3)
    expect(kept?.herbPvp.probe1).toBe(0)
    expect(kept?.herbPvp.probe2).toBe(1)

    const legacy = dumped as Omit<Save, 'herbPvp'> & { herbPvp?: HerbPvpState }
    delete legacy.herbPvp
    const rebuilt = hydrateLoadedSave(legacy)
    expect(rebuilt?.herbPvp.plots).toHaveLength(64)
    expect(rebuilt?.herbPvp.rivals).toHaveLength(49)
    expect(rebuilt?.herbPvp.stamina).toBe(10)
    expect(rebuilt?.herbPvp.probe1).toBe(1)
    expect(rebuilt?.herbPvp.probe2).toBe(1)
    expect(rebuilt?.herbPvp.probe4).toBe(1)
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
