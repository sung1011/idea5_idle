import {
  artisanBlockReason,
  barterBlockReason,
  bulkBuyBlockReason,
  buyMerchantBlockReason,
  combatSupplyBlockReason,
  formatMarchClock,
  needEntries,
  pawnBlockReason,
  artisanReward,
  bulkReward,
  combatSupplyNeeds,
  enemyLootReward,
  pawnReward,
} from '../sim/encounters'
import { needHaveQty } from '../sim/costs'
import { scaleNeedMap, timedRewardMul } from '../sim/marketTimed'
import { ITEM_DEF } from '../sim/tables'
import type { CurrencyPayout } from '../sim/currencyReward'
import type { EncounterBoardId } from '../sim/encounters'
import type { Encounter, EncounterNeedMap, ItemId, Save } from '../sim/types'

/** 消耗不足时主按钮点击漂字。与具体缺哪样无关。 */
export const CONSUME_SHORT_TIP = '物资不足'

export type DealToken =
  | { kind: 'item'; itemId: ItemId; qty: number }
  | { kind: 'gold'; qty: number; note?: string }
  | { kind: 'diamonds'; qty: number; note?: string }
  | { kind: 'buff'; mul: number; durationS: number }

export type EncounterDeal = {
  consume: DealToken[]
  gain: DealToken[]
}

function tokensFromNeedMap(map: EncounterNeedMap): DealToken[] {
  return needEntries(map).map(([itemId, qty]) => ({ kind: 'item', itemId, qty }))
}

function currencyToken(payout: CurrencyPayout, note?: string): DealToken | null {
  if (payout.diamonds > 0) return { kind: 'diamonds', qty: payout.diamonds, note }
  if (payout.gold > 0) return { kind: 'gold', qty: payout.gold, note }
  return null
}

export function encounterDeal(enc: Encounter, save?: Save, now = Date.now()): EncounterDeal {
  const rewardMul = timedRewardMul(enc, now)
  switch (enc.kind) {
    case 'enemy': {
      const loot = enemyLootReward(enc, save)
      return {
        consume: tokensFromNeedMap(save ? combatSupplyNeeds(save, enc) : enc.needs),
        gain: [currencyToken(loot, '战斗后领')].filter((token): token is DealToken => token != null),
      }
    }
    case 'blackMerchant':
      return {
        consume: [{ kind: 'gold', qty: enc.buyGold }],
        gain: tokensFromNeedMap(scaleNeedMap(enc.buyOffers, rewardMul)),
      }
    case 'passerby':
      return {
        consume: tokensFromNeedMap(enc.wants),
        gain: tokensFromNeedMap(scaleNeedMap(enc.offers, rewardMul)),
      }
    case 'pawn':
      return {
        consume: tokensFromNeedMap(enc.pawnWants),
        gain: [currencyToken(pawnReward(enc, save, now))].filter((token): token is DealToken => token != null),
      }
    case 'artisan': {
      const money = currencyToken(artisanReward(enc, now))
      return {
        consume: tokensFromNeedMap(enc.wants),
        gain: [
          ...(money ? [money] : []),
          { kind: 'buff', mul: enc.buffMul, durationS: enc.buffDurationS },
        ],
      }
    }
    case 'bulkBuy':
      return {
        consume: tokensFromNeedMap(enc.wants),
        gain: [currencyToken(bulkReward(enc, save, now))].filter((token): token is DealToken => token != null),
      }
  }
}

export function formatDealToken(token: DealToken): string {
  if (token.kind === 'item') return `${ITEM_DEF[token.itemId].label}×${token.qty}`
  if (token.kind === 'gold') {
    const gold = `金币 ×${token.qty}`
    return token.note ? `${gold}（${token.note}）` : gold
  }
  if (token.kind === 'diamonds') {
    const diamonds = `钻石 ×${token.qty}`
    return token.note ? `${diamonds}（${token.note}）` : diamonds
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

export function encounterActionBlockReason(
  save: Save,
  index: number,
  board: EncounterBoardId = 'battlefield',
): string | null {
  const enc = board === 'market' ? save.marketEncounters?.[index] : save.encounters[index]
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
export function isEncounterActionConsumeShort(
  save: Save,
  index: number,
  board: EncounterBoardId = 'battlefield',
): boolean {
  return isConsumeShortageReason(encounterActionBlockReason(save, index, board))
}

export function formatEncounterDealLines(
  enc: Encounter,
  owned: Partial<Record<ItemId, number>> = {},
  save?: Save,
  now = Date.now(),
): { consume: string; gain: string } {
  const deal = encounterDeal(enc, save, now)
  return {
            consume: deal.consume.length
      ? `消耗：${deal.consume
          .map((token) =>
            formatConsumeToken(
              token,
              token.kind === 'item'
                ? save
                  ? needHaveQty(save, token.itemId)
                  : (owned[token.itemId] ?? 0)
                : 0,
            ),
          )
          .join('、')}`
      : '',
    gain: deal.gain.length ? `获得：${formatDealTokens(deal.gain)}` : '',
  }
}
