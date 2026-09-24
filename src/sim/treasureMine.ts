import { hashString, isCombatAttrId, matchingWeaknesses, pickEnemyWeaknesses } from './combatAttrs'
import { applyDownedReturn, workerLiveStats } from './combat'
import { raidPhaseOf } from './march'
import { marchDurationS } from './tech'
import { clearWorkerNew } from './recruit'
import {
  confirmableRunePicks,
  consumeRunePicks,
  runeDealMul,
  runeSpdMul,
  runeTakenMul,
  type RunePickMap,
} from './runes'
import { treasureMineBlockReason } from './treasureMineQuery'
import type {
  ActionResult,
  CombatAttrId,
  QualityTier,
  RuneItemId,
  Save,
  TreasureId,
  TreasureKind,
  TreasureMine,
  TreasureMineState,
  TreasureRaid,
  TreasureRaidReturnee,
  TreasureShadow,
  Worker,
} from './types'

export const TREASURE_MINE_CAP = 4
export const TREASURE_RESERVE_MAX = 1000
export const TREASURE_LIFE_S = 60 * 60
export const TREASURE_CREW_CAP = 3
export const TREASURE_DIG_BASE_S = 5
export const TREASURE_RAID_CAP = 3
export const TREASURE_REFRESH_COST = 10

export const TREASURE_LABEL: Record<TreasureId, string> = {
  sandGold: '砂金',
  jewel: '珠宝',
  jade: '古玉',
}

export const TREASURE_KINDS = ['sandGold', 'jewel', 'jade'] as const satisfies readonly TreasureKind[]

export const TREASURE_KIND_LABEL: Record<TreasureKind, string> = {
  sandGold: '砂金洞',
  jewel: '珠宝洞',
  jade: '古玉洞',
}

/**
 * 每种洞的掉落权重，顺序砂金、珠宝、古玉，和为 100。
 * 砂金洞 70/25/5，珠宝洞 20/70/10，古玉洞 15/25/60。
 */
export const TREASURE_DROP_WEIGHTS: Record<TreasureKind, Record<TreasureId, number>> = {
  sandGold: { sandGold: 70, jewel: 25, jade: 5 },
  jewel: { sandGold: 20, jewel: 70, jade: 10 },
  jade: { sandGold: 15, jewel: 25, jade: 60 },
}

export type TreasureDrop = {
  mineId: string
  item: TreasureId
  qty: number
}

export type TreasureDropSink = (drop: TreasureDrop) => void

/** 新洞种类。roll 来自矿洞自己的 `nextMineRoll`，三段各约 1/3。 */
export function treasureKindOfRoll(roll: number): TreasureKind {
  if (roll < 1 / 3) return 'sandGold'
  if (roll < 2 / 3) return 'jewel'
  return 'jade'
}

/** 旧档缺 kind：同一 id 每次都落到同一种。 */
export function treasureKindFromId(id: string): TreasureKind {
  const index = hashString(id) % TREASURE_KINDS.length
  return TREASURE_KINDS[index] ?? 'sandGold'
}

export function isTreasureKind(value: unknown): value is TreasureKind {
  return value === 'sandGold' || value === 'jewel' || value === 'jade'
}

/** 按洞种权重掷 1 件。`roll` 为 0～1。 */
export function rollTreasureDrop(kind: TreasureKind, roll: number): TreasureId {
  const weights = TREASURE_DROP_WEIGHTS[isTreasureKind(kind) ? kind : 'sandGold']
  const total = weights.sandGold + weights.jewel + weights.jade
  const mark = Math.max(0, roll) * total
  if (mark < weights.sandGold) return 'sandGold'
  if (mark < weights.sandGold + weights.jewel) return 'jewel'
  return 'jade'
}

/** 我方入库漂字。数量写在后面，可叠。 */
export function treasureDropTip(item: TreasureId, qty = 1): string {
  return `获得 ${TREASURE_LABEL[item]} ×${qty}`
}

/** 新刷快照守军的显示名。同一局里优先没用过的，名单用尽才重复。 */
export const SNAPSHOT_PLAYER_NAMES = [
  '青石',
  '晚风',
  '小满',
  '阿栗',
  '北巷',
  '白露',
  '南枝',
  '木舟',
  '灯火',
  '远山',
  '清禾',
  '旧桥',
  '星河',
  '落叶',
  '暖阳',
  '微澜',
] as const

const SHADOW_RUNES: RuneItemId[] = ['runeSharp', 'runeArmor', 'runeSwift']

/** 按矿洞掷骰从名单取一个显示名。`taken` 里已有的尽量跳过。 */
export function pickSnapshotPlayerName(roll: number, taken: ReadonlySet<string>): string {
  const free = SNAPSHOT_PLAYER_NAMES.filter((name) => !taken.has(name))
  const pool = free.length > 0 ? free : SNAPSHOT_PLAYER_NAMES
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)))
  return pool[index] ?? SNAPSHOT_PLAYER_NAMES[0]
}

