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

/** 顶栏 8 个骑士风头像。全是内置 path，不走外链。 */
export const PLAYER_AVATAR_FACES: Record<PlayerAvatarId, PlayerAvatarFace> = {
  helm: {
    id: 'helm',
    label: '盔',
    tone: '#8a5a2b',
    paths: [
      'M12 3.2c-2.8 0-4.8 2-4.8 4.8V12h9.6V8c0-2.8-2-4.8-4.8-4.8z',
      'M4.2 12h15.6v2.6H4.2z',
      'M8.2 14.6h7.6v2.8c0 1.6-1.6 2.8-3.8 2.8s-3.8-1.2-3.8-2.8v-2.8z',
    ],
    marks: ['M8.4 9.2h7.2v1.6H8.4z'],
  },
  crest: {
    id: 'crest',
    label: '纹章',
    tone: '#3a7ad9',
    paths: ['M12 3.2 19 6.4v6.2c0 4.2-7 8.2-7 8.2s-7-4-7-8.2V6.4z'],
    marks: ['M11 8h2v8h-2z', 'M8.2 10.8h7.6v2H8.2z'],
  },
  lion: {
    id: 'lion',
    label: '狮',
    tone: '#c45a1a',
    paths: [
      'M12 6.2a4.6 4.6 0 1 0 .1 0z',
      'M6.4 8.4 8.8 4.4 9.8 7.6z',
      'M14.2 7.6 15.2 4.4 17.6 8.4z',
      'M7.2 15.6c.6-1.8 2.4-2.8 4.8-2.8s4.2 1 4.8 2.8z',
    ],
    marks: ['M10 9.4h1.3v1.3H10z', 'M12.7 9.4H14v1.3h-1.3z'],
  },
  rose: {
    id: 'rose',
    label: '玫瑰',
    tone: '#b04060',
    paths: [
      'M12 8.2a2.1 2.1 0 1 0 .1 0z',
      'M12 3.4a2.2 2.2 0 1 0 .1 0z',
      'M16.6 6.2a2.2 2.2 0 1 0 .1 0z',
      'M16.2 11.4a2.2 2.2 0 1 0 .1 0z',
      'M7.8 11.4a2.2 2.2 0 1 0 .1 0z',
      'M7.4 6.2a2.2 2.2 0 1 0 .1 0z',
      'M11.2 14.2h1.6V21h-1.6z',
    ],
    marks: [],
  },
  sun: {
    id: 'sun',
    label: '日轮',
    tone: '#d4a017',
    paths: [
      'M12 8.6a3.4 3.4 0 1 0 .1 0z',
      'M11.1 2.2h1.8v3.4h-1.8z',
      'M11.1 18.4h1.8V21.8h-1.8z',
      'M2.2 11.1h3.4v1.8H2.2z',
      'M18.4 11.1h3.4v1.8h-3.4z',
      'M5.1 4.4 6.4 5.7 4.2 7.9 2.9 6.6z',
      'M17.6 5.7 18.9 4.4 21.1 6.6 19.8 7.9z',
      'M4.2 16.1 6.4 18.3 5.1 19.6 2.9 17.4z',
      'M19.8 16.1 21.1 17.4 18.9 19.6 17.6 18.3z',
    ],
    marks: [],
  },
  shield: {
    id: 'shield',
    label: '盾',
    tone: '#2e7a4a',
    paths: ['M12 2.6 20.2 6.2v6.4L12 21.4 3.8 12.6V6.2z'],
    marks: ['M12 6.4 15.2 8.2v3.2L12 13.4 8.8 11.4V8.2z'],
  },
  crown: {
    id: 'crown',
    label: '冠',
    tone: '#8a4ecf',
    paths: ['M4 16.4h16v2.4H4z', 'M4.4 16 7.4 6.6 9.8 12.2 12 4.8 14.2 12.2 16.6 6.6 19.6 16z'],
    marks: ['M7.2 8.2a1.1 1.1 0 1 0 .1 0z', 'M12 6.6a1.1 1.1 0 1 0 .1 0z', 'M16.6 8.2a1.1 1.1 0 1 0 .1 0z'],
  },
  lance: {
    id: 'lance',
    label: '骑枪',
    tone: '#5a3a1a',
    paths: ['M12 2.2 15.4 7.4h-6.8z', 'M11 7.2h2v12.2h-2z', 'M7.6 17.2h8.8v2.4H7.6z'],
    marks: [],
  },
}

export function playerAvatarFace(id: PlayerAvatarId): PlayerAvatarFace {
  return PLAYER_AVATAR_FACES[id]
}

export function playerAvatarList(): PlayerAvatarFace[] {
  return PLAYER_AVATAR_IDS.map((id) => PLAYER_AVATAR_FACES[id])
}
