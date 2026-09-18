import {
  artisanBlockReason,
  barterBlockReason,
  bulkBuyBlockReason,
  buyMerchantBlockReason,
  combatSupplyBlockReason,
  formatMarchClock,
  needEntries,
  pawnBlockReason,
  bulkRewardGold,
  combatSupplyNeeds,
  enemyLootPayout,
  pawnRewardGold,
} from '../sim/encounters'
import { ITEM_DEF } from '../sim/tables'
import type { Encounter, EncounterNeedMap, ItemId, Save } from '../sim/types'

/** 消耗不足时主按钮点击漂字。与具体缺哪样无关。 */
export const CONSUME_SHORT_TIP = '物资不足'

export type DealToken =
  | { kind: 'item'; itemId: ItemId; qty: number }
  | { kind: 'gold'; qty: number; note?: string }
  | { kind: 'buff'; mul: number; durationS: number }

export type EncounterDeal = {
  consume: DealToken[]
  gain: DealToken[]
}

function tokensFromNeedMap(map: EncounterNeedMap): DealToken[] {
  return needEntries(map).map(([itemId, qty]) => ({ kind: 'item', itemId, qty }))
}

export function encounterDeal(enc: Encounter, save?: Save): EncounterDeal {
  switch (enc.kind) {
    case 'enemy':
      return {
        consume: tokensFromNeedMap(save ? combatSupplyNeeds(save, enc) : enc.needs),
        gain: [{ kind: 'gold', qty: enemyLootPayout(enc, save), note: '战斗后领' }],
      }
    case 'blackMerchant':
      return {
        consume: [{ kind: 'gold', qty: enc.buyGold }],
        gain: tokensFromNeedMap(enc.buyOffers),
      }
    case 'passerby':
      return {
        consume: tokensFromNeedMap(enc.wants),
        gain: tokensFromNeedMap(enc.offers),
      }
    case 'pawn':
      return {
        consume: tokensFromNeedMap(enc.pawnWants),
        gain: [{ kind: 'gold', qty: pawnRewardGold(enc, save) }],
      }
    case 'artisan':
      return {
        consume: tokensFromNeedMap(enc.wants),
        gain: [{ kind: 'buff', mul: enc.buffMul, durationS: enc.buffDurationS }],
      }
    case 'bulkBuy':
      return {
        consume: tokensFromNeedMap(enc.wants),
        gain: [{ kind: 'gold', qty: bulkRewardGold(enc, save) }],
      }
  }
}

export function formatDealToken(token: DealToken): string {
  if (token.kind === 'item') return `${ITEM_DEF[token.itemId].label}×${token.qty}`
  if (token.kind === 'gold') {
    const gold = `${token.qty} 金`
    return token.note ? `${gold}（${token.note}）` : gold
  }
  const pct = Math.round((token.mul - 1) * 100)
  return `产量 +${pct}% · ${formatMarchClock(token.durationS)}`
}

export function formatDealTokens(tokens: DealToken[]): string {
  if (!tokens.length) return '无'
  return tokens.map(formatDealToken).join('、')
}

/** 消耗行：物品名 ×消耗 / 拥有。金币 / Buff 仍用原格式。 */
export function formatConsumeToken(token: DealToken, have = 0): string {
  if (token.kind === 'item') return `${ITEM_DEF[token.itemId].label} ×${token.qty} / ${have}`
  return formatDealToken(token)
}

export function isConsumeShort(token: DealToken, have: number): boolean {
  return token.kind === 'item' && have < token.qty
}

const CONSUME_SHORT_RE = /^(货不够|金币不够|成品不够)/

/** 已有拦截文案里，只有缺消耗算置灰（战斗中 / 已完成等不算）。 */
export function isConsumeShortageReason(reason: string | null | undefined): boolean {
  return !!reason && CONSUME_SHORT_RE.test(reason)
}

export function encounterActionBlockReason(save: Save, index: number): string | null {
  const enc = save.encounters[index]
  if (!enc) return null
  switch (enc.kind) {
    case 'enemy':
      return combatSupplyBlockReason(save, index)
    case 'blackMerchant':
      return buyMerchantBlockReason(save, index)
    case 'passerby':
      return barterBlockReason(save, index)
    case 'pawn':
      return pawnBlockReason(save, index)
    case 'artisan':
      return artisanBlockReason(save, index)
    case 'bulkBuy':
      return bulkBuyBlockReason(save, index)
  }
}

/** 开战 / 交付 / 交易等主操作因消耗不足不能执行。 */
export function isEncounterActionConsumeShort(save: Save, index: number): boolean {
  return isConsumeShortageReason(encounterActionBlockReason(save, index))
}

export function formatEncounterDealLines(
  enc: Encounter,
  owned: Partial<Record<ItemId, number>> = {},
  save?: Save,
): { consume: string; gain: string } {
  const deal = encounterDeal(enc, save)
  return {
    consume: deal.consume.length
      ? `消耗：${deal.consume
          .map((token) => formatConsumeToken(token, token.kind === 'item' ? (owned[token.itemId] ?? 0) : 0))
          .join('、')}`
      : '',
    gain: deal.gain.length ? `获得：${formatDealTokens(deal.gain)}` : '',
  }
}