function namesOnBoard(save: Save): Set<string> {
  const taken = new Set<string>()
  for (const mine of save.treasureMines?.mines ?? []) {
    for (const shadow of mine.shadows ?? []) {
      if (shadow.name) taken.add(shadow.name)
    }
  }
  return taken
}

export function blankTreasureMines(): TreasureMineState {
  return { nextId: 1, roll: 1, vault: {}, mines: [] }
}

/** 等级微调：1～5 级 5 秒，之后每 5 级快 1 秒，最快 3 秒。命中矿弱点再快 1 秒。 */
export function mineDigIntervalS(level: number, matchesWeakness = false): number {
  const bonus = Math.min(2, Math.floor(Math.max(0, Math.floor(level) - 1) / 5))
  const weak = matchesWeakness ? 1 : 0
  return Math.max(1, TREASURE_DIG_BASE_S - bonus - weak)
}

/** 与战场相同：工人属性命中矿洞弱点表才算吃到。多条命中也只快 1 秒。 */
export function workerMatchesMineWeakness(
  attrs: readonly CombatAttrId[] | undefined,
  weaknesses: readonly CombatAttrId[] | undefined,
): boolean {
  return matchingWeaknesses(attrs ?? [], weaknesses ?? []).length > 0
}

export function mineRemainS(mine: TreasureMine, elapsedS: number): number {
  return Math.max(0, mine.expiresAtS - elapsedS)
}

export function ensureTreasureMines(save: Save): TreasureMineState {
  const raw = save.treasureMines
  if (!raw || !Array.isArray(raw.mines) || typeof raw.nextId !== 'number') {
    save.treasureMines = blankTreasureMines()
  }
  if (!save.treasureMines.vault || typeof save.treasureMines.vault !== 'object') {
    save.treasureMines.vault = {}
  }
  if (typeof save.treasureMines.roll !== 'number' || !Number.isFinite(save.treasureMines.roll)) {
    save.treasureMines.roll = 1
  }
  return save.treasureMines
}

export function hydrateTreasureMines(save: Save): void {
  ensureTreasureMines(save)
  for (const mine of save.treasureMines.mines) {
    if (!Array.isArray(mine.crewIds)) mine.crewIds = []
    if (!Array.isArray(mine.shadows)) mine.shadows = []
    if (!mine.digCharge || typeof mine.digCharge !== 'object') mine.digCharge = {}
    if (mine.raid && !Array.isArray(mine.raid.queue)) mine.raid = null
    if (mine.raid) {
      mine.raid.attackSlots = normalizeRaidSlots(mine.raid.attackSlots, mine.raid.queue)
      mine.raid.defendSlots = normalizeRaidSlots(
        mine.raid.defendSlots,
        mine.shadows.map((shadow) => shadow.id),
      )
      ensureRaidVitals(save, mine)
    }
    if (mine.owner !== 'player' && mine.owner !== 'shadow' && mine.owner !== 'empty') {
      mine.owner = mine.shadows.length > 0 ? 'shadow' : 'empty'
    }
    if (!isTreasureKind(mine.kind)) mine.kind = treasureKindFromId(mine.id)
    mine.weaknesses = mineWeaknessesOf(mine)
    mine.revealedWeaknesses = keptRevealedWeaknesses(mine)
    mine.reserve = clampInt(mine.reserve, 0, TREASURE_RESERVE_MAX)
  }
  refreshTreasureMines(save)
}

/** 钻石刷新留下的洞：战斗中（含出征 / 交战 / 归来，即有 raid）或我方开采。 */
function isTreasureRefreshKept(mine: TreasureMine): boolean {
  return mine.raid != null || mine.owner === 'player'
}

/**
 * 花钻石换一批没在参与的洞。保留战斗中与我方开采，保留洞不拆开采队伍。
 * 无人矿、敌人驻守且无抢夺的照常换新。
 * 四洞都在保留里、或钻石不够时不扣钻。
 */
export function refreshTreasureMineBoard(save: Save): ActionResult {
  const state = ensureTreasureMines(save)
  if (!state.mines.some((mine) => !isTreasureRefreshKept(mine))) return { ok: false, reason: '没有可刷新的矿洞' }
  if (save.diamonds < TREASURE_REFRESH_COST) return { ok: false, reason: '钻石不足' }
  save.diamonds -= TREASURE_REFRESH_COST
  const kept: TreasureMine[] = []
  for (const mine of state.mines) {
    if (isTreasureRefreshKept(mine)) {
      kept.push(mine)
      continue
    }
    releaseMineCrew(save, mine)
  }
  state.mines = kept
  while (state.mines.length < TREASURE_MINE_CAP) {
    state.mines.push(spawnMine(save, save.elapsedS))
  }
  return { ok: true, message: '已刷新矿洞' }
}

