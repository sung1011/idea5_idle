import { workerLiveStats } from './combat'
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
  QualityTier,
  RuneItemId,
  Save,
  TreasureId,
  TreasureMine,
  TreasureMineState,
  TreasureRaid,
  TreasureShadow,
  Worker,
} from './types'

export const TREASURE_MINE_CAP = 4
export const TREASURE_RESERVE_MAX = 1000
export const TREASURE_LIFE_S = 60 * 60
export const TREASURE_CREW_CAP = 3
export const TREASURE_DIG_BASE_S = 5
export const TREASURE_RAID_CAP = 3

export const TREASURE_LABEL: Record<TreasureId, string> = {
  sandGold: '砂金',
  jewel: '珠宝',
  jade: '古玉',
}

const SHADOW_NAMES = ['影矿卫', '影掘手', '影看守'] as const
const SHADOW_RUNES: RuneItemId[] = ['runeSharp', 'runeArmor', 'runeSwift']

export function blankTreasureMines(): TreasureMineState {
  return { nextId: 1, roll: 1, vault: {}, mines: [] }
}

/** 等级微调：1～5 级 5 秒，之后每 5 级快 1 秒，最快 3 秒。 */
export function mineDigIntervalS(level: number): number {
  const bonus = Math.min(2, Math.floor(Math.max(0, Math.floor(level) - 1) / 5))
  return TREASURE_DIG_BASE_S - bonus
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
    if (mine.owner !== 'player' && mine.owner !== 'shadow') mine.owner = 'shadow'
    mine.reserve = clampInt(mine.reserve, 0, TREASURE_RESERVE_MAX)
  }
  refreshTreasureMines(save)
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

export function addTreasureMiner(save: Save, mineId: string, workerId: string): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.owner !== 'player' || mine.raid) return { ok: false, reason: '这洞还不是你的' }
  if (mine.crewIds.length >= TREASURE_CREW_CAP) return { ok: false, reason: '这洞最多 3 人' }
  if (mine.crewIds.includes(workerId)) return { ok: false, reason: '已经在这洞里' }
  const worker = save.workers.find((row) => row.id === workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  if (worker.assignment != null) return { ok: false, reason: '工人不在休息区' }
  const busy = treasureMineBlockReason(save, workerId)
  if (busy) return { ok: false, reason: busy }
  clearWorkerNew(save, workerId)
  mine.crewIds.push(workerId)
  mine.digCharge[workerId] = 0
  return { ok: true }
}

export function withdrawTreasureMiner(save: Save, mineId: string, workerId: string): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (!mine.crewIds.includes(workerId)) return { ok: false, reason: '这人不在洞里' }
  mine.crewIds = mine.crewIds.filter((id) => id !== workerId)
  delete mine.digCharge[workerId]
  return { ok: true }
}

export function startTreasureRaid(
  save: Save,
  mineId: string,
  workerIds: readonly string[],
  runePicks?: RunePickMap,
): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.owner !== 'shadow' || mine.raid) return { ok: false, reason: '这洞现在不能抢' }
  if (!mine.shadows.length) return { ok: false, reason: '洞里没有影子' }
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
  return { ok: true, message: '已向影子矿卫抢夺' }
}

function openRaid(
  save: Save,
  mine: TreasureMine,
  party: Worker[],
  runes: Partial<Record<string, RuneItemId>>,
): TreasureRaid {
  const raid: TreasureRaid = {
    queue: party.map((worker) => worker.id),
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
  }
  loadAttacker(save, raid, true)
  loadDefender(mine, raid, save.elapsedS)
  return raid
}

export function stepTreasureMines(save: Save): void {
  const state = ensureTreasureMines(save)
  for (const mine of state.mines) {
    if (mine.raid) stepRaid(save, mine)
    if (mine.reserve > 0 && save.elapsedS < mine.expiresAtS) stepDig(save, mine)
  }
  refreshTreasureMines(save)
}

function stepRaid(save: Save, mine: TreasureMine): void {
  const raid = mine.raid
  if (!raid) return
  let guard = 0
  while (raid.queue.length && mine.shadows.length && guard++ < 32) {
    if (raid.atkNext > save.elapsedS && raid.defNext > save.elapsedS) return
    if (raid.atkNext <= raid.defNext) {
      if (raid.atkNext > save.elapsedS) return
      const shadow = mine.shadows[0]
      const dealt = strikeDamage(raid.atkAtk, runeDealMul(raid.runes[raid.queue[0]]), runeTakenMul(shadow.runeId))
      shadow.hp -= dealt
      raid.defHp = shadow.hp
      raid.atkNext = save.elapsedS + raid.atkSpd
      if (shadow.hp <= 0) {
        mine.shadows.shift()
        delete mine.digCharge[shadow.id]
        if (!mine.shadows.length) {
          takeOver(save, mine, raid)
          return
        }
        loadDefender(mine, raid, save.elapsedS)
      }
    } else {
      if (raid.defNext > save.elapsedS) return
      const dealt = strikeDamage(raid.defAtk, runeDealMul(mine.shadows[0]?.runeId), runeTakenMul(raid.runes[raid.queue[0]]))
      raid.atkHp -= dealt
      writeAttackerHp(save, raid)
      raid.defNext = save.elapsedS + raid.defSpd
      if (raid.atkHp <= 0) {
        const fallen = raid.queue.shift()
        if (fallen) sendHome(save, fallen, 0)
        if (!raid.queue.length) {
          mine.raid = null
          return
        }
        loadAttacker(save, raid, true)
      }
    }
  }
  if (!mine.shadows.length && mine.raid) takeOver(save, mine, mine.raid)
  else if (mine.raid && !mine.raid.queue.length) mine.raid = null
}

