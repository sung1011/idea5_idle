import { addToBank } from './bank'
import { beastPvpBlockReason } from './beastPvpQuery'
import { applyDownedReturn, isWorkerInCombat, workerLiveStats } from './combat'
import { COMBAT_ATTR_IDS, rollCombatWeakness, scaledAttackDamage, workerMatchesWeakness } from './combatAttrs'
import { offerRestFood } from './food'
import { beijingDayKey, beijingDayRemainS, formatHerbDuration } from './herbPvp'
import { isWorkerInHerbPvp } from './herbPvpQuery'
import { pushMessage } from './messages'
import { playerDisplayName } from './playerName'
import { ITEM_DEF } from './tables'
import { treasureMineBlockReason } from './treasureMineQuery'
import { pickMineAvatarId, pickSnapshotPlayerName } from './treasureMine'
import { isFullWorkshopHp, isWoundedHp } from './workshopHp'
import type {
  ActionResult,
  BeastAttackSpec,
  BeastFight,
  BeastFightWorker,
  BeastKind,
  BeastOfflineNote,
  BeastPvpState,
  BeastReact,
  BeastRecent,
  BeastRival,
  CombatAttrId,
  ItemId,
  Save,
  Worker,
} from './types'

export const BEAST_RIVAL_COUNT = 19
export const BEAST_PARTY_MAX = 3
export const BEAST_PHASE_COUNT = 5
export const BEAST_STAMINA_MAX = 100
export const BEAST_STAMINA_COST = 20
export const BEAST_STAMINA_REGEN_S = 3 * 60
/** 无人出手时掉完的秒数。阶段线会卡住，最后 1 点必须有人打掉。 */
export const BEAST_BLEED_S = 21 * 3600
/**
 * 1 级酋长的困兽血量。假玩家每 10–20 分钟打一场，叠在掉血上。
 * 按这个数，只靠假玩家大约在北京时间 21 点前后打死，落在 20–23 点。
 */
export const BEAST_HP_AT_KNIGHT_1 = 2_000_000
/** 普攻伤害相对同级苦工生命。保证不操作时 3 人大约 30–45 秒倒下。 */
export const BEAST_ATK_HP_RATIO = 0.0538
export const BEAST_NEAR_LINE = 0.03
export const BEAST_RIVAL_RUSH = 0.05
export const BEAST_OPENING_MS = 2000
export const BEAST_STAG_OPENING_MS = 3000
export const BEAST_AUTO_HP = 0.3
export const BEAST_COUNTER_MUL = 2
/** 打断后，本场下一次攻击的伤害系数。 */
export const BEAST_INTERRUPT_MUL = 0.7
export const BEAST_RECENT_CAP = 12
export const BEAST_STEP_MS = 100

const BOAR_GAP_MS = 3200
const WOLF_GAP_MS = 2000
const STAG_GORE_MS = 4200
const STAG_LIGHTNING_MS = 12000
const WOLF_BITE_MUL = 2.2
const WOLF_POUNCE_MUL = 5
const STAG_LIGHTNING_FRAC = 0.36
const RIVAL_ONLINE_MIN = 3
const RIVAL_ONLINE_MAX = 6
const RIVAL_FIGHT_MIN_S = 10 * 60
const RIVAL_FIGHT_MAX_S = 20 * 60
const RIVAL_SESSION_MIN_S = 15 * 60
const RIVAL_SESSION_MAX_S = 40 * 60
const RIVAL_REST_MIN_S = 20 * 60
const RIVAL_REST_MAX_S = 70 * 60
const RIVAL_TARGET_REROLL_S = 10 * 60

export const BEAST_KINDS = ['boar', 'wolf', 'stag'] as const

export const BEAST_COPY: Record<BeastKind, { name: string; blurb: string }> = {
  boar: {
    name: '裂石野猪',
    blurb: '节奏最稳。每普攻 3 次就冲撞一次，冲撞前低吼 1.5 秒，冲撞是普攻的 4 倍。',
  },
  wolf: {
    name: '霜鬃狼王',
    blurb: '节奏快、提示短。每连咬 2 次就扑咬一个苦工，扑咬前只读条 0.8 秒。血越低出招越快。',
  },
  stag: {
    name: '雷角巨鹿',
    blurb: '节奏慢，一招很重。平时顶撞，每 12 秒蓄力 3 秒，雷击打全体。躲开雷击有 3 秒破绽。',
  },
}

const LINE_REWARDS: readonly { itemId: ItemId; qty: number }[] = [
  { itemId: 'beastBone', qty: 3 },
  { itemId: 'beastSinew', qty: 3 },
  { itemId: 'beastFat', qty: 3 },
  { itemId: 'beastHeart', qty: 2 },
]

export type BeastRankReward = { itemId: ItemId; qty: number }

export function beastRankReward(rank: number, dealt: boolean): BeastRankReward[] {
  if (!dealt || rank < 1) return []
  const rows: BeastRankReward[] = []
  if (rank === 1) {
    rows.push({ itemId: 'beastCore', qty: 1 }, { itemId: 'beastHeart', qty: 2 }, { itemId: 'beastFat', qty: 3 })
  } else if (rank <= 3) {
    rows.push({ itemId: 'beastHeart', qty: 1 }, { itemId: 'beastFat', qty: 3 }, { itemId: 'beastBone', qty: 3 })
  } else if (rank <= 10) {
    rows.push({ itemId: 'beastFat', qty: 2 }, { itemId: 'beastBone', qty: 2 })
  } else {
    rows.push({ itemId: 'beastBone', qty: 2 })
  }
  if (!rows.some((row) => row.itemId === 'beastBone')) rows.push({ itemId: 'beastBone', qty: 1 })
  return rows
}

export function beastRewardText(rows: readonly BeastRankReward[]): string {
  if (!rows.length) return '今天没有出手'
  return rows.map((row) => `${ITEM_DEF[row.itemId].label} ×${row.qty}`).join('、')
}