function releaseMineCrew(save: Save, mine: TreasureMine): void {
  for (const id of mine.crewIds) {
    const worker = save.workers.find((row) => row.id === id)
    if (worker) worker.assignment = null
    delete mine.digCharge[id]
  }
  mine.crewIds = []
}

export function refreshTreasureMines(save: Save): void {
  const state = ensureTreasureMines(save)
  const elapsed = save.elapsedS
  const kept: TreasureMine[] = []
  for (const mine of state.mines) {
    if (mine.reserve <= 0 || elapsed >= mine.expiresAtS) {
      releaseRaid(save, mine)
      continue
    }
    kept.push(mine)
  }
  state.mines = kept
  while (state.mines.length < TREASURE_MINE_CAP) {
    state.mines.push(spawnMine(save, elapsed))
  }
}

/** 开采态明确拒绝符文。抢夺走 startTreasureRaid。 */
export function rejectTreasureMineRune(): ActionResult {
  return { ok: false, reason: '开采不能装符文' }
}

/** 已占领的洞不能再加人。无人矿用 `claimTreasureMine`。 */
export function addTreasureMiner(save: Save, mineId: string, _workerId: string): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.owner === 'player') return { ok: false, reason: '这洞不能补采' }
  return { ok: false, reason: '这洞还不是你的' }
}

/** 无人矿一次选 1～3 人占领。不改储量、倒计时和弱点。 */
export function claimTreasureMine(save: Save, mineId: string, workerIds: readonly string[]): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.owner === 'player') return { ok: false, reason: '这洞不能补采' }
  if (mine.owner !== 'empty') return { ok: false, reason: '这洞现在不能开采' }
  if (!workerIds.length) return { ok: false, reason: '请选择开采工人' }
  if (workerIds.length > TREASURE_CREW_CAP) return { ok: false, reason: '这洞最多 3 人' }
  const seen = new Set<string>()
  const party: Worker[] = []
  for (const id of workerIds) {
    if (seen.has(id)) return { ok: false, reason: '不能重复选同一个人' }
    seen.add(id)
    const worker = save.workers.find((row) => row.id === id)
    if (!worker) return { ok: false, reason: '没有这个工人' }
    if (worker.assignment != null) return { ok: false, reason: '工人不在休息区' }
    const busy = treasureMineBlockReason(save, id)
    if (busy) return { ok: false, reason: busy }
    party.push(worker)
  }
  mine.owner = 'player'
  mine.shadows = []
  mine.raid = null
  mine.crewIds = party.map((worker) => worker.id)
  mine.digCharge = {}
  for (const worker of party) {
    clearWorkerNew(save, worker.id)
    revealMineWeaknesses(mine, worker.combatAttrs)
  }
  return { ok: true, message: '已占领矿洞' }
}

/** 一键放弃。工人回休息，洞变无人矿。储量、倒计时和弱点不动。 */
export function abandonTreasureMine(save: Save, mineId: string): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.owner !== 'player') return { ok: false, reason: '这洞不是你的' }
  if (mine.raid) return { ok: false, reason: '抢夺进行中不能撤出' }
  releaseMineCrew(save, mine)
  mine.owner = 'empty'
  mine.shadows = []
  mine.raid = null
  mine.digCharge = {}
  return { ok: true, message: '已放弃矿洞' }
}

/** 只锁这一洞。其它洞的抢夺和开采不看这里。 */
export function isTreasureRaidLocked(mine: TreasureMine): boolean {
  return mine.raid != null
}

export function startTreasureRaid(
  save: Save,
  mineId: string,
  workerIds: readonly string[],
  runePicks?: RunePickMap,
): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (isTreasureRaidLocked(mine)) return { ok: false, reason: '这洞抢夺进行中' }
  if (mine.owner === 'empty' || !mine.shadows.length) return { ok: false, reason: '洞里没有守军' }
  if (mine.owner !== 'shadow') return { ok: false, reason: '这洞现在不能抢' }
  if (!workerIds.length) return { ok: false, reason: '请选择抢夺工人' }
  if (workerIds.length > TREASURE_RAID_CAP) return { ok: false, reason: '抢夺最多 3 人' }
  const seen = new Set<string>()
  const party: Worker[] = []
  for (const id of workerIds) {
    if (seen.has(id)) return { ok: false, reason: '不能重复选同一个人' }
    seen.add(id)
    const worker = save.workers.find((row) => row.id === id)
    if (!worker) return { ok: false, reason: '没有这个工人' }
    if (worker.assignment != null) return { ok: false, reason: `${worker.name ?? worker.id} 不在休息区` }
    const busy = treasureMineBlockReason(save, id)
    if (busy) return { ok: false, reason: `${worker.name ?? worker.id} ${busy}` }
    party.push(worker)
  }
  const runes = confirmableRunePicks(save, runePicks, workerIds)
  const spent = consumeRunePicks(save, runes)
  if (!spent.ok) return spent
  for (const worker of party) clearWorkerNew(save, worker.id)
  mine.raid = openRaid(save, mine, party, runes)
  for (const worker of party) revealMineWeaknesses(mine, worker.combatAttrs)
  return { ok: true, message: '已向快照守军抢夺' }
}