function takeOver(save: Save, mine: TreasureMine, raid: TreasureRaid): void {
  const lead = raid.queue[0]
  mine.owner = 'player'
  mine.shadows = []
  mine.crewIds = raid.queue.filter((id) => save.workers.some((worker) => worker.id === id))
  mine.raid = null
  mine.digCharge = {}
  for (const id of mine.crewIds) mine.digCharge[id] = 0
  const worker = lead ? save.workers.find((row) => row.id === lead) : undefined
  if (worker && raid.atkMax > 0 && raid.atkHp > 0) {
    worker.hp = clampInt(Math.round((raid.atkHp / raid.atkMax) * worker.hpMax), 1, worker.hpMax)
  }
}

function stepDig(save: Save, mine: TreasureMine): void {
  if (mine.owner === 'player' && !mine.raid) {
    const assigned = mine.crewIds.length
    if (!assigned) return
    for (const id of mine.crewIds) {
      const worker = save.workers.find((row) => row.id === id)
      if (!worker) continue
      digOne(save, mine, id, mineDigIntervalS(worker.level), assigned, assigned, true)
    }
    return
  }
  if (mine.owner !== 'shadow') return
  const mining = mine.raid ? mine.shadows.slice(1) : mine.shadows
  if (!mining.length) return
  const assigned = mine.raid ? Math.max(1, mine.raid.garrison) : mining.length
  for (const shadow of mining) {
    digOne(save, mine, shadow.id, mineDigIntervalS(shadow.level), mining.length, assigned, false)
  }
}

function digOne(
  save: Save,
  mine: TreasureMine,
  id: string,
  intervalS: number,
  miningCount: number,
  assigned: number,
  toVault: boolean,
): void {
  if (mine.reserve <= 0 || miningCount <= 0 || assigned <= 0) return
  const stretched = intervalS * (assigned / miningCount)
  const charge = (mine.digCharge[id] ?? 0) + 1
  if (charge + 1e-9 < stretched) {
    mine.digCharge[id] = charge
    return
  }
  mine.digCharge[id] = charge - stretched
  mine.reserve -= 1
  if (toVault) {
    const item = rollTreasure(save)
    save.treasureMines.vault[item] = (save.treasureMines.vault[item] ?? 0) + 1
  }
}

function rollTreasure(save: Save): TreasureId {
  const roll = nextMineRoll(save.treasureMines)
  if (roll < 0.6) return 'sandGold'
  if (roll < 0.9) return 'jewel'
  return 'jade'
}

function nextMineRoll(state: TreasureMineState): number {
  let seed = state.roll >>> 0
  if (seed === 0) seed = 1
  seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) ^ (seed + Math.imul(seed ^ (seed >>> 7), seed | 61))) >>> 0
  state.roll = seed === 0 ? 1 : seed
  return state.roll / 4294967296
}

function spawnMine(save: Save, elapsed: number): TreasureMine {
  const state = save.treasureMines
  const id = `mine-${state.nextId}`
  state.nextId += 1
  const count = 1 + Math.floor(nextMineRoll(state) * 3)
  const shadows: TreasureShadow[] = []
  for (let i = 0; i < count; i += 1) shadows.push(makeShadow(save, id, i))
  return {
    id,
    reserve: TREASURE_RESERVE_MAX,
    reserveMax: TREASURE_RESERVE_MAX,
    bornAtS: elapsed,
    expiresAtS: elapsed + TREASURE_LIFE_S,
    owner: 'shadow',
    crewIds: [],
    shadows,
    raid: null,
    digCharge: {},
  }
}

function makeShadow(save: Save, mineId: string, index: number): TreasureShadow {
  const tier = (3 + ((save.treasureMines.nextId + index) % 3)) as QualityTier
  const runeId = SHADOW_RUNES[(save.knightLevel + index) % SHADOW_RUNES.length]
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
    name: SHADOW_NAMES[index] ?? '影矿卫',
    level: fake.level,
    hp: stats.hp,
    hpMax: stats.hp,
    atk: Math.max(1, stats.atk),
    spd,
    runeId,
  }
}

function loadAttacker(save: Save, raid: TreasureRaid, armNext: boolean): void {
  const worker = save.workers.find((row) => row.id === raid.queue[0])
  if (!worker) return
  const runeId = raid.runes[worker.id]
  const stats = workerLiveStats(worker, save, runeId)
  const hpMax = Math.max(1, stats.hp)
  const hp = worker.hp <= 0 ? 0 : worker.hpMax > 0 ? Math.round((worker.hp / worker.hpMax) * hpMax) : hpMax
  raid.atkMax = hpMax
  raid.atkHp = Math.max(1, hp)
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
