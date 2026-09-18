import { CLASS_IDS } from '../sim/tables'
import type { ClassId } from '../sim/types'
import { UI_ICON_PATHS } from './uiIcons'

/** 职业小图标：生活站复用工坊竖签 path，基础职业另画。 */
export const CLASS_ICON_PATHS: Record<ClassId, readonly string[]> = {
  laborer: [
    'M5.15 1.85H10.85V3.55H5.15Z',
    'M3.85 3.4H12.15V4.55H3.85Z',
    'M8 4.35A2.15 2.15 0 1 1 8 8.65 2.15 2.15 0 1 1 8 4.35',
    'M3.2 14.65C3.5 11.15 5.4 9.35 8 9.35s4.5 1.8 4.8 5.3Z',
  ],
  artisan: [
    'M2.35 13.45 7.55 8.25 6.65 7.35 11.95 2.05 13.95 4.05 8.65 9.35 7.75 8.45 2.55 13.65Z',
    'M11.15 1.45 14.55 4.85 13.15 6.25 9.75 2.85Z',
  ],
  wanderer: [
    'M8 1.35A6.65 6.65 0 1 1 8 14.65 6.65 6.65 0 1 1 8 1.35M8 2.85A5.15 5.15 0 1 0 8 13.15 5.15 5.15 0 1 0 8 2.85',
    'M8 3.15 9.85 8 8 7.25 6.15 8Z',
    'M8 12.85 6.15 8 8 8.75 9.85 8Z',
  ],
  miner: UI_ICON_PATHS.mining,
  fisher: UI_ICON_PATHS.fishing,
  hunter: UI_ICON_PATHS.hunting,
  cook: UI_ICON_PATHS.cooking,
  herbalist: UI_ICON_PATHS.herbalism,
  smith: UI_ICON_PATHS.forging,
  alchemist: UI_ICON_PATHS.alchemy,
  steward: [
    'M4.15 2.35H11.85V13.75H4.15Z',
    'M6.05 1.45H9.95V3.25H6.05Z',
    'M5.55 5.35H10.45V6.45H5.55Z',
    'M5.55 7.55H10.45V8.65H5.55Z',
    'M5.55 9.75H9.05V10.85H5.55Z',
  ],
  knight: [
    'M8 1.15 10.25 7.35H8.95V8.25H11.15V9.55H8.95V14.75H7.05V9.55H4.85V8.25H7.05V7.35Z',
    'M3.55 10.15H12.45V13.85L8 15.05 3.55 13.85Z',
  ],
}

export function classIconPaths(id: ClassId): readonly string[] {
  return CLASS_ICON_PATHS[id]
}

export function hasClassIcon(id: ClassId): boolean {
  return CLASS_ICON_PATHS[id].some((d) => d.length > 0)
}

export function allClassIconsReady(): boolean {
  return CLASS_IDS.every(hasClassIcon)
}
