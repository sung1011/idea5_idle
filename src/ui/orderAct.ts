import type { ActIconId } from './actIcons'

export type OrderActKind = 'primary' | 'minor' | 'danger'
export type OrderActTone = 'combat' | 'gain' | 'produce'

/** 战场 / 集市订单上每个操作钮的归类。页签不在此列。 */
export type OrderActSpec = {
  label: string
  kind: OrderActKind
  tone?: OrderActTone
  icon: ActIconId
  place: string
  /** 货币消耗写在按钮右侧。物资清单仍留在卡面。 */
  cost?: boolean
}

function act(spec: OrderActSpec): OrderActSpec {
  return spec
}

export const BATTLEFIELD_ACTS = {
  help: act({ label: '说明', kind: 'minor', icon: 'search', place: '页签行右侧' }),
  explore: act({ label: '探索', kind: 'minor', icon: 'refresh', place: '章节标题旁', cost: true }),
  affix: act({ label: '词缀', kind: 'minor', icon: 'search', place: '卡头标签' }),
  start: act({ label: '开战', kind: 'primary', tone: 'combat', icon: 'raid', place: '卡片底部整行' }),
  reinforce: act({ label: '增援', kind: 'primary', tone: 'combat', icon: 'reinforce', place: '卡片底部整行' }),
  loot: act({ label: '战利品', kind: 'primary', tone: 'gain', icon: 'chest', place: '卡片底部整行' }),
  chest: act({ label: '宝箱', kind: 'primary', tone: 'gain', icon: 'chest', place: '卡片底部整行' }),
  claimed: act({ label: '已领', kind: 'primary', tone: 'gain', icon: 'check', place: '卡片底部整行' }),
}

export const MARKET_ACTS = {
  buy: act({ label: '金币购买', kind: 'primary', tone: 'gain', icon: 'coin', place: '卡片底部整行', cost: true }),
  barter: act({ label: '以物易物', kind: 'primary', tone: 'gain', icon: 'swap', place: '卡片底部整行' }),
  pawn: act({ label: '以物换钱', kind: 'primary', tone: 'gain', icon: 'coin', place: '卡片底部整行' }),
  artisan: act({ label: '交付成品', kind: 'primary', tone: 'gain', icon: 'crate', place: '卡片底部整行' }),
  bulk: act({ label: '高价出售', kind: 'primary', tone: 'gain', icon: 'tag', place: '卡片底部整行' }),
}

export const MARKET_DONE_ACT = {
  deal: act({ label: '成交', kind: 'primary', tone: 'gain', icon: 'check', place: '卡片底部整行' }),
  artisan: act({ label: '完成', kind: 'primary', tone: 'gain', icon: 'check', place: '卡片底部整行' }),
}

const PRIMARY_TONES = new Set<OrderActTone>(['combat', 'gain', 'produce'])

export function orderActsValid(): boolean {
  const rows = [
    ...Object.values(BATTLEFIELD_ACTS),
    ...Object.values(MARKET_ACTS),
    ...Object.values(MARKET_DONE_ACT),
  ]
  return rows.every((row) => {
    if (row.kind === 'primary') return row.tone != null && PRIMARY_TONES.has(row.tone)
    return row.tone == null
  })
}
