/** 顶栏资源数量展示。只服务 UI，不改存档或结算。 */

export function formatHudQty(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs < 1e5) return `${sign}${Math.floor(abs)}`
  if (abs < 1e6) return `${sign}${trimHudDecimal(abs / 1e3)}K`
  if (abs < 1e9) return `${sign}${trimHudDecimal(abs / 1e6)}M`
  return `${sign}${trimHudDecimal(abs / 1e9)}B`
}

function trimHudDecimal(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
}
