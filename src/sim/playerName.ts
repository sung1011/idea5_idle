/** 我方玩家显示名。存档缺字段、空串或非字符串时用这个，不覆盖已有自定义名。 */
export const PLAYER_NAME_DEFAULT = '见习酋长'
/** 改名前的默认名。读档时正好等于这个才换成新默认名。 */
export const PLAYER_NAME_LEGACY_DEFAULT = '见习勇者'

export function playerDisplayName(value: unknown): string {
  if (typeof value !== 'string') return PLAYER_NAME_DEFAULT
  const trimmed = value.trim()
  if (!trimmed || trimmed === PLAYER_NAME_LEGACY_DEFAULT) return PLAYER_NAME_DEFAULT
  return trimmed
}