export type BeastNotice = { text: string; kind: 'ok' | 'err' }
export type BeastFx = { text: string; tone: 'hit' | 'hurt' | 'break' | 'dodge' }

let rollOverride: (() => number) | null = null
const notices: BeastNotice[] = []
const fxQueue: BeastFx[] = []

export function setBeastRollOverride(fn: (() => number) | null): void {
  rollOverride = fn
}

export function takeBeastNotices(): BeastNotice[] {
  return notices.splice(0, notices.length)
}

export function takeBeastFx(): BeastFx[] {
  return fxQueue.splice(0, fxQueue.length)
}

export function discardBeastFx(): void {
  fxQueue.length = 0
}

function note(text: string, kind: BeastNotice['kind'], quiet: boolean): void {
  if (quiet) return
  notices.push({ text, kind })
}

function pushFx(text: string, tone: BeastFx['tone'], quiet: boolean): void {
  if (quiet) return
  fxQueue.push({ text, tone })
  if (fxQueue.length > 8) fxQueue.splice(0, fxQueue.length - 8)
}

function clamp01(roll: number): number {
  if (!Number.isFinite(roll)) return 0
  return Math.min(0.999999, Math.max(0, roll))
}

function nextRoll(state: BeastPvpState): number {
  if (rollOverride) return clamp01(rollOverride())
  let seed = state.roll >>> 0
  if (seed === 0) seed = 1
  seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) ^ (seed + Math.imul(seed ^ (seed >>> 7), seed | 61))) >>> 0
  state.roll = seed === 0 ? 1 : seed
  return state.roll / 4294967296
}

function intBetween(state: BeastPvpState, min: number, max: number): number {
  const span = Math.max(1, max - min + 1)
  return min + Math.min(span - 1, Math.floor(nextRoll(state) * span))
}

function blankReacts(): Array<BeastReact | null> {
  return [null, null, null, null, null]
}

export function beastAttackPower(knightLevel: number): number {
  const lv = Math.max(1, Math.floor(knightLevel) || 1)
  const hp = 26 * (1 + 0.04 * (lv - 1))
  return hp * BEAST_ATK_HP_RATIO
}

export function beastHpMax(knightLevel: number): number {
  const lv = Math.max(1, Math.floor(knightLevel) || 1)
  const atkMul = 1 + 0.03 * (lv - 1)
  return Math.max(1000, Math.round(BEAST_HP_AT_KNIGHT_1 * atkMul))
}

/** 假玩家一场伤害的下限：同级 3 人、不操作、大约 38 秒。 */
export function beastAutoFightDamage(knightLevel: number): number {
  const lv = Math.max(1, Math.floor(knightLevel) || 1)
  const atk = Math.max(1, Math.round(4 * (1 + 0.03 * (lv - 1))))
  const spd = 5 * Math.pow(0.99, lv - 1)
  return Math.max(1, Math.round(3 * atk * (38 / spd)))
}

/** 熟练手动大约能打到自动的 2.5 倍。假玩家在这两端之间随机。 */
export function beastSkilledFightDamage(knightLevel: number): number {
  return Math.max(beastAutoFightDamage(knightLevel) + 1, Math.round(beastAutoFightDamage(knightLevel) * 2.5))
}

export function beastBoundaryHp(state: Pick<BeastPvpState, 'hpMax' | 'segments'>, phase: number): number {
  if (phase >= 4) return 0
  let fromTop = 0
  for (let i = 0; i <= phase && i < state.segments.length; i += 1) fromTop += state.segments[i] ?? 0
  return state.hpMax * (1 - fromTop)
}

export function beastLineDistance(state: BeastPvpState): number {
  if (state.killed) return Number.POSITIVE_INFINITY
  const line = state.phase >= 4 ? 0 : beastBoundaryHp(state, state.phase)
  return Math.max(0, state.hp - line)
}

export function beastNearLine(state: BeastPvpState, ratio = BEAST_NEAR_LINE): boolean {
  if (state.killed || state.hpMax <= 0) return false
  return beastLineDistance(state) / state.hpMax < ratio
}

function rollSegments(state: BeastPvpState): number[] {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const raw = [0, 1, 2, 3, 4].map(() => 0.18 + nextRoll(state) * 0.04)
    const sum = raw.reduce((total, value) => total + value, 0)
    const scaled = raw.map((value) => value / sum)
    const drift = 1 - scaled.reduce((total, value) => total + value, 0)
    scaled[4] = (scaled[4] ?? 0.2) + drift
    if (scaled.every((value) => value >= 0.18 - 1e-6 && value <= 0.22 + 1e-6)) return scaled
  }
  return [0.2, 0.2, 0.2, 0.2, 0.2]
}

function rollWeakness(state: BeastPvpState, previous: CombatAttrId | null): CombatAttrId {
  let next = rollCombatWeakness(nextRoll(state))
  if (previous && next === previous) next = rollCombatWeakness(nextRoll(state))
  if (previous && next === previous) {
    const index = COMBAT_ATTR_IDS.indexOf(previous)
    next = COMBAT_ATTR_IDS[(index + 1) % COMBAT_ATTR_IDS.length] ?? 'sword'
  }
  return next
}

function pickKind(state: BeastPvpState): BeastKind {
  return BEAST_KINDS[Math.min(BEAST_KINDS.length - 1, Math.floor(nextRoll(state) * BEAST_KINDS.length))] ?? 'boar'
}

function pushRecent(state: BeastPvpState, text: string): void {
  const row: BeastRecent = { atS: 0, text }
  state.recent.push(row)
  if (state.recent.length > BEAST_RECENT_CAP) state.recent.splice(0, state.recent.length - BEAST_RECENT_CAP)
}

function actorName(save: Save, actor: { id: string; name: string; player: boolean }): string {
  if (actor.player) return playerDisplayName(save.playerName)
  return actor.name || '对手'
}

type StrikeActor = { id: string; name: string; player: boolean }

