export const FIGHTING_LABEL = '战斗中'
export const FIGHTING_DOT_MS = 450

export function fightingDots(nowMs: number, stepMs = FIGHTING_DOT_MS): string {
  const t = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : 0
  const step = Math.floor(t / stepMs) % 3
  return '.'.repeat(step + 1)
}

export function fightingButtonLabel(nowMs: number, stepMs = FIGHTING_DOT_MS): string {
  return `${FIGHTING_LABEL}${fightingDots(nowMs, stepMs)}`
}
