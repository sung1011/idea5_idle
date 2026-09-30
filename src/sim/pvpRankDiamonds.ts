/** 割草、困兽日结钻石。第 1 名 20，2–3 名 12，4–10 名 8，11–50 名 4，榜外 0。 */
export function pvpRankDiamonds(rank: number): number {
  const n = Math.floor(rank)
  if (n === 1) return 20
  if (n >= 2 && n <= 3) return 12
  if (n >= 4 && n <= 10) return 8
  if (n >= 11 && n <= 50) return 4
  return 0
}
