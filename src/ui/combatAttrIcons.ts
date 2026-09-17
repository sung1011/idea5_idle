import { COMBAT_ATTR_IDS } from '../sim/combatAttrs'
import type { CombatAttrId } from '../sim/types'

/** 16×16 单色 path，UI 用 currentColor 填。 */
export const COMBAT_ATTR_ICON_PATHS: Record<CombatAttrId, readonly string[]> = {
  sword: [
    'M8 1.2 10.4 7.7H9.05V8.55H11.35V9.95H9.05V14.8H6.95V9.95H4.65V8.55H6.95V7.7H5.6Z',
  ],
  polearm: ['M8 1.05 10.35 3.7 8.7 4.25V14.8H7.3V4.25L5.65 3.7Z'],
  dagger: [
    'M2.6 1.9 4.8 1.1 6.2 2.9 5.4 3.6 12.9 12.4 11.2 14.0 3.8 5.1 2.9 5.9Z',
  ],
  axe: [
    'M2.2 3.2 7.8 2.4 8.4 5.2 12.6 6.4 13.2 8.8 8.6 9.6 7.5 13.8 2.0 12.6 3.4 8.2 1.8 5.6Z',
  ],
  bow: [
    'M3.15 2.15C9.5 3.35 13.35 6 13.8 8 13.35 10 9.5 12.65 3.15 13.85V12.15C8.55 11.15 11.5 9.15 11.9 8 11.5 6.85 8.55 4.85 3.15 3.85Z',
    'M2.85 2.55H4.15V13.45H2.85Z',
  ],
  staff: [
    'M8 1.35A2.25 2.25 0 1 1 8 5.85 2.25 2.25 0 1 1 8 1.35M7.3 5.95V14.75H8.7V5.95Z',
  ],
  fire: [
    'M8 1.45C6.15 4.35 4.55 5.95 4.55 8.85A3.45 3.45 0 0 0 11.45 8.85C11.45 5.95 9.85 4.35 8 1.45Z',
  ],
  ice: ['M8 1.25 13.45 4.45V11.55L8 14.75 2.55 11.55V4.45Z'],
  lightning: ['M9.85 1.15 4.35 8.35H7.45L5.35 14.85 12.35 7.15H8.85Z'],
  wind: [
    'M1.7 3.45C4.75 2.05 9 2.2 12.35 4.1L11.3 5.55C8.45 4.05 5.1 3.9 2.7 5Z',
    'M1.7 6.95C5.15 5.35 9.7 5.5 13.75 7.55L12.7 9C9.2 7.3 5.5 7.15 2.75 8.45Z',
    'M1.7 10.45C4.75 9.05 9.05 9.2 12.4 11.1L11.35 12.55C8.5 11.05 5.15 10.9 2.7 12Z',
  ],
  light: [
    'M8 5A3 3 0 1 1 8 11 3 3 0 1 1 8 5M7.35 1.1H8.65V3.2H7.35ZM7.35 12.8H8.65V14.9H7.35ZM1.1 7.35H3.2V8.65H1.1ZM12.8 7.35H14.9V8.65H12.8Z',
  ],
  dark: [
    'M11.2 2.1A6.1 6.1 0 1 0 11.2 13.9 3.35 3.35 0 0 1 11.2 2.1Z',
  ],
}

export function combatAttrIconPaths(id: CombatAttrId): readonly string[] {
  return COMBAT_ATTR_ICON_PATHS[id]
}

export function hasCombatAttrIcon(id: CombatAttrId): boolean {
  return COMBAT_ATTR_ICON_PATHS[id].some((d) => d.length > 0)
}

export function allCombatAttrIconsReady(): boolean {
  return COMBAT_ATTR_IDS.every(hasCombatAttrIcon)
}
