/** 选人面板里只有悬赏/地牢的「推荐」「强烈推荐」算推荐；「克制」不算。 */
export function isPickRecommendMark(label: string | null | undefined): boolean {
  return label === '推荐' || label === '强烈推荐'
}

/** 有推荐的排在最前，两组内部都保持原顺序。 */
export function orderPickByRecommend<T>(
  workers: readonly T[],
  labelOf: (worker: T) => string | null,
): T[] {
  return workers
    .map((worker, index) => ({
      worker,
      index,
      rank: isPickRecommendMark(labelOf(worker)) ? 0 : 1,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.worker)
}