function grantRows(save: Save, rows: readonly BeastRankReward[]): void {
  for (const row of rows) addToBank(save, row.itemId, row.qty)
}

/** 对困兽造成伤害。自然掉血不走这里。跨过阶段线或打死时立刻发奖。返回实际扣掉的血。 */
export function strikeBeast(save: Save, amount: number, actor: StrikeActor, quiet = false): number {
  const state = ensureBeastPvp(save)
  if (state.killed || !(amount > 0)) return 0
  const before = state.hp
  const next = Math.max(0, before - amount)
  let phase = state.phase
  while (phase < 4) {
    const line = beastBoundaryHp(state, phase)
    if (!(before >= line && next < line)) break
    const reward = LINE_REWARDS[phase]
    const who = actorName(save, actor)
    const text = `${who} 打过了第 ${phase + 1} 段线`
    pushRecent(state, text)
    if (state.offline) state.offline.lines.push(text)
    if (actor.player && reward) {
      grantRows(save, [reward])
      note(`${text}，${ITEM_DEF[reward.itemId].label} ×${reward.qty}`, 'ok', quiet)
    }
    pushFx('破阶段', 'break', quiet)
    phase += 1
    state.weakness = rollWeakness(state, state.weakness)
  }
  state.phase = phase
  if (next <= 0 && before > 0) {
    const who = actorName(save, actor)
    const text = `${who} 打死了困兽`
    pushRecent(state, text)
    if (state.offline) state.offline.lines.push(text)
    if (actor.player) {
      grantRows(save, [{ itemId: 'beastCore', qty: 1 }])
      note(`${text}，困兽之核 ×1`, 'ok', quiet)
    }
    pushFx('猎杀', 'break', quiet)
    state.killed = true
    state.hp = 0
  } else {
    state.hp = next
  }
  const dealt = before - state.hp
  if (actor.player) {
    state.playerDamage += dealt
    if (state.offline) state.offline.damage += dealt
  } else {
    const rival = state.rivals.find((row) => row.id === actor.id)
    if (rival) rival.damage += dealt
  }
  if (state.killed && state.fight) endFight(save, quiet)
  return dealt
}

function bleed(state: BeastPvpState, seconds: number): void {
  if (state.killed || !(seconds > 0) || state.hpMax <= 0) return
  const floor = state.phase >= 4 ? 1 : beastBoundaryHp(state, state.phase)
  if (state.hp <= floor) {
    state.hp = floor
    return
  }
  const drop = (state.hpMax / BEAST_BLEED_S) * seconds
  state.hp = Math.max(floor, state.hp - drop)
}

function living(fight: BeastFight): BeastFightWorker[] {
  return fight.workers.filter((row) => row.hp > 0)
}

function mirrorHp(save: Save, fight: BeastFight): void {
  for (const row of fight.workers) {
    const worker = save.workers.find((item) => item.id === row.id)
    if (!worker) continue
    worker.hp = Math.max(0, Math.min(worker.hpMax, Math.round(row.hp)))
  }
}

function dropWorker(save: Save, fight: BeastFight, row: BeastFightWorker, quiet: boolean): void {
  row.hp = 0
  const index = fight.workers.indexOf(row)
  if (index >= 0) fight.workers.splice(index, 1)
  const worker = save.workers.find((item) => item.id === row.id)
  if (!worker) return
  worker.hp = 0
  applyDownedReturn(save, worker.id, 0, save.lastTick || Date.now())
  if (!quiet) note(`${worker.name ?? '苦工'} 倒下了`, 'err', false)
}

function endFight(save: Save, quiet: boolean): void {
  const state = save.beastPvp
  const fight = state?.fight
  if (!state || !fight) return
  const party = fight.workers.slice()
  state.fight = null
  for (const row of party) {
    const worker = save.workers.find((item) => item.id === row.id)
    if (!worker) continue
    worker.hp = Math.max(0, Math.min(worker.hpMax, Math.round(row.hp)))
    if (worker.hp <= 0) applyDownedReturn(save, worker.id, 0, save.lastTick || Date.now())
    else if (isWoundedHp(worker)) offerRestFood(save, worker.id, save.lastTick || Date.now())
  }
  if (!quiet && party.length) note('这场结束了', 'ok', false)
}

function powerOf(save: Save): number {
  return beastAttackPower(save.knightLevel)
}

function wolfGap(state: BeastPvpState): number {
  const frac = state.hpMax > 0 ? state.hp / state.hpMax : 1
  return Math.max(700, Math.round(WOLF_GAP_MS * (0.62 + 0.38 * frac)))
}

function initialGap(state: BeastPvpState): number {
  if (state.kind === 'wolf') return wolfGap(state)
  if (state.kind === 'stag') return STAG_GORE_MS
  return BOAR_GAP_MS
}

function pullAttack(fight: BeastFight, state: BeastPvpState): BeastAttackSpec {
  if (state.kind === 'wolf') {
    if (fight.normals >= 2) {
      fight.normals = 0
      return {
        kind: 'heavy',
        aoe: false,
        mul: WOLF_POUNCE_MUL,
        telegraphMs: 800,
        gapAfterMs: wolfGap(state),
        hpFrac: 0,
      }
    }
    fight.normals += 1
    return {
      kind: 'normal',
      aoe: false,
      mul: WOLF_BITE_MUL,
      telegraphMs: 0,
      gapAfterMs: wolfGap(state),
      hpFrac: 0,
    }
  }
  if (state.kind === 'stag') {
    return {
      kind: 'normal',
      aoe: false,
      mul: 1,
      telegraphMs: 0,
      gapAfterMs: STAG_GORE_MS,
      hpFrac: 0,
    }
  }
  if (fight.normals >= 3) {
    fight.normals = 0
    return { kind: 'heavy', aoe: true, mul: 4, telegraphMs: 1500, gapAfterMs: BOAR_GAP_MS, hpFrac: 0 }
  }
  fight.normals += 1
  return { kind: 'normal', aoe: true, mul: 1, telegraphMs: 0, gapAfterMs: BOAR_GAP_MS, hpFrac: 0 }
}