/**
 * 夺宝没有增援。进行中的这一洞，攻方加人和守方加人都不进队列。
 * 与订单「开过打后续可增援」分开。战斗结束（raid 清空）后洞锁解开，但增援仍然不存在。
 */
export function reinforceTreasureRaid(
  save: Save,
  mineId: string,
  side: 'attack' | 'defend',
): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (side !== 'attack' && side !== 'defend') return { ok: false, reason: '抢夺进行中不能增援' }
  if (isTreasureRaidLocked(mine)) return { ok: false, reason: '抢夺进行中不能增援' }
  return { ok: false, reason: '这洞没有进行中的抢夺' }
}

function openRaid(
  save: Save,
  mine: TreasureMine,
  party: Worker[],
  runes: Partial<Record<string, RuneItemId>>,
): TreasureRaid {
  const attackSlots = raidSlotSnapshot(party.map((worker) => worker.id))
  const defendSlots = raidSlotSnapshot(mine.shadows.map((shadow) => shadow.id))
  const attackVitals = attackSlots.map((id) => {
    if (!id) return { hp: 0, hpMax: 0 }
    const worker = party.find((row) => row.id === id)
    if (!worker) return { hp: 0, hpMax: 0 }
    const vitals = attackerCombatVitals(save, worker, runes[id])
    return { hp: Math.max(1, vitals.hp), hpMax: vitals.hpMax }
  })
  const defendVitals = defendSlots.map((id) => {
    if (!id) return { hp: 0, hpMax: 0 }
    const shadow = mine.shadows.find((row) => row.id === id)
    return { hp: Math.max(0, shadow?.hp ?? 0), hpMax: Math.max(0, shadow?.hpMax ?? 0) }
  })
  const raid: TreasureRaid = {
    queue: party.map((worker) => worker.id),
    attackSlots,
    defendSlots,
    attackSlotHp: attackVitals.map((row) => row.hp),
    attackSlotMax: attackVitals.map((row) => row.hpMax),
    defendSlotHp: defendVitals.map((row) => row.hp),
    defendSlotMax: defendVitals.map((row) => row.hpMax),
    garrison: mine.shadows.length,
    atkHp: 1,
    atkMax: 1,
    atkAtk: 1,
    atkSpd: 1,
    atkNext: save.elapsedS,
    defHp: 1,
    defAtk: 1,
    defSpd: 1,
    defNext: save.elapsedS,
    runes,
    phase: 'marchOut',
    phaseStartedAtS: save.elapsedS,
    phaseEndsAtS: save.elapsedS + marchDurationS(save),
    returning: [],
  }
  loadAttacker(save, raid, false)
  loadDefender(mine, raid, null)
  raid.atkNext = Number.POSITIVE_INFINITY
  raid.defNext = Number.POSITIVE_INFINITY
  return raid
}

function armRaidFight(save: Save, mine: TreasureMine, raid: TreasureRaid, atS: number): void {
  raid.phase = 'fighting'
  raid.phaseStartedAtS = atS
  delete raid.phaseEndsAtS
  loadAttacker(save, raid, false)
  raid.atkNext = atS + Math.max(1, raid.atkSpd)
  loadDefender(mine, raid, atS)
}

export function stepTreasureMines(save: Save, onDrop?: TreasureDropSink): void {
  const state = ensureTreasureMines(save)
  for (const mine of state.mines) {
    if (mine.raid) stepRaid(save, mine)
    if (mine.reserve > 0 && save.elapsedS < mine.expiresAtS) stepDig(save, mine, onDrop)
  }
  refreshTreasureMines(save)
}

function pushRaidReturn(
  raid: TreasureRaid,
  workerId: string,
  hp: number,
  atS: number,
  reason: 'down' | 'win' | 'lose',
  dur: number,
): void {
  if (!raid.returning) raid.returning = []
  if (raid.returning.some((row) => row.id === workerId)) return
  raid.returning.push({
    id: workerId,
    untilS: atS + dur,
    startedAtS: atS,
    hp,
    reason,
  })
}

function settleRaidReturns(save: Save, raid: TreasureRaid): void {
  const pending = raid.returning ?? []
  if (!pending.length) return
  const stay: TreasureRaidReturnee[] = []
  for (const row of pending) {
    if (save.elapsedS < row.untilS) {
      stay.push(row)
      continue
    }
    if (row.reason === 'down') applyDownedReturn(save, row.id, row.hp, save.lastTick)
    else {
      const worker = save.workers.find((workerRow) => workerRow.id === row.id)
      if (worker) worker.assignment = null
    }
  }
  raid.returning = stay
}

