/** 操作钮单色图标：16×16 填色 path，与工坊六站、底栏同一套。孔洞用 evenodd。 */
export const ACT_ICON_IDS = [
  'scout',
  'raid',
  'dig',
  'refresh',
  'search',
  'chest',
  'reinforce',
  'coin',
  'swap',
  'crate',
  'tag',
  'check',
  'leave',
  'shield',
  'cower',
  'invite',
  'close',
] as const

export type ActIconId = (typeof ACT_ICON_IDS)[number]

export const ACT_ICON_PATHS: Record<ActIconId, readonly string[]> = {
  scout: [
    'M1.1 8C3.4 4.35 5.55 3.15 8 3.15C10.45 3.15 12.6 4.35 14.9 8C12.6 11.65 10.45 12.85 8 12.85C5.55 12.85 3.4 11.65 1.1 8Z'
      + 'M8 6.05A1.95 1.95 0 1 0 8.01 6.05Z',
    'M8 7.05A0.95 0.95 0 1 0 8.01 7.05Z',
  ],
  raid: [
    'M0.95 3.15L4.55 0.95L6.05 2.55L3.25 4.35Z',
    'M3.85 4.85L5.85 3.15L14.65 13.45L12.65 15.05Z',
    'M1.35 12.55L2.95 14.35L14.55 3.15L12.95 1.35Z',
    'M4.35 10.15L6.45 12.25L5.4 13.3L3.3 11.2Z',
  ],
  dig: [
    'M1.15 6.15C2.55 3.15 4.55 2.35 6.05 3.85L7.35 5.15L5.85 6.45C4.75 5.55 3.65 5.75 2.55 7.05Z',
    'M14.85 6.15C13.45 3.15 11.45 2.35 9.95 3.85L8.65 5.15L10.15 6.45C11.25 5.55 12.35 5.75 13.45 7.05Z',
    'M7.2 6.35H8.8V14.85H7.2Z',
  ],
  refresh: [
    'M2 6.4H8.6L6.8 4.4L8.1 3.1L11.6 6.6L8.1 10.1L6.8 8.8L8.6 6.8H2Z',
    'M14 9.6H7.4L9.2 11.6L7.9 12.9L4.4 9.4L7.9 5.9L9.2 7.2L7.4 9.2H14Z',
  ],
  search: [
    'M6.3 1.8A4.3 4.3 0 1 0 6.31 1.8Z M6.3 3.5A2.6 2.6 0 1 0 6.31 3.5Z',
    'M9.5 9.3L14.5 14.3L13.1 15.5L8.1 10.5Z',
  ],
  chest: [
    'M1.4 6.4H14.6V14.4H1.4Z',
    'M2.2 6.4L3.6 2.4H12.4L13.8 6.4H2.2Z',
    'M6.8 8.6H9.2V11.4H6.8Z',
  ],
  reinforce: [
    'M6.2 1.6H7.8V11.2H6.2Z',
    'M3.8 3.4H10.2V4.8H3.8Z',
    'M5.4 11.2H8.6V13H5.4Z',
    'M5.6 13H8.4L7 15.2Z',
    'M10.4 1.2H14.8V2.6H10.4Z',
    'M11.9 0.2H13.3V3.6H11.9Z',
  ],
  coin: [
    'M8 1.3A6.2 6.2 0 1 0 8.01 1.3Z M8 3.3A4.2 4.2 0 1 0 8.01 3.3Z',
    'M7.15 4.6H8.85V7.1H10.2V8.7H8.85V11.2H7.15V8.7H5.8V7.1H7.15Z',
  ],
  swap: [
    'M1.2 4.6H10.4L8.5 2.7L9.8 1.4L13.8 5.4L9.8 9.4L8.5 8.1L10.4 6.2H1.2Z',
    'M14.8 11.4H5.6L7.5 13.3L6.2 14.6L2.2 10.6L6.2 6.6L7.5 7.9L5.6 9.8H14.8Z',
  ],
  crate: [
    'M1.6 4.4H14.4V14.2H1.6Z',
    'M1.6 4.4H14.4V6.6H1.6Z',
    'M7.2 4.4H8.8V14.2H7.2Z',
  ],
  tag: [
    'M1.5 2.2H8.6L14.4 8.2L8.2 14.6L1.5 8.4Z M4.3 5.1A1.15 1.15 0 1 0 4.31 5.1Z',
  ],
  check: [
    'M2.4 8.1L6.3 12.2L13.8 3.6L12.3 2.3L6.2 9.4L3.7 6.8Z',
  ],
  leave: [
    'M1.4 1.6H8.2V14.4H1.4Z M3 3.2H6.6V12.8H3Z',
    'M8.2 6.4H12.4V4.6L15.4 8L12.4 11.4V9.6H8.2Z',
  ],
  shield: [
    'M8 1.2L13.6 3.2V8.2C13.6 11.4 11.2 13.6 8 14.8C4.8 13.6 2.4 11.4 2.4 8.2V3.2Z'
      + 'M8 3.4L11.4 4.6V8C11.4 10.2 9.8 11.8 8 12.6C6.2 11.8 4.6 10.2 4.6 8V4.6Z',
  ],
  cower: [
    'M6.3 1.5A1.55 1.55 0 1 0 6.31 1.5Z',
    'M2.1 6.1H9.8L7.6 9.6H3.4Z',
    'M3.1 9.6H11.4V11.5H3.1Z',
    'M4.1 11.5H10.2V14.2H4.1Z',
  ],
  invite: [
    'M4.6 1.6A1.7 1.7 0 1 0 4.61 1.6Z',
    'M2.2 5.6H7.2V7.4H6.6V13.8H2.8V7.4H2.2Z',
    'M9.6 6.2H14.4V7.6H9.6Z',
    'M11.2 4.6H12.6V9.2H11.2Z',
  ],
  close: [
    'M2.4 3.6L7.2 8.4L2.4 13.2L3.8 14.6L8.6 9.8L13.4 14.6L14.8 13.2L10 8.4L14.8 3.6L13.4 2.2L8.6 7L3.8 2.2Z',
  ],
}

export function actIconPaths(id: ActIconId): readonly string[] {
  return ACT_ICON_PATHS[id]
}

export function allActIconsReady(): boolean {
  const seen = new Set<string>()
  for (const id of ACT_ICON_IDS) {
    const paths = ACT_ICON_PATHS[id]
    if (!paths?.some((d) => d.length > 0)) return false
    const sig = paths.join('\n')
    if (seen.has(sig)) return false
    seen.add(sig)
  }
  return seen.size === ACT_ICON_IDS.length
}
