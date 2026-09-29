import type { FoodItemId } from '../sim/tables'

/** 营地伙食五种。16×16 单色，和药剂图标同一套。 */
export const FOOD_ICON_PATHS: Record<FoodItemId, readonly string[]> = {
  meal: [
    'M1.6 8.2H14.4V9.5H1.6Z',
    'M3.2 9.3H12.8V12.4H3.2Z',
    'M5.4 12.2H10.6V13.8H5.4Z',
    'M7.1 3.4H8.9V7.6H7.1Z',
    'M6.2 2.6H9.8V4H6.2Z',
  ],
  roast: [
    'M5.2 4.2H12.2V9.8H5.2Z',
    'M2.6 7.2H5.4V12.6H2.6Z',
    'M2.2 6.2H6.2V7.6H2.2Z',
    'M2.2 11.8H6.2V13.2H2.2Z',
  ],
  stew: [
    'M2.2 6.2H13.8V7.6H2.2Z',
    'M3.2 7.4H12.8V12.2H3.2Z',
    'M6.2 12H9.8V14.2H6.2Z',
    'M4.6 4.2H11.4V5.4H4.6Z',
    'M5.4 2.4H7V6.2H5.4Z',
    'M9 2.4H10.6V6.2H9Z',
  ],
  boneSoup: [
    'M2.4 8.4H13.6V9.6H2.4Z',
    'M3.2 9.4H12.8V13.4H3.2Z',
    'M4.2 3.2H6.6V4.8H9.4V3.2H11.8V6.8H9.4V5H6.6V6.8H4.2Z',
  ],
  hunterSkewer: [
    'M1.4 12.6L12.2 1.8L14.2 3.8L3.4 14.6Z',
    'M4.2 8.8H6.6V11.2H4.2Z',
    'M7.2 5.8H9.6V8.2H7.2Z',
    'M10.2 2.8H12.6V5.2H10.2Z',
  ],
}

export function foodIconPaths(id: FoodItemId): readonly string[] {
  return FOOD_ICON_PATHS[id]
}