function beginRaidHome(save: Save, raid: TreasureRaid, outcome: 'win' | 'lose', atS: number): void {
  const dur = marchDurationS(save)
  raid.phase = outcome === 'win' ? 'marchHomeWin' : 'marchHomeLose'
  raid.phaseStartedAtS = atS
  raid.phaseEndsAtS = atS + dur
  if (outcome === 'win') raid.victors = [...raid.queue]
  raid.atkNext = Number.POSITIVE_INFINITY
  raid.defNext = Number.POSITIVE_INFINITY
}

function finishRaidHome(save: Save, mine: TreasureMine, raid: TreasureRaid): void {
  settleRaidReturns(save, raid)
  if ((raid.returning ?? []).some((row) => row.untilS > save.elapsedS)) return
  if (save.elapsedS < (raid.phaseEndsAtS ?? 0)) return
  if (raid.phase === 'marchHomeWin') {
    raid.queue = (raid.victors ?? raid.queue).filter((id) => save.workers.some((worker) => worker.id === id))
    takeOver(save, mine, raid)
    return
  }
  for (const id of raid.queue) {
    const worker = save.workers.find((row) => row.id === id)
    sendHome(save, id, worker?.hp ?? 0)
  }
  mine.raid = null
}

function stepRaid(save: Save, mine: TreasureMine): void {
  const raid = mine.raid
  if (!raid) return
  settleRaidReturns(save, raid)
  const phase = raidPhaseOf(raid)
  if (phase === 'marchOut') {
    if (save.elapsedS < (raid.phaseEndsAtS ?? 0)) return
    armRaidFight(save, mine, raid, raid.phaseEndsAtS ?? save.elapsedS)
  }
  if (raid.phase === 'marchHomeWin' || raid.phase === 'marchHomeLose') {
    finishRaidHome(save, mine, raid)
    return
  }
  if (raidPhaseOf(raid) !== 'fighting') return
  let guard = 0
  while (raid.queue.length && mine.shadows.length && guard++ < 64) {
    if (raid.atkNext > save.elapsedS && raid.defNext > save.elapsedS) return
    if (raid.atkNext <= raid.defNext) {
      if (raid.atkNext > save.elapsedS) return
      const atS = raid.atkNext
      const shadow = mine.shadows[0]
      const dealt = strikeDamage(raid.atkAtk, runeDealMul(raid.runes[raid.queue[0]]), runeTakenMul(shadow.runeId))
      shadow.hp -= dealt
      raid.defHp = shadow.hp
      raid.atkNext = atS + raid.atkSpd
      if (shadow.hp <= 0) {
        mine.shadows.shift()
        delete mine.digCharge[shadow.id]
        if (!mine.shadows.length) {
          beginRaidHome(save, raid, 'win', atS)
          finishRaidHome(save, mine, raid)
          return
        }
        loadDefender(mine, raid, atS)
      }
    } else {
      if (raid.defNext > save.elapsedS) return
      const atS = raid.defNext
      const dealt = strikeDamage(raid.defAtk, runeDealMul(mine.shadows[0]?.runeId), runeTakenMul(raid.runes[raid.queue[0]]))
      raid.atkHp -= dealt
      writeAttackerHp(save, raid)
      raid.defNext = atS + raid.defSpd
      if (raid.atkHp <= 0) {
        const fallen = raid.queue.shift()
        if (fallen) {
          const worker = save.workers.find((row) => row.id === fallen)
          pushRaidReturn(raid, fallen, 0, atS, 'down', marchDurationS(save))
          if (worker) worker.hp = 0
        }
        if (!raid.queue.length) {
          beginRaidHome(save, raid, 'lose', atS)
          finishRaidHome(save, mine, raid)
          return
        }
        loadAttacker(save, raid, false)
        raid.atkNext = atS + Math.max(1, raid.atkSpd)
      }
    }
  }
  if (!mine.shadows.length && mine.raid && raidPhaseOf(mine.raid) === 'fighting') {
    beginRaidHome(save, mine.raid, 'win', save.elapsedS)
    finishRaidHome(save, mine, mine.raid)
  } else if (mine.raid && !mine.raid.queue.length && raidPhaseOf(mine.raid) === 'fighting') {
    beginRaidHome(save, mine.raid, 'lose', save.elapsedS)
    finishRaidHome(save, mine, mine.raid)
  }
}

function takeOver(save: Save, mine: TreasureMine, raid: TreasureRaid): void {
  const lead = raid.queue[0]
  mine.owner = 'player'
  mine.shadows = []
  mine.crewIds = raid.queue.filter((id) => save.workers.some((worker) => worker.id === id))
  mine.raid = null
  mine.digCharge = {}
  const worker = lead ? save.workers.find((row) => row.id === lead) : undefined
  if (worker && raid.atkMax > 0 && raid.atkHp > 0) {
    worker.hp = clampInt(Math.round((raid.atkHp / raid.atkMax) * worker.hpMax), 1, worker.hpMax)
  }
}

