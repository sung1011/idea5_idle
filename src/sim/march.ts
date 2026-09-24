import type {
  CombatPhase,
  EnemyCombat,
  EnemyEncounter,
  Save,
  TreasureMine,
  TreasureRaid,
} from './types'

export const COMBAT_PHASE_LABEL: Record<CombatPhase, string> = {
  marchOut: '出征中',
  fighting: '交战中',
  marchHomeWin: '凯旋中',
  marchHomeLose: '溃退中',
}

/** 旧档没有 phase、且还没分出胜负：当作已经在打。 */
export function combatPhaseOf(combat: EnemyCombat | null | undefined): CombatPhase | 'settled' {
  if (!combat) return 'settled'
  if (combat.phase === 'marchHomeWin' || combat.phase === 'marchHomeLose') return combat.phase
  if (combat.outcome) return 'settled'
  if (combat.phase === 'marchOut') return 'marchOut'
  return 'fighting'
}

export function raidPhaseOf(raid: TreasureRaid | null | undefined): CombatPhase {
  if (
    raid?.phase === 'marchOut' ||
    raid?.phase === 'fighting' ||
    raid?.phase === 'marchHomeWin' ||
    raid?.phase === 'marchHomeLose'
  ) {
    return raid.phase
  }
  return 'fighting'
}