function stagLightning(): BeastAttackSpec {
  return {
    kind: 'heavy',
    aoe: true,
    mul: 1,
    telegraphMs: 3000,
    gapAfterMs: STAG_GORE_MS,
    hpFrac: STAG_LIGHTNING_FRAC,
  }
}

function hitOne(fight: BeastFight, amount: number): BeastFightWorker | null {
  const crew = living(fight)
  if (!crew.length || amount <= 0) return null
  let target = crew[0]!
  let ratio = target.hp / Math.max(1, target.hpMax)
  for (const row of crew) {
    const next = row.hp / Math.max(1, row.hpMax)
    if (next < ratio || (next === ratio && row.id < target.id)) {
      target = row
      ratio = next
    }
  }
  target.hp = Math.max(0, target.hp - amount)
  return target
}

function resolveBeastAttack(save: Save, spec: BeastAttackSpec, quiet: boolean): void {
  const state = save.beastPvp
  const fight = state.fight
  if (!state || !fight) return
  const dodged = fight.dodgeNext
  const weaken = fight.weakenNext
  fight.weakenNext = false
  const factor = weaken ? BEAST_INTERRUPT_MUL : 1
  if (dodged) {
    fight.dodgeNext = false
    if (spec.kind === 'heavy') {
      fight.openingMs = state.kind === 'stag' && spec.hpFrac > 0 ? BEAST_STAG_OPENING_MS : BEAST_OPENING_MS
    }
    pushFx(spec.kind === 'heavy' ? '破绽' : '闪开', 'dodge', quiet)
  } else {
    const power = powerOf(save)
    const strikeAmount = (row: BeastFightWorker) =>
      spec.hpFrac > 0
        ? Math.max(1, Math.round(row.hpMax * spec.hpFrac * factor))
        : scaledAttackDamage(power, spec.mul * factor)
    if (spec.aoe) {
      for (const row of living(fight)) row.hp = Math.max(0, row.hp - strikeAmount(row))
    } else if (living(fight).length) {
      hitOne(fight, strikeAmount(living(fight)[0]!))
    }
    pushFx(spec.kind === 'heavy' ? '重击' : '挨打', 'hurt', quiet)
  }
  for (const row of fight.workers.filter((item) => item.hp <= 0)) dropWorker(save, fight, row, quiet)
  if (!state.fight) return
  if (!living(state.fight).length) {
    endFight(save, quiet)
    return
  }
  state.fight.gapMs = spec.gapAfterMs
}

function maybeAutoDodge(save: Save): void {
  const state = save.beastPvp
  const fight = state?.fight
  if (!state || !fight?.auto || fight.dodgeNext) return
  const phase = Math.min(4, Math.max(0, state.phase))
  if (state.reacts[phase]) return
  const crew = living(fight)
  if (crew.length !== 1) return
  const last = crew[0]!
  if (last.hp / Math.max(1, last.hpMax) > BEAST_AUTO_HP) return
  fight.dodgeNext = true
  state.reacts[phase] = 'dodge'
}

function workerStrike(save: Save, row: BeastFightWorker, quiet: boolean): void {
  const state = save.beastPvp
  const fight = state?.fight
  if (!state || !fight || state.killed || row.hp <= 0) return
  let mul = 1
  if (fight.openingMs > 0) mul *= 2
  if (workerMatchesWeakness(row.attrs, [state.weakness])) mul *= BEAST_COUNTER_MUL
  const damage = scaledAttackDamage(row.atk, mul)
  strikeBeast(save, damage, { id: row.id, name: row.name, player: true }, quiet)
  pushFx(`${row.name} 出手`, 'hit', quiet)
}

function tickFight(save: Save, ms: number, quiet: boolean): void {
  const state = save.beastPvp
  const fight = state?.fight
  if (!state || !fight || state.killed) return
  maybeAutoDodge(save)
  fight.elapsedMs += ms
  if (fight.openingMs > 0) fight.openingMs = Math.max(0, fight.openingMs - ms)
  for (const row of living(fight)) {
    row.accMs += ms
    const interval = Math.max(200, Math.round(row.spd * 1000))
    while (row.accMs >= interval && row.hp > 0 && state.fight && !state.killed) {
      row.accMs -= interval
      workerStrike(save, row, quiet)
    }
  }
  if (!state.fight || state.killed) return
  if (fight.telegraph) {
    fight.telegraph.remainMs -= ms
    if (fight.telegraph.remainMs <= 0) {
      const spec = fight.telegraph.spec
      fight.telegraph = null
      resolveBeastAttack(save, spec, quiet)
    }
  } else if (state.kind === 'stag') {
    fight.lightningMs -= ms
    fight.goreMs -= ms
    if (fight.lightningMs <= 0) {
      fight.lightningMs = STAG_LIGHTNING_MS
      const spec = stagLightning()
      fight.telegraph = { remainMs: spec.telegraphMs, totalMs: spec.telegraphMs, spec }
    } else if (fight.goreMs <= 0) {
      fight.goreMs = STAG_GORE_MS
      resolveBeastAttack(save, pullAttack(fight, state), quiet)
    }
  } else {
    fight.gapMs -= ms
    if (fight.gapMs <= 0) {
      const spec = pullAttack(fight, state)
      if (spec.telegraphMs > 0) {
        fight.telegraph = { remainMs: spec.telegraphMs, totalMs: spec.telegraphMs, spec }
        fight.gapMs = 0
      } else {
        resolveBeastAttack(save, spec, quiet)
      }
    }
  }
  if (state.fight) mirrorHp(save, state.fight)
}