/** 整洞共用的开采进度，存在 `digCharge` 的这一格。 */
export const TREASURE_HOLE_DIG = 'hole'

function holeCharge(mine: TreasureMine): number {
  const raw = mine.digCharge[TREASURE_HOLE_DIG]
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0
}

function digRate(intervals: readonly number[]): number {
  return intervals.reduce((sum, intervalS) => sum + (intervalS > 0 ? 1 / intervalS : 0), 0)
}

/** 正在给这洞填条的个人间隔。人选与出货相同。 */
function diggingIntervals(save: Save, mine: TreasureMine): number[] | null {
  if (mine.owner === 'player' && !mine.raid) {
    const intervals: number[] = []
    for (const id of mine.crewIds) {
      const worker = save.workers.find((row) => row.id === id)
      if (!worker) continue
      const matched = workerMatchesMineWeakness(worker.combatAttrs, mine.weaknesses)
      intervals.push(mineDigIntervalS(worker.level, matched))
    }
    return intervals.length ? intervals : null
  }
  if (mine.owner !== 'shadow') return null
  const mining = mine.raid && raidPhaseOf(mine.raid) === 'fighting' ? mine.shadows.slice(1) : mine.shadows
  if (!mining.length) return null
  return mining.map((shadow) => mineDigIntervalS(shadow.level))
}

function stepDig(save: Save, mine: TreasureMine, onDrop?: TreasureDropSink): void {
  const intervals = diggingIntervals(save, mine)
  if (!intervals || mine.reserve <= 0) return
  const rate = digRate(intervals)
  if (rate <= 0) return
  let charge = holeCharge(mine) + rate
  const toVault = mine.owner === 'player'
  let guard = 0
  while (charge + 1e-9 >= 1 && mine.reserve > 0 && guard++ < 16) {
    charge -= 1
    mine.reserve -= 1
    if (!toVault) continue
    const item = rollTreasureDrop(mine.kind, nextMineRoll(save.treasureMines))
    save.treasureMines.vault[item] = (save.treasureMines.vault[item] ?? 0) + 1
    onDrop?.({ mineId: mine.id, item, qty: 1 })
  }
  mine.digCharge = { [TREASURE_HOLE_DIG]: charge < 1e-9 ? 0 : charge }
}

export type MineDigReadout = {
  /** 整洞进度 0～1。满 1 出 1 份。 */
  fill: number
  /** 整洞周期：1 / Σ(1/个人间隔)。进度条按这个速度插值。 */
  intervalS: number
  /** 与整洞周期相同，文案用「最快约 Ns/次」。 */
  fastestS: number
}

/**
 * 卡面开采读数，人选与 `stepDig` 相同。
 * 我方未抢夺且有编制；敌人驻守全员在挖，抢夺中只算非当前交战的守军。
 * 无人矿、我方抢夺中、没人在挖则不给。
 * 多人只加快同一条，满一次出 1 份。
 */
export function mineDigReadout(save: Save, mine: TreasureMine): MineDigReadout | null {
  const intervals = diggingIntervals(save, mine)
  if (!intervals) return null
  const rate = digRate(intervals)
  if (rate <= 0) return null
  const intervalS = 1 / rate
  return { fill: Math.min(1, holeCharge(mine)), intervalS, fastestS: intervalS }
}

/** 我方开采读数。无人矿、敌人驻守、抢夺中不给。 */
export function playerMineDigReadout(save: Save, mine: TreasureMine): MineDigReadout | null {
  if (mine.owner !== 'player') return null
  return mineDigReadout(save, mine)
}

/** 卡面上的开采速度。 */
export function mineDigSpeedLabel(fastestS: number): string {
  const shown = Number.isInteger(fastestS) ? String(fastestS) : fastestS.toFixed(1)
  return `最快约 ${shown}s/次`
}

function nextMineRoll(state: TreasureMineState): number {
  let seed = state.roll >>> 0
  if (seed === 0) seed = 1
  seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) ^ (seed + Math.imul(seed ^ (seed >>> 7), seed | 61))) >>> 0
  state.roll = seed === 0 ? 1 : seed
  return state.roll / 4294967296
}

/** 新洞守军人数。roll 来自矿洞自己的 `nextMineRoll`：50% 0 人、20% 1 人、20% 2 人、10% 3 人。 */
export function shadowCrewCount(roll: number): number {
  if (roll < 0.5) return 0
  if (roll < 0.7) return 1
  if (roll < 0.9) return 2
  return 3
}

