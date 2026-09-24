/** 顶栏和夺宝假玩家共用的头像。缺字段或未知 id 回落到盔。 */
export const PLAYER_AVATAR_IDS = ['helm', 'crest', 'lion', 'rose', 'sun', 'shield', 'crown', 'lance'] as const

export type PlayerAvatarId = (typeof PLAYER_AVATAR_IDS)[number]

export const PLAYER_AVATAR_DEFAULT: PlayerAvatarId = 'helm'

const PLAYER_AVATAR_ID_SET = new Set<string>(PLAYER_AVATAR_IDS)

export function playerAvatarId(value: unknown): PlayerAvatarId {
  if (typeof value === 'string' && PLAYER_AVATAR_ID_SET.has(value)) return value as PlayerAvatarId
  return PLAYER_AVATAR_DEFAULT
}
