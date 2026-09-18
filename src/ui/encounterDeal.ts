import { formatMarchClock, needEntries, pawnRewardGold } from '../sim/encounters'
import { ITEM_DEF } from '../sim/tables'
import type { Encounter, EncounterNeedMap, ItemId } from '../sim/types'

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

export function encounterDeal(enc: Encounter): EncounterDeal {
  switch (enc.kind) {
    case 'enemy':
      return {
        consume: tokensFromNeedMap(enc.needs),
        gain: [{ kind: 'gold', qty: enc.lootGold, note: '战斗后领' }],
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
        gain: [{ kind: 'gold', qty: pawnRewardGold(enc) }],
      }
    case 'artisan':
      return {
        consume: tokensFromNeedMap(enc.wants),
        gain: [{ kind: 'buff', mul: enc.buffMul, durationS: enc.buffDurationS }],
      }
    case 'bulkBuy':
      return {
        consume: tokensFromNeedMap(enc.wants),
        gain: [{ kind: 'gold', qty: enc.rewardGold }],
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

export function formatEncounterDealLines(
  enc: Encounter,
  owned: Partial<Record<ItemId, number>> = {},
): { consume: string; gain: string } {
  const deal = encounterDeal(enc)
  return {
    consume: deal.consume.length
      ? `消耗：${deal.consume
          .map((token) => formatConsumeToken(token, token.kind === 'item' ? (owned[token.itemId] ?? 0) : 0))
          .join('、')}`
      : '',
    gain: deal.gain.length ? `获得：${formatDealTokens(deal.gain)}` : '',
  }
}
