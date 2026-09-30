import type { MainlineTabId } from './mainlineTabs'

/** 探路圈选：工坊等页先圈底栏，进了 PVE 但还没到悬赏就圈分页，悬赏页才圈探索按钮。 */
export type GuideExploreCue = 'dock' | 'board' | 'explore'

export function guideExploreCue(
  flashingExplore: boolean,
  onEncounters: boolean,
  mainline: MainlineTabId,
): GuideExploreCue | null {
  if (!flashingExplore) return null
  if (!onEncounters) return 'dock'
  if (mainline !== 'battlefield') return 'board'
  return 'explore'
}
