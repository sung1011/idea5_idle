/** 榜单行高，和 `rankBoard.vue` 的 min-height 一致。 */
export const RANK_ROW_MIN_HEIGHT = 36

/** 榜单行距，和 `rankBoard.vue` 的 gap 一致。 */
export const RANK_ROW_GAP = 4

/** 名单视口高度，和 `rankBoard.vue` 的 max-height 一致。 */
export const RANK_LIST_MAX_HEIGHT = 220

/**
 * 自己那一行不在当前可见范围时，榜底要固定一行。
 * selfIndex < 0：不在显示的名单里（例如不在眼前这几名）。
 * 行框与视口没有交集：被滚动出去。擦到视口边缘仍算看得见。
 */
export function rankSelfNeedsPin(input: {
  selfIndex: number
  rowCount: number
  scrollTop: number
  viewHeight: number
  rowHeight?: number
  rowGap?: number
}): boolean {
  if (input.selfIndex < 0) return true
  const rowHeight = input.rowHeight ?? RANK_ROW_MIN_HEIGHT
  const rowGap = input.rowGap ?? RANK_ROW_GAP
  const stride = rowHeight + rowGap
  if (stride <= 0 || input.viewHeight <= 0 || input.rowCount <= 0) return true
  const contentHeight = input.rowCount * rowHeight + (input.rowCount - 1) * rowGap
  const view = Math.min(input.viewHeight, contentHeight)
  if (view <= 0) return true
  const rowTop = input.selfIndex * stride - input.scrollTop
  const rowBottom = rowTop + rowHeight
  return rowBottom <= 0 || rowTop >= view
}
