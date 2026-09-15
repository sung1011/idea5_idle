import type { AlchemyRecipeId, ItemId } from '../../types'

export type AlchemyInput = {
  itemId: ItemId
  qty: number
}

export type AlchemyRecipeDef = {
  id: AlchemyRecipeId
  label: string
  inputs: AlchemyInput[]
  output: { itemId: ItemId; qty: number }
  batchS: number
  needAlchemyLevel: number
  xp: number
}

/** 炼金自己的配方表。批次釜，禁止 goldCost / unlockLevel，也不读 combatLevel。 */
export const ALCHEMY_RECIPE_DEF: Record<AlchemyRecipeId, AlchemyRecipeDef> = {
  brewMinor: {
    id: 'brewMinor',
    label: '初级药水',
    inputs: [{ itemId: 'herb', qty: 2 }],
    output: { itemId: 'minorPotion', qty: 1 },
    batchS: 8,
    needAlchemyLevel: 1,
    xp: 12,
  },
}

export const ALCHEMY_RECIPE_IDS: AlchemyRecipeId[] = ['brewMinor']