export function formatRemainClock(remainS: number): string {
  const safe = Math.max(0, Math.floor(remainS))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 矿洞读条用的游戏秒。权威仍是 `elapsedS`，两拍之间按墙钟往前插，最多 1 秒。
 * 与矿卡出手条、战场 `actNow` 同一路：不要等下一次 sim tick 才动。
 */
export function visualRaidElapsedS(save: Save, now = Date.now()): number {
  const elapsed = save.elapsedS
  const last = save.lastTick
  if (typeof last !== 'number' || !Number.isFinite(last) || !Number.isFinite(now)) return elapsed
  const dt = Math.max(0, Math.min(1, (now - last) / 1000))
  return elapsed + dt
}

function remainFrom(endsAt: number | undefined, now: number): number {
  if (typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return 0
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

function progressOf(startedAt: number | undefined, endsAt: number | undefined, now: number): number {
  if (typeof startedAt !== 'number' || typeof endsAt !== 'number') return 0
  const span = endsAt - startedAt
  if (!(span > 0)) return 1
  return Math.min(1, Math.max(0, (now - startedAt) / span))
}

export type MarchCaption = {
  phase: CombatPhase
  label: string
  remainS: number
  progress: number
}

/** 订单卡出征 / 归来文案。交战中若有人溃退，也给一行。 */
export function encounterMarchCaption(enc: EnemyEncounter, now = Date.now()): MarchCaption | null {
  const combat = enc.combat
  if (!combat) return null
  const phase = combatPhaseOf(combat)
  if (phase === 'marchOut' || phase === 'marchHomeWin' || phase === 'marchHomeLose') {
    return {
      phase,
      label: COMBAT_PHASE_LABEL[phase],
      remainS: remainFrom(combat.phaseEndsAt, now),
      progress: progressOf(combat.phaseStartedAt, combat.phaseEndsAt, now),
    }
  }
  if (phase !== 'fighting') return null
  const pending = (combat.returning ?? []).filter((row) => row.until > now)
  if (!pending.length) return null
  const soon = pending.reduce((best, row) => (row.until < best.until ? row : best))
  return {
    phase: 'marchHomeLose',
    label: COMBAT_PHASE_LABEL.marchHomeLose,
    remainS: remainFrom(soon.until, now),
    progress: progressOf(soon.startedAt, soon.until, now),
  }
}

export function raidMarchCaption(mine: TreasureMine, elapsedS: number): MarchCaption | null {
  const raid = mine.raid
  if (!raid) return null
  const phase = raidPhaseOf(raid)
  const nowMs = elapsedS * 1000
  if (phase === 'marchOut' || phase === 'marchHomeWin' || phase === 'marchHomeLose') {
    const started = (raid.phaseStartedAtS ?? elapsedS) * 1000
    const ends = (raid.phaseEndsAtS ?? elapsedS) * 1000
    return {
      phase,
      label: COMBAT_PHASE_LABEL[phase],
      remainS: Math.max(0, Math.ceil((raid.phaseEndsAtS ?? elapsedS) - elapsedS)),
      progress: progressOf(started, ends, nowMs),
    }
  }
  const pending = (raid.returning ?? []).filter((row) => row.untilS > elapsedS)
  if (!pending.length) return null
  const soon = pending.reduce((best, row) => (row.untilS < best.untilS ? row : best))
  return {
    phase: 'marchHomeLose',
    label: COMBAT_PHASE_LABEL.marchHomeLose,
    remainS: Math.max(0, Math.ceil(soon.untilS - elapsedS)),
    progress: progressOf(soon.startedAtS * 1000, soon.untilS * 1000, nowMs),
  }
}

export type CombatZoneTone = 'out' | 'fight' | 'win' | 'lose'

export type CombatZoneRow = {
  workerId: string
  tone: CombatZoneTone
  label: string
  remainS: number
  progress: number
}

function toneOf(phase: CombatPhase): CombatZoneTone {
  if (phase === 'marchOut') return 'out'
  if (phase === 'marchHomeWin') return 'win'
  if (phase === 'marchHomeLose') return 'lose'
  return 'fight'
}

function pushRow(rows: CombatZoneRow[], seen: Set<string>, row: CombatZoneRow) {
  if (!row.workerId || seen.has(row.workerId)) return
  seen.add(row.workerId)
  rows.push(row)
}

function rowsFromCombat(combat: EnemyCombat, now: number, rows: CombatZoneRow[], seen: Set<string>) {
  const phase = combatPhaseOf(combat)
  if (phase === 'settled') {
    for (const back of combat.returning ?? []) {
      if (back.until <= now) continue
      pushRow(rows, seen, {
        workerId: back.id,
        tone: 'lose',
        label: COMBAT_PHASE_LABEL.marchHomeLose,
        remainS: remainFrom(back.until, now),
        progress: progressOf(back.startedAt, back.until, now),
      })
    }
    return
  }
  const captionPhase: CombatPhase = phase
  const label = COMBAT_PHASE_LABEL[captionPhase]
  const tone = toneOf(captionPhase)
  const remainS = phase === 'fighting' ? 0 : remainFrom(combat.phaseEndsAt, now)
  const progress = phase === 'fighting' ? 0 : progressOf(combat.phaseStartedAt, combat.phaseEndsAt, now)
  if (phase === 'marchOut') {
    for (const id of combat.workerIds) {
      pushRow(rows, seen, { workerId: id, tone, label, remainS, progress })
    }
  } else if (phase === 'fighting' || phase === 'marchHomeWin' || phase === 'marchHomeLose') {
    for (const fighter of combat.workers) {
      if (fighter.hp <= 0) continue
      pushRow(rows, seen, { workerId: fighter.id, tone, label, remainS, progress })
    }
  }
  for (const row of combat.incoming ?? []) {
    if (row.arrivesAt <= now) continue
    pushRow(rows, seen, {
      workerId: row.id,
      tone: 'out',
      label: COMBAT_PHASE_LABEL.marchOut,
      remainS: remainFrom(row.arrivesAt, now),
      progress: progressOf(row.startedAt, row.arrivesAt, now),
    })
  }
  for (const back of combat.returning ?? []) {
    if (back.until <= now) continue
    const backPhase: CombatPhase = back.reason === 'win' ? 'marchHomeWin' : 'marchHomeLose'
    pushRow(rows, seen, {
      workerId: back.id,
      tone: toneOf(backPhase),
      label: COMBAT_PHASE_LABEL[backPhase],
      remainS: remainFrom(back.until, now),
      progress: progressOf(back.startedAt, back.until, now),
    })
  }
}

function rowsFromRaid(mine: TreasureMine, elapsedS: number, rows: CombatZoneRow[], seen: Set<string>) {
  const raid = mine.raid
  if (!raid) return
  const phase = raidPhaseOf(raid)
  const nowMs = elapsedS * 1000
  const started = (raid.phaseStartedAtS ?? elapsedS) * 1000
  const ends = (raid.phaseEndsAtS ?? elapsedS) * 1000
  const label = COMBAT_PHASE_LABEL[phase]
  const tone = toneOf(phase)
  const remainS = phase === 'fighting' ? 0 : Math.max(0, Math.ceil((raid.phaseEndsAtS ?? elapsedS) - elapsedS))
  const progress = phase === 'fighting' ? 0 : progressOf(started, ends, nowMs)
  if (phase === 'marchOut' || phase === 'fighting' || phase === 'marchHomeWin' || phase === 'marchHomeLose') {
    for (const id of raid.queue) {
      pushRow(rows, seen, { workerId: id, tone, label, remainS, progress })
    }
  }
  for (const back of raid.returning ?? []) {
    if (back.untilS <= elapsedS) continue
    const backPhase: CombatPhase = back.reason === 'win' ? 'marchHomeWin' : 'marchHomeLose'
    pushRow(rows, seen, {
      workerId: back.id,
      tone: toneOf(backPhase),
      label: COMBAT_PHASE_LABEL[backPhase],
      remainS: Math.max(0, Math.ceil(back.untilS - elapsedS)),
      progress: progressOf(back.startedAtS * 1000, back.untilS * 1000, nowMs),
    })
  }
}

/** 工坊战斗区：出征、交战、凯旋、溃退。休息区不要再列这些人。 */
export function combatZoneRows(save: Save, now = Date.now()): CombatZoneRow[] {
  const rows: CombatZoneRow[] = []
  const seen = new Set<string>()
  const boards = [...(save.encounters ?? [])]
  for (const enc of save.dungeon?.encounters ?? []) boards.push(enc)
  for (const enc of boards) {
    if (enc.kind !== 'enemy' || !enc.combat) continue
    rowsFromCombat(enc.combat, now, rows, seen)
  }
  const raidNow = visualRaidElapsedS(save, now)
  for (const mine of save.treasureMines?.mines ?? []) {
    rowsFromRaid(mine, raidNow, rows, seen)
  }
  return rows.filter((row) => save.workers.some((worker) => worker.id === row.workerId))
}