function advanceFight(save: Save, ms: number, quiet: boolean, forceAuto: boolean): void {
  if (forceAuto && save.beastPvp?.fight) save.beastPvp.fight.auto = true
  let left = Math.max(0, Math.round(ms))
  let guard = 0
  while (left > 0 && save.beastPvp?.fight && !save.beastPvp.killed && guard < 80) {
    const slice = Math.min(BEAST_STEP_MS, left)
    left -= slice
    guard += 1
    tickFight(save, slice, quiet)
  }
}

export function finishBeastFightAuto(save: Save, quiet = false): void {
  const state = save.beastPvp
  if (!state?.fight) return
  state.fight.auto = true
  let guard = 0
  while (state.fight && !state.killed && guard < 8000) {
    tickFight(save, BEAST_STEP_MS, quiet)
    guard += 1
  }
  if (state.fight) endFight(save, quiet)
}

function createRivals(save: Save, state: BeastPvpState): BeastRival[] {
  const taken = new Set<string>()
  const rivals: BeastRival[] = []
  for (let i = 0; i < BEAST_RIVAL_COUNT; i += 1) {
    const name = pickSnapshotPlayerName(nextRoll(state), taken)
    taken.add(name)
    rivals.push({
      id: `beast-rival-${i}`,
      name,
      avatarId: pickMineAvatarId(nextRoll(state)),
      damage: 0,
      nextFightAtS: save.elapsedS + intBetween(state, 30, RIVAL_FIGHT_MAX_S),
      onlineUntilS: null,
      nextOnlineAtS: save.elapsedS + intBetween(state, 0, RIVAL_REST_MAX_S),
      reacts: blankReacts(),
    })
  }
  return rivals
}

function seatOnline(save: Save, state: BeastPvpState): void {
  if (save.elapsedS >= state.targetUntilS) {
    state.onlineTarget = intBetween(state, RIVAL_ONLINE_MIN, RIVAL_ONLINE_MAX)
    state.targetUntilS = save.elapsedS + RIVAL_TARGET_REROLL_S
  }
  for (const rival of state.rivals) {
    if (rival.onlineUntilS != null && save.elapsedS >= rival.onlineUntilS) {
      rival.onlineUntilS = null
      rival.nextOnlineAtS = save.elapsedS + intBetween(state, RIVAL_REST_MIN_S, RIVAL_REST_MAX_S)
    }
  }
  let online = state.rivals.filter((rival) => rival.onlineUntilS != null).length
  if (online > state.onlineTarget) {
    const extra = state.rivals.filter((rival) => rival.onlineUntilS != null)
    while (online > state.onlineTarget && extra.length) {
      const rival = extra.pop()
      if (!rival) break
      rival.onlineUntilS = null
      rival.nextOnlineAtS = save.elapsedS + intBetween(state, RIVAL_REST_MIN_S, RIVAL_REST_MAX_S)
      online -= 1
    }
  }
  for (const rival of state.rivals) {
    if (online >= state.onlineTarget) break
    if (rival.onlineUntilS != null) continue
    if (rival.nextOnlineAtS > save.elapsedS) continue
    rival.onlineUntilS = save.elapsedS + intBetween(state, RIVAL_SESSION_MIN_S, RIVAL_SESSION_MAX_S)
    if (rival.nextFightAtS < save.elapsedS) {
      rival.nextFightAtS = save.elapsedS + intBetween(state, 20, 180)
    }
    online += 1
  }
}

/** 假玩家打断只加在自己这场的抽象伤害上，不写最近，不影响别人。 */
const RIVAL_INTERRUPT_DAMAGE_MUL = 1.08

function runRivalFight(save: Save, rival: BeastRival, quiet: boolean): void {
  const state = save.beastPvp
  if (!state || state.killed) return
  const phase = Math.min(4, Math.max(0, state.phase))
  let damage = beastAutoFightDamage(save.knightLevel)
  const skilled = beastSkilledFightDamage(save.knightLevel)
  damage = Math.round(damage + (skilled - damage) * nextRoll(state))
  if (rival.reacts[phase] == null && nextRoll(state) < 0.3) {
    rival.reacts[phase] = 'interrupt'
    damage = Math.round(damage * RIVAL_INTERRUPT_DAMAGE_MUL)
  }
  strikeBeast(save, damage, { id: rival.id, name: rival.name, player: false }, quiet)
}

function stepRivals(save: Save, state: BeastPvpState, quiet: boolean): void {
  if (state.killed) return
  seatOnline(save, state)
  for (const rival of state.rivals) {
    if (state.killed) return
    if (rival.onlineUntilS == null) continue
    if (save.elapsedS < rival.nextFightAtS) continue
    runRivalFight(save, rival, quiet)
    if (state.killed) return
    rival.nextFightAtS = save.elapsedS + fightGapS(state)
  }
}

function fightGapS(state: BeastPvpState): number {
  const base = intBetween(state, RIVAL_FIGHT_MIN_S, RIVAL_FIGHT_MAX_S)
  if (beastNearLine(state, BEAST_RIVAL_RUSH)) return Math.max(60, Math.round(base / 2))
  return base
}

function regenStamina(state: BeastPvpState): void {
  if (state.stamina >= BEAST_STAMINA_MAX) {
    state.stamina = BEAST_STAMINA_MAX
    state.staminaAccS = 0
    return
  }
  state.staminaAccS += 1
  while (state.stamina < BEAST_STAMINA_MAX && state.staminaAccS >= BEAST_STAMINA_REGEN_S) {
    state.staminaAccS -= BEAST_STAMINA_REGEN_S
    state.stamina += 1
  }
  if (state.stamina >= BEAST_STAMINA_MAX) state.staminaAccS = 0
}