function spawnMine(save: Save, elapsed: number): TreasureMine {
  const state = save.treasureMines
  const id = `mine-${state.nextId}`
  state.nextId += 1
  const kind = treasureKindOfRoll(nextMineRoll(state))
  const count = shadowCrewCount(nextMineRoll(state))
  const taken = namesOnBoard(save)
  const shadows: TreasureShadow[] = []
  for (let i = 0; i < count; i += 1) {
    const shadow = makeShadow(save, id, i, taken)
    taken.add(shadow.name)
    shadows.push(shadow)
  }
  return {
    id,
    kind,
    reserve: TREASURE_RESERVE_MAX,
    reserveMax: TREASURE_RESERVE_MAX,
    bornAtS: elapsed,
    expiresAtS: elapsed + TREASURE_LIFE_S,
    owner: count > 0 ? 'shadow' : 'empty',
    crewIds: [],
    shadows,
    weaknesses: pickEnemyWeaknesses(hashString(id), 0, 'minion'),
    revealedWeaknesses: [],
    raid: null,
    digCharge: {},
  }
}

function mineWeaknessesOf(mine: TreasureMine): CombatAttrId[] {
  const kept = (mine.weaknesses ?? []).filter(isCombatAttrId)
  if (kept.length) return kept
  return pickEnemyWeaknesses(hashString(mine.id), 0, 'minion')
}

