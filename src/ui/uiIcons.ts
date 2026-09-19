/** 底栏页签 + 工坊竖签：16×16 单色 path，与战斗属性图标同语言（currentColor）。 */
export const DOCK_ICON_IDS = ['encounters', 'workshop', 'workers', 'tech'] as const
export const STATION_ICON_IDS = [
  'mining',
  'forging',
  'hunting',
  'cooking',
  'herbalism',
  'alchemy',
  'fishing',
] as const

export type DockIconId = (typeof DOCK_ICON_IDS)[number]
export type StationIconId = (typeof STATION_ICON_IDS)[number]
export type UiIconId = DockIconId | StationIconId

export const UI_ICON_PATHS: Record<UiIconId, readonly string[]> = {
  workshop: ['M1.7 7.7 8 2.15 14.3 7.7V13.85H9.35V9.55H6.65V13.85H1.7Z'],
  workers: [
    'M8 1.55A2.4 2.4 0 1 1 8 6.35 2.4 2.4 0 1 1 8 1.55',
    'M3.15 14.55C3.45 10.95 5.35 9.05 8 9.05s4.55 1.9 4.85 5.5Z',
  ],
  encounters: ['M8 1.4 9.2 6.8 14.6 8 9.2 9.2 8 14.6 6.8 9.2 1.4 8 6.8 6.8Z'],
  tech: ['M8 1.15 13.75 4.4V11.6L8 14.85 2.25 11.6V4.4Z'],
  mining: [
    'M2.1 13.2 8.65 6.65 10.35 8.35 3.8 14.9Z',
    'M6.7 5.55 11.35 1.7 14.95 4.15 12.7 7.65 10.3 6.4 8.35 7.55Z',
  ],
  forging: [
    'M2.15 13.15 8.55 6.75 10.2 8.4 3.8 14.8Z',
    'M8.15 4.05 13.75 2.25 14.95 6.55 11.5 8.15 9.55 6.15Z',
  ],
  hunting: [
    'M2.7 1.75C9.35 3.05 13.35 5.9 13.85 8 13.35 10.1 9.35 12.95 2.7 14.25V12.35C8.25 11.25 11.3 9.15 11.7 8 11.3 6.85 8.25 4.75 2.7 3.65Z',
    'M2.4 2.15H3.85V13.85H2.4Z',
  ],
  cooking: [
    'M2.55 6.55H13.45V7.85H2.55Z',
    'M3.2 7.7H12.8V11.35A3.35 3.35 0 0 1 3.2 11.35Z',
    'M7.15 2.45H8.85V6.55H7.15Z',
    'M1.55 7.15H2.85V8.85H1.55ZM13.15 7.15H14.45V8.85H13.15Z',
  ],
  herbalism: [
    'M7.3 14.7V7.7H8.7V14.7Z',
    'M8 7.7C4.75 7.7 3.2 4.95 4.25 2.65 7.15 3.55 8 5.75 8 7.7Z',
    'M8 7.7C11.25 7.7 12.8 4.95 11.75 2.65 8.85 3.55 8 5.75 8 7.7Z',
  ],
  alchemy: [
    'M6.15 1.65H9.85V4.55L13.05 12.15A2.85 2.85 0 0 1 2.95 12.15L6.15 4.55Z',
    'M5.2 1.65H10.8V3H5.2Z',
  ],
  fishing: [
    'M1.75 8C4.55 4.7 10.05 4.5 13.15 8 10.05 11.5 4.55 11.3 1.75 8Z',
    'M13.15 8 15.15 5.35V10.65Z',
    'M4.55 7.15H5.75V8.35H4.55Z',
  ],
}

export function uiIconPaths(id: UiIconId): readonly string[] {
  return UI_ICON_PATHS[id]
}

export function hasUiIcon(id: string): id is UiIconId {
  return Object.prototype.hasOwnProperty.call(UI_ICON_PATHS, id)
}

export function allUiIconsReady(): boolean {
  return [...DOCK_ICON_IDS, ...STATION_ICON_IDS].every(
    (id) => UI_ICON_PATHS[id].some((d) => d.length > 0),
  )
}