function freshBeast(save: Save, state: BeastPvpState, now: number): void {
  state.dayKey = beijingDayKey(now)
  state.kind = pickKind(state)
  state.hpMax = beastHpMax(save.knightLevel)
  state.hp = state.hpMax
  state.segments = rollSegments(state)
  state.phase = 0
  state.weakness = rollWeakness(state, null)
  state.killed = false
  state.reacts = blankReacts()
  state.playerDamage = 0
  state.recent = []
  state.fight = null
  state.rivals = createRivals(save, state)
  state.onlineTarget = intBetween(state, RIVAL_ONLINE_MIN, RIVAL_ONLINE_MAX)
  state.targetUntilS = save.elapsedS + RIVAL_TARGET_REROLL_S
  for (let i = 0; i < state.onlineTarget; i += 1) {
    const rival = state.rivals[i]
    if (!rival) break
    rival.onlineUntilS = save.elapsedS + intBetween(state, RIVAL_SESSION_MIN_S, RIVAL_SESSION_MAX_S)
    rival.nextFightAtS = save.elapsedS + intBetween(state, 30, RIVAL_FIGHT_MAX_S)
  }
}

function rollDay(save: Save, now: number, quiet: boolean): void {
  const state = save.beastPvp
  if (!state || !Number.isFinite(now)) return
  const key = beijingDayKey(now)
  if (!state.dayKey) {
    state.dayKey = key
    return
  }
  if (key <= state.dayKey) return
  if (state.fight) finishBeastFightAuto(save, quiet)
  const rank = beastPlayerRank(save)
  const dealt = state.playerDamage > 0
  const rows = beastRankReward(rank, dealt)
  grantRows(save, rows)
  const text = dealt ? `第 ${rank} 名：${beastRewardText(rows)}` : '今天没有出手'
  state.lastRewardText = text
  if (quiet && state.offline) state.offline.rewards.push(text)
  else pushMessage(save, { title: '困兽结算', body: text, createdAt: now })
  if (!quiet) note(dealt ? '困兽日结，奖励已入账' : '困兽日结，今天没有出手', 'ok', false)
  freshBeast(save, state, now)
}

export function createBeastPvp(save: Save, now = Date.now()): BeastPvpState {
  const state: BeastPvpState = {
    roll: 1,
    dayKey: '',
    kind: 'boar',
    hp: 1,
    hpMax: 1,
    segments: [0.2, 0.2, 0.2, 0.2, 0.2],
    phase: 0,
    weakness: 'sword',
    killed: false,
    stamina: BEAST_STAMINA_MAX,
    staminaAccS: 0,
    playerDamage: 0,
    reacts: blankReacts(),
    rivals: [],
    onlineTarget: RIVAL_ONLINE_MIN,
    targetUntilS: save.elapsedS,
    recent: [],
    fight: null,
    auto: false,
    lastRewardText: '',
    offline: null,
  }
  freshBeast(save, state, now)
  return state
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isKind(value: unknown): value is BeastKind {
  return value === 'boar' || value === 'wolf' || value === 'stag'
}

export function hydrateBeastPvp(save: Save, now = save.lastTick || Date.now()): void {
  const raw = save.beastPvp as BeastPvpState | undefined
  if (!raw || !Array.isArray(raw.rivals) || raw.rivals.length !== BEAST_RIVAL_COUNT) {
    const stamina = finite(raw?.stamina, BEAST_STAMINA_MAX)
    const acc = finite(raw?.staminaAccS, 0)
    const auto = raw?.auto === true
    save.beastPvp = createBeastPvp(save, now)
    save.beastPvp.stamina = Math.min(BEAST_STAMINA_MAX, Math.max(0, Math.floor(stamina)))
    save.beastPvp.staminaAccS = Math.min(BEAST_STAMINA_REGEN_S, Math.max(0, Math.floor(acc)))
    save.beastPvp.auto = auto
    return
  }
  save.beastPvp = raw
  const state = raw
  if (!isKind(state.kind)) state.kind = 'boar'
  if (!Array.isArray(state.segments) || state.segments.length !== 5) state.segments = [0.2, 0.2, 0.2, 0.2, 0.2]
  state.hpMax = Math.max(1, finite(state.hpMax, beastHpMax(save.knightLevel)))
  state.hp = Math.min(state.hpMax, Math.max(0, finite(state.hp, state.hpMax)))
  state.phase = Math.min(4, Math.max(0, Math.floor(finite(state.phase, 0))))
  if (typeof state.weakness !== 'string' || !COMBAT_ATTR_IDS.includes(state.weakness)) {
    state.weakness = rollWeakness(state, null)
  }
  state.killed = state.killed === true || state.hp <= 0
  if (state.killed) state.hp = 0
  state.stamina = Math.min(BEAST_STAMINA_MAX, Math.max(0, Math.floor(finite(state.stamina, BEAST_STAMINA_MAX))))
  state.staminaAccS = Math.min(BEAST_STAMINA_REGEN_S, Math.max(0, Math.floor(finite(state.staminaAccS, 0))))
  state.playerDamage = Math.max(0, finite(state.playerDamage, 0))
  if (!Array.isArray(state.reacts) || state.reacts.length !== 5) state.reacts = blankReacts()
  state.reacts = state.reacts.map((row) => (row === 'dodge' || row === 'interrupt' ? row : null))
  if (!Array.isArray(state.recent)) state.recent = []
  state.auto = state.auto === true
  if (typeof state.dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.dayKey)) state.dayKey = beijingDayKey(now)
  if (typeof state.lastRewardText !== 'string') state.lastRewardText = ''
  delete (state as { enrage?: unknown }).enrage
  state.fight = normalizeFight(state.fight)
  for (const rival of state.rivals) {
    rival.damage = Math.max(0, finite(rival.damage, 0))
    if (!Array.isArray(rival.reacts) || rival.reacts.length !== 5) rival.reacts = blankReacts()
    rival.reacts = rival.reacts.map((row) => (row === 'dodge' || row === 'interrupt' ? row : null))
    if (typeof rival.name !== 'string' || !rival.name) rival.name = '对手'
    if (typeof rival.avatarId !== 'string') rival.avatarId = 'helm'
  }
}

