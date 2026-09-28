import {
  PLAYER_AVATAR_IDS,
  type PlayerAvatarId,
} from '../sim/createSave'

export type PlayerAvatarFace = {
  id: PlayerAvatarId
  label: string
  /** 圆底色。 */
  tone: string
  paths: readonly string[]
  /** 叠在主形上的底色镂空。 */
  marks: readonly string[]
}

/**
 * 顶栏 8 个部落风头像。id 沿用旧档：
 * 盔→獠牙、纹章→战斧、狮→狼头、玫瑰→骷髅、日轮→图腾、盾→战鼓、冠→号角、骑枪→火焰。
 */
export const PLAYER_AVATAR_FACES: Record<PlayerAvatarId, PlayerAvatarFace> = {
  helm: {
    id: 'helm',
    label: '獠牙',
    tone: '#c45a1a',
    paths: [
      'M8.6 3.4c.9 0 1.6.7 1.8 1.8.5 2.6.2 7.2-1.4 11.6-.5 1.3-1.8 1.2-2.2.1C5.4 12.6 5.6 7.2 6.8 5.1 7.3 4.1 7.9 3.4 8.6 3.4z',
      'M15.4 3.4c.7 0 1.3.7 1.8 1.7 1.2 2.1 1.4 7.5-.2 11.8-.4 1.1-1.7 1.2-2.2-.1-1.6-4.4-1.9-9-1.4-11.6.2-1.1.9-1.8 1.8-1.8z',
    ],
    marks: [],
  },
  crest: {
    id: 'crest',
    label: '战斧',
    tone: '#8a5a2b',
    paths: [
      'M11.1 7.6h1.8V21.2h-1.8z',
      'M2.4 3.2h11.2L12.2 6.6H5.2L3.6 8.4H2.4z',
      'M13.2 3.6h7.4l-.6 2.2h-5.6z',
      'M5.2 6.6h7L10.4 9.2H6.6z',
    ],
    marks: [],
  },
  lion: {
    id: 'lion',
    label: '狼头',
    tone: '#5c6270',
    paths: [
      'M12 7.4a4.4 4.4 0 1 0 .1 0z',
      'M5.6 9.4 8.2 3.2 10.4 8.4z',
      'M13.6 8.4 15.8 3.2 18.4 9.4z',
      'M8.8 12.2h6.4L13.8 16H10.2z',
    ],
    marks: ['M9.4 9h1.4v1.5H9.4z', 'M13.2 9H14.6v1.5H13.2z'],
  },
  rose: {
    id: 'rose',
    label: '骷髅',
    tone: '#2c2c2c',
    paths: [
      'M12 3.2a5.4 5.4 0 0 0-4.4 8.6c.3.6.4 1.2.4 1.8v2.2h8v-2.2c0-.6.1-1.2.4-1.8A5.4 5.4 0 0 0 12 3.2z',
      'M8.2 16.4h7.6v1.8c0 1.3-1.7 2.4-3.8 2.4s-3.8-1.1-3.8-2.4v-1.8z',
    ],
    marks: ['M9 8.2h2.1v2.4H9z', 'M12.9 8.2H15v2.4h-2.1z', 'M11.1 11.6h1.8v1.7h-1.8z'],
  },
  sun: {
    id: 'sun',
    label: '图腾',
    tone: '#2e7a4a',
    paths: [
      'M10.4 2.2h3.2V21.6h-3.2z',
      'M5.8 4.8h12.4v7.6H5.8z',
      'M3.6 6.2 5.8 4.8v7.6L3.6 11z',
      'M20.4 6.2 18.2 4.8v7.6l2.2-1.4z',
      'M7.2 14.2h9.6v3.2H7.2z',
    ],
    marks: ['M8.2 6.8h2v2h-2z', 'M13.8 6.8h2v2h-2z', 'M9.2 10h5.6v1.3H9.2z'],
  },
  shield: {
    id: 'shield',
    label: '战鼓',
    tone: '#8a3a2a',
    paths: [
      'M4.8 4.6h14.4v2.4H4.8z',
      'M6.2 7h11.6v10H6.2z',
      'M4.8 17h14.4v2.4H4.8z',
    ],
    marks: ['M8.2 9.2h7.6v1.5H8.2z', 'M8.2 12.4h7.6v1.5H8.2z'],
  },
  crown: {
    id: 'crown',
    label: '号角',
    tone: '#d4a017',
    paths: [
      'M3.2 16.6c2.4-1.4 6.6-2.4 10.6-1.2 2.4.6 4.6 2.2 5.4 4.4-2.6.2-5-.8-6.8-1.8-2.8-1.4-5.6-.6-9.2 1.4z',
      'M16.4 7.6c2.6.4 4.4 2.2 4.8 4.6-1.8-.2-3.4-1.2-4.8-2.4-.8-.8-1.4-1.6-1.4-2.6.5.1 1 .3 1.4.4z',
      'M2.6 13.2 5.2 11.8 6.8 17.6 3.6 18.6z',
    ],
    marks: [],
  },
  lance: {
    id: 'lance',
    label: '火焰',
    tone: '#c45a1a',
    paths: [
      'M12 2c.4 2.6-.8 3.8-1.4 5.6-.8 2.2.2 3.4 1.4 4.8 1.4-1.6 2.4-2.8 1.6-5 .6 1.4 1.8 2.4 1.4 4.6.8-1.2 1.8-2.8 1.2-4.8C18.8 10.2 20.2 13.4 20.2 16.4c0 3.4-3.6 5.8-8.2 5.8s-8.2-2.4-8.2-5.8c0-3.4 2.4-6.6 4.6-9 .4 1.8 1.6 3 1.2 4.8.8-1.6 1.8-3.2 1.4-5.6C10.8 5.4 12 3.4 12 2z',
    ],
    marks: [],
  },
}

export function playerAvatarFace(id: PlayerAvatarId): PlayerAvatarFace {
  return PLAYER_AVATAR_FACES[id]
}

export function playerAvatarList(): PlayerAvatarFace[] {
  return PLAYER_AVATAR_IDS.map((id) => PLAYER_AVATAR_FACES[id])
}