function keptRevealedWeaknesses(mine: TreasureMine): CombatAttrId[] {
  const trueSet = new Set(mine.weaknesses)
  const raw = mine.revealedWeaknesses
  if (!Array.isArray(raw)) return []
  const out: CombatAttrId[] = []
  const seen = new Set<CombatAttrId>()
  for (const id of raw) {
    if (!isCombatAttrId(id) || !trueSet.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** 把工人属性里命中的矿洞弱点记进已揭开。不改开采加速。 */
export function revealMineWeaknesses(mine: TreasureMine, attrs: readonly CombatAttrId[] | undefined): void {
  if (!Array.isArray(mine.revealedWeaknesses)) mine.revealedWeaknesses = []
  for (const id of matchingWeaknesses(attrs ?? [], mine.weaknesses ?? [])) {
    if (mine.revealedWeaknesses.includes(id)) continue
    mine.revealedWeaknesses.push(id)
  }
}

/** 卡面弱点行。长度跟真实弱点表一致，没揭开的是 null，图标显示问号。 */
export function mineWeaknessSlots(mine: TreasureMine): Array<CombatAttrId | null> {
  const revealed = new Set(Array.isArray(mine.revealedWeaknesses) ? mine.revealedWeaknesses : [])
  return (mine.weaknesses ?? []).filter(isCombatAttrId).map((id) => (revealed.has(id) ? id : null))
}

function makeShadow(save: Save, mineId: string, index: number, taken: ReadonlySet<string>): TreasureShadow {
  const tier = (3 + ((save.treasureMines.nextId + index) % 3)) as QualityTier
  const runeId = SHADOW_RUNES[(save.knightLevel + index) % SHADOW_RUNES.length]
  const name = pickSnapshotPlayerName(nextMineRoll(save.treasureMines), taken)
  const fake = {
    id: `${mineId}-shadow-${index}`,
    qualityTier: tier,
    assignment: null,
    foodSlot: null,
    hp: 1,
    hpMax: 1,
    level: Math.max(1, save.knightLevel),
    xp: 0,
    combatAttrs: [],
    fatigueDebt: 0,
    isNew: false,
  } satisfies Worker
  const stats = workerLiveStats(fake, save, runeId)
  const spd = Math.max(1, Math.round(stats.spd * runeSpdMul(runeId)))
  return {
    id: fake.id,
    name,
    level: fake.level,
    hp: stats.hp,
    hpMax: stats.hp,
    atk: Math.max(1, stats.atk),
    spd,
    runeId,
  }
}

/** 开战槽位快照。不足 3 个用 null 补空，多出来的丢掉。 */
export function raidSlotSnapshot(ids: readonly string[]): (string | null)[] {
  const slots: (string | null)[] = []
  for (const id of ids) {
    if (slots.length >= TREASURE_RAID_CAP) break
    slots.push(id)
  }
  while (slots.length < TREASURE_RAID_CAP) slots.push(null)
  return slots
}

function normalizeRaidSlots(raw: unknown, fallback: readonly string[]): (string | null)[] {
  if (!Array.isArray(raw)) return raidSlotSnapshot(fallback)
  const slots = raw.slice(0, TREASURE_RAID_CAP).map((id) => (typeof id === 'string' && id ? id : null))
  while (slots.length < TREASURE_RAID_CAP) slots.push(null)
  return slots
}

function isVitalRow(raw: unknown): raw is number[] {
  return (
    Array.isArray(raw) &&
    raw.length === TREASURE_RAID_CAP &&
    raw.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** 与 `loadAttacker` 同一套战斗血。工坊 `worker.hp` 按比例换算，不直接加进血条。 */
function attackerCombatVitals(
  save: Save,
  worker: Worker,
  runeId: RuneItemId | undefined,
): { hp: number; hpMax: number } {
  const stats = workerLiveStats(worker, save, runeId)
  const hpMax = Math.max(1, stats.hp)
  const hp = worker.hp <= 0 ? 0 : worker.hpMax > 0 ? Math.round((worker.hp / worker.hpMax) * hpMax) : hpMax
  return { hp, hpMax }
}

function ensureRaidVitals(save: Save, mine: TreasureMine): void {
  const raid = mine.raid
  if (!raid) return
  if (!raid.runes || typeof raid.runes !== 'object') raid.runes = {}
  if (!isVitalRow(raid.attackSlotHp) || !isVitalRow(raid.attackSlotMax)) {
    const hp: number[] = []
    const max: number[] = []
    for (let i = 0; i < TREASURE_RAID_CAP; i += 1) {
      const id = raid.attackSlots[i]
      const worker = id ? save.workers.find((row) => row.id === id) : undefined
      if (!id || !worker) {
        hp.push(0)
        max.push(0)
        continue
      }
      const vitals = attackerCombatVitals(save, worker, raid.runes[id])
      max.push(vitals.hpMax)
      if (!raid.queue.includes(id)) hp.push(0)
      else if (id === raid.queue[0]) hp.push(Math.max(0, raid.atkHp))
      else hp.push(vitals.hp)
    }
    raid.attackSlotHp = hp
    raid.attackSlotMax = max
  }
  if (!isVitalRow(raid.defendSlotHp) || !isVitalRow(raid.defendSlotMax)) {
    const hp: number[] = []
    const max: number[] = []
    for (let i = 0; i < TREASURE_RAID_CAP; i += 1) {
      const id = raid.defendSlots[i]
      const shadow = id ? mine.shadows.find((row) => row.id === id) : undefined
      if (!id || !shadow) {
        hp.push(0)
        max.push(0)
        continue
      }
      max.push(Math.max(0, shadow.hpMax))
      hp.push(id === mine.shadows[0]?.id ? Math.max(0, raid.defHp) : Math.max(0, shadow.hp))
    }
    raid.defendSlotHp = hp
    raid.defendSlotMax = max
  }
}

function loadAttacker(save: Save, raid: TreasureRaid, armNext: boolean): void {
  const worker = save.workers.find((row) => row.id === raid.queue[0])
  if (!worker) return
  const runeId = raid.runes[worker.id]
  const stats = workerLiveStats(worker, save, runeId)
  const vitals = attackerCombatVitals(save, worker, runeId)
  raid.atkMax = vitals.hpMax
  raid.atkHp = Math.max(1, vitals.hp)
  raid.atkAtk = Math.max(1, stats.atk)
  raid.atkSpd = Math.max(1, Math.round(stats.spd * runeSpdMul(runeId)))
  if (armNext) raid.atkNext = save.elapsedS + raid.atkSpd
}

function loadDefender(mine: TreasureMine, raid: TreasureRaid, elapsed: number | null): void {
  const shadow = mine.shadows[0]
  if (!shadow) return
  raid.defHp = Math.max(0, shadow.hp)
  raid.defAtk = shadow.atk
  raid.defSpd = Math.max(1, shadow.spd)
  if (elapsed != null) raid.defNext = elapsed + raid.defSpd
}

function writeAttackerHp(save: Save, raid: TreasureRaid): void {
  const worker = save.workers.find((row) => row.id === raid.queue[0])
  if (!worker) return
  const ratio = raid.atkMax > 0 ? Math.max(0, raid.atkHp) / raid.atkMax : 0
  worker.hp = raid.atkHp <= 0 ? 0 : clampInt(Math.round(ratio * worker.hpMax), 1, worker.hpMax)
}

function sendHome(save: Save, workerId: string, hp: number): void {
  const worker = save.workers.find((row) => row.id === workerId)
  if (worker) {
    worker.assignment = null
    worker.hp = clampInt(hp, 0, worker.hpMax)
  }
  for (const mine of save.treasureMines.mines) {
    mine.crewIds = mine.crewIds.filter((id) => id !== workerId)
    delete mine.digCharge[workerId]
  }
}

function releaseRaid(save: Save, mine: TreasureMine): void {
  const raid = mine.raid
  mine.raid = null
  if (!raid) return
  if (raid.queue[0]) writeAttackerHp(save, raid)
  for (const id of [...raid.queue]) {
    const worker = save.workers.find((row) => row.id === id)
    sendHome(save, id, worker?.hp ?? 0)
  }
  for (const row of raid.returning ?? []) {
    if (row.reason === 'down') applyDownedReturn(save, row.id, row.hp, save.lastTick || 0)
    else sendHome(save, row.id, row.hp)
  }
}

function findMine(save: Save, mineId: string): TreasureMine | undefined {
  return ensureTreasureMines(save).mines.find((mine) => mine.id === mineId)
}

function strikeDamage(atk: number, deal: number, taken: number): number {
  return Math.max(1, Math.round(atk * deal * taken))
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}