function normalizeFight(raw: BeastFight | null | undefined): BeastFight | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.workers)) return null
  raw.workers = raw.workers.filter((row) => row && typeof row.id === 'string' && row.hp > 0)
  if (!raw.workers.length) return null
  raw.dodgeNext = raw.dodgeNext === true
  raw.weakenNext = raw.weakenNext === true
  raw.auto = raw.auto === true
  raw.gapMs = finite(raw.gapMs, BOAR_GAP_MS)
  raw.goreMs = finite(raw.goreMs, STAG_GORE_MS)
  raw.lightningMs = finite(raw.lightningMs, STAG_LIGHTNING_MS)
  raw.openingMs = Math.max(0, finite(raw.openingMs, 0))
  raw.elapsedMs = Math.max(0, finite(raw.elapsedMs, 0))
  raw.normals = Math.max(0, Math.floor(finite(raw.normals, 0)))
  return raw
}

export function ensureBeastPvp(save: Save, now = save.lastTick || Date.now()): BeastPvpState {
  if (!save.beastPvp || save.beastPvp.rivals?.length !== BEAST_RIVAL_COUNT) hydrateBeastPvp(save, now)
  return save.beastPvp
}

export type BeastRankRow = {
  id: string
  name: string
  avatarId: string
  damage: number
  rank: number
  self: boolean
}

export function beastLeaderboard(save: Save): BeastRankRow[] {
  const state = ensureBeastPvp(save)
  const rows: BeastRankRow[] = [
    {
      id: 'player',
      name: playerDisplayName(save.playerName),
      avatarId: typeof save.playerAvatarId === 'string' ? save.playerAvatarId : 'helm',
      damage: state.playerDamage,
      rank: 0,
      self: true,
    },
  ]
  for (const rival of state.rivals) {
    rows.push({
      id: rival.id,
      name: rival.name,
      avatarId: rival.avatarId,
      damage: rival.damage,
      rank: 0,
      self: false,
    })
  }
  rows.sort((a, b) => b.damage - a.damage || Number(b.self) - Number(a.self) || (a.id < b.id ? -1 : 1))
  rows.forEach((row, index) => {
    row.rank = index + 1
  })
  return rows
}

export function beastPlayerRank(save: Save): number {
  return beastLeaderboard(save).find((row) => row.self)?.rank ?? BEAST_RIVAL_COUNT + 1
}

export function beastHud(save: Save, now = Date.now()) {
  const state = ensureBeastPvp(save, now)
  const copy = BEAST_COPY[state.kind]
  const missing = Math.max(0, BEAST_STAMINA_MAX - state.stamina)
  const fullS = state.stamina >= BEAST_STAMINA_MAX ? 0 : missing * BEAST_STAMINA_REGEN_S - state.staminaAccS
  const phase = Math.min(4, Math.max(0, state.phase))
  const used = state.reacts[phase]
  const telegraph = state.fight?.telegraph
  return {
    kind: state.kind,
    name: copy.name,
    blurb: copy.blurb,
    hp: state.hp,
    hpMax: state.hpMax,
    hpText: state.killed ? '0' : String(Math.max(1, Math.ceil(state.hp))),
    segments: state.segments.slice(),
    phase,
    weakness: state.weakness,
    nearLine: beastNearLine(state),
    killed: state.killed,
    stamina: state.stamina,
    staminaMax: BEAST_STAMINA_MAX,
    staminaCost: BEAST_STAMINA_COST,
    staminaNextS: state.stamina >= BEAST_STAMINA_MAX ? 0 : BEAST_STAMINA_REGEN_S - state.staminaAccS,
    staminaFullS: Math.max(0, fullS),
    dayRemainS: beijingDayRemainS(now),
    rank: beastPlayerRank(save),
    damage: state.playerDamage,
    lastRewardText: state.lastRewardText,
    fighting: !!state.fight,
    auto: state.fight ? state.fight.auto : state.auto,
    telegraph: telegraph
      ? {
          label: telegraph.spec.kind === 'heavy' ? (state.kind === 'stag' ? '雷击' : state.kind === 'wolf' ? '扑咬' : '冲撞') : '出招',
          ratio: telegraph.totalMs > 0 ? 1 - telegraph.remainMs / telegraph.totalMs : 1,
        }
      : null,
    workers: (state.fight?.workers ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      hp: row.hp,
      hpMax: row.hpMax,
    })),
    opening: (state.fight?.openingMs ?? 0) > 0,
    reactUsed: used != null,
    canDodge: !!state.fight && used == null && !state.fight.dodgeNext,
    canInterrupt: !!state.fight && used == null && !!state.fight.telegraph,
    recent: state.recent.slice().reverse(),
    board: beastLeaderboard(save),
  }
}

export function formatBeastDuration(seconds: number): string {
  return formatHerbDuration(seconds)
}

function makeFight(save: Save, workers: Worker[], auto: boolean): BeastFight {
  const state = save.beastPvp
  const fight: BeastFight = {
    workers: workers.map((worker, index) => {
      const stats = workerLiveStats(worker, save)
      return {
        id: worker.id,
        name: worker.name ?? '苦工',
        hp: stats.hp,
        hpMax: stats.hp,
        atk: stats.atk,
        spd: stats.spd,
        accMs: index * 300,
        attrs: worker.combatAttrs.slice(),
      }
    }),
    elapsedMs: 0,
    normals: 0,
    gapMs: initialGap(state),
    goreMs: STAG_GORE_MS,
    lightningMs: STAG_LIGHTNING_MS,
    telegraph: null,
    dodgeNext: false,
    weakenNext: false,
    openingMs: 0,
    auto,
  }
  return fight
}

export function startBeastFight(save: Save, workerIds: readonly string[]): ActionResult {
  const state = ensureBeastPvp(save)
  if (state.killed) return { ok: false, reason: '困兽已被猎杀' }
  if (state.fight) return { ok: false, reason: '这场还没打完' }
  const ids = [...new Set(workerIds)]
  if (ids.length < 1) return { ok: false, reason: '请选择出战苦工' }
  if (ids.length > BEAST_PARTY_MAX) return { ok: false, reason: '最多选 3 人' }
  if (state.stamina < BEAST_STAMINA_COST) return { ok: false, reason: '体力不足' }
  const party: Worker[] = []
  for (const id of ids) {
    const worker = save.workers.find((row) => row.id === id)
    if (!worker) return { ok: false, reason: '没有这个苦工' }
    if (worker.assignment) return { ok: false, reason: '不在休息区' }
    if (isWorkerInCombat(save, id)) return { ok: false, reason: '正在战斗' }
    const mine = treasureMineBlockReason(save, id)
    if (mine) return { ok: false, reason: mine }
    if (isWorkerInHerbPvp(save, id)) return { ok: false, reason: '正在割草' }
    const beast = beastPvpBlockReason(save, id)
    if (beast) return { ok: false, reason: beast }
    if (!isFullWorkshopHp(worker)) return { ok: false, reason: '满血才能上阵' }
    party.push(worker)
  }
  state.stamina -= BEAST_STAMINA_COST
  state.fight = makeFight(save, party, state.auto)
  const names = party.map((worker) => worker.name ?? '苦工').join('、')
  return { ok: true, message: `${names} 上阵，花 ${BEAST_STAMINA_COST} 体力` }
}

export function beastDodge(save: Save): ActionResult {
  const state = ensureBeastPvp(save)
  const fight = state.fight
  if (!fight) return { ok: false, reason: '还没开始挑战' }
  const phase = Math.min(4, state.phase)
  if (state.reacts[phase] || fight.dodgeNext) return { ok: false, reason: '这一阶段已经用过' }
  state.reacts[phase] = 'dodge'
  fight.dodgeNext = true
  return { ok: true, message: '准备躲开下一次攻击' }
}

export function beastInterrupt(save: Save): ActionResult {
  const state = ensureBeastPvp(save)
  const fight = state.fight
  if (!fight) return { ok: false, reason: '还没开始挑战' }
  const phase = Math.min(4, state.phase)
  if (state.reacts[phase]) return { ok: false, reason: '这一阶段已经用过' }
  if (!fight.telegraph) return { ok: false, reason: '困兽没在读条' }
  fight.telegraph = null
  fight.weakenNext = true
  state.reacts[phase] = 'interrupt'
  fight.gapMs = initialGap(state)
  return { ok: true, message: '这一下取消了，下一击伤害减少' }
}

export function setBeastAuto(save: Save, on: boolean): ActionResult {
  const state = ensureBeastPvp(save)
  state.auto = on
  if (state.fight) state.fight.auto = on
  return { ok: true, message: on ? '自动闪避开了' : '自动闪避关了' }
}

export function stepBeastPvp(save: Save, now: number, opts?: { offline?: boolean }): void {
  const quiet = opts?.offline === true
  const state = ensureBeastPvp(save, now)
  rollDay(save, now, quiet)
  regenStamina(state)
  if (!state.killed) bleed(state, 1)
  if (state.fight && !state.killed) advanceFight(save, 1000, quiet, false)
  stepRivals(save, state, quiet)
  for (const row of state.recent) if (row.atS <= 0) row.atS = save.elapsedS
}

export function beginBeastOfflineReport(save: Save): void {
  const state = ensureBeastPvp(save)
  if (state.fight) finishBeastFightAuto(save, true)
  const bag: BeastOfflineNote = {
    rankAtStart: beastPlayerRank(save),
    damage: 0,
    rewards: [],
    lines: [],
  }
  state.offline = bag
}

export function finishBeastOfflineReport(save: Save): string | null {
  const state = save.beastPvp
  const noteBag = state?.offline
  if (!state || !noteBag) return null
  state.offline = null
  const rankNow = beastPlayerRank(save)
  const quiet =
    noteBag.damage <= 0 &&
    noteBag.rewards.length === 0 &&
    noteBag.lines.length === 0 &&
    noteBag.rankAtStart === rankNow
  if (quiet) return null
  const damage = noteBag.damage > 0 ? `你的伤害 +${Math.round(noteBag.damage)}` : '你没有出手'
  const rank =
    noteBag.rankAtStart === rankNow
      ? `名次：仍是第 ${rankNow} 名`
      : `名次：第 ${noteBag.rankAtStart} 名 → 第 ${rankNow} 名`
  const lines = noteBag.lines.length ? `最近：${noteBag.lines.slice(-4).join('；')}` : '最近：没有'
  const reward = noteBag.rewards.length ? `昨日奖励：${noteBag.rewards.join('；')}` : '昨日奖励：没有'
  return [damage, lines, rank, reward].join('\n')
}

export function gmBeastFillStamina(save: Save): ActionResult {
  const state = ensureBeastPvp(save)
  state.stamina = BEAST_STAMINA_MAX
  state.staminaAccS = 0
  return { ok: true, message: '困兽体力已满' }
}

export function gmBeastJumpToLine(save: Save): ActionResult {
  const state = ensureBeastPvp(save)
  if (state.killed) return { ok: false, reason: '困兽已被猎杀' }
  if (state.fight) return { ok: false, reason: '先打完这场' }
  state.hp = state.phase >= 4 ? 1 : beastBoundaryHp(state, state.phase)
  return { ok: true, message: '血量已到当前阶段线' }
}

export function gmBeastCycleKind(save: Save): ActionResult {
  const state = ensureBeastPvp(save)
  const index = BEAST_KINDS.indexOf(state.kind)
  state.kind = BEAST_KINDS[(index + 1) % BEAST_KINDS.length] ?? 'boar'
  if (state.fight) {
    state.fight.telegraph = null
    state.fight.normals = 0
    state.fight.gapMs = initialGap(state)
    state.fight.goreMs = STAG_GORE_MS
    state.fight.lightningMs = STAG_LIGHTNING_MS
  }
  return { ok: true, message: `今日困兽换成${BEAST_COPY[state.kind].name}` }
}
