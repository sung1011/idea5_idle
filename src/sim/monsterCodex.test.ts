import { afterEach, describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { claimLoot, enemyLootGoldFor, enemyLootReward } from './encounters'
import { isChapterBoss } from './mainChapter'
import {
  HOW_BOSS,
  HOW_BOUNTY,
  HOW_COPPER,
  HOW_DUNGEON,
  HOW_MARKET,
  MONSTER_EARLY_DROP_CHANCE,
  MONSTER_FIRST_LIGHT_DIAMONDS,
  MONSTER_MID_DROP_CHANCE,
  MONSTER_PROGRESS,
  MONSTER_SHARD_EXCHANGE_COST,
  MONSTER_SIGN_DROP_CHANCE,
  MONSTER_SPECIES,
  MONSTER_TITLE_MASTER,
  MONSTER_TITLE_WIDE,
  claimMonsterProgress,
  exchangeMonsterShard,
  hydrateMonsterCodex,
  isMonsterLit,
  litMonsterCount,
  monsterShardQty,
  monsterUnlockHint,
  settleMonsterSubmit,
  speciesIdOfEncounter,
  syncMonsterCodex,
} from './monsterCodex'
import { setRollOverride } from './rng'
import { hydrateLoadedSave } from '../ui/saveGame'
import type { EnemyEncounter, PawnEncounter, Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

function wonEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'wolfScout-green-9-0',
    label: '联盟斥候',
    quality: 'green',
    needs: { herb: 2 },
    lootGold: 6,
    lootDiamonds: 0,
    departed: true,
    combat: {
      startedAt: 0,
      timeoutAt: 120_000,
      workerIds: [],
      workers: [],
      enemy: { id: 'enemy', label: '联盟斥候', hp: 0, hpMax: 18, atk: 3, spd: 5, nextActAt: 5_000 },
      logs: [],
      outcome: 'win',
    },
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire'],
    revealedWeaknesses: ['fire'],
    ...overrides,
  }
}

function pawn(id: string, label: string): PawnEncounter {
  return {
    kind: 'pawn',
    id,
    label,
    quality: 'green',
    pawnWants: { ore: 1 },
    rewardGold: 4,
    completed: true,
  }
}

describe('monster species binding', () => {
  it('binds battlefield, market and dungeon encounter tables', () => {
    expect(MONSTER_SPECIES).toHaveLength(33)
    expect(speciesIdOfEncounter(wonEnemy())).toBe('wolfScout')
    expect(speciesIdOfEncounter(wonEnemy({ id: 'guideMinion-green-0-0', label: '联盟斥候' }))).toBe('wolfScout')
    expect(speciesIdOfEncounter(wonEnemy({ id: 'guideHerbMinion-green-0-1', label: '人类步兵' }))).toBe('banditCamp')
    expect(
      speciesIdOfEncounter(wonEnemy({ id: 'wildBoar-orange-1-0', label: '联盟指挥官', chapterBoss: true })),
    ).toBe('chapterBoss')
    expect(isChapterBoss(wonEnemy({ chapterBoss: true }))).toBe(true)
    expect(speciesIdOfEncounter(pawn('merchantPawnCopper-green-0-0', '地精铜矿当'))).toBe('merchantPawnCopper')
    expect(speciesIdOfEncounter(pawn('merchantPawn-green-1-0', '地精工具当'))).toBe('merchantPawn')
    expect(speciesIdOfEncounter(wonEnemy({ id: 'dungeonJailer', label: '联盟典狱官', dungeon: true }))).toBe(
      'dungeonJailer',
    )
    expect(speciesIdOfEncounter(wonEnemy({ id: 'dungeonBroker', label: '联盟军需官', dungeon: true }))).toBe(
      'dungeonBroker',
    )
    expect(MONSTER_SPECIES.filter((row) => row.band === 'early')).toHaveLength(16)
    expect(MONSTER_SPECIES.filter((row) => row.band === 'mid')).toHaveLength(14)
    expect(MONSTER_SPECIES.filter((row) => row.band === 'signature')).toHaveLength(3)
    expect(MONSTER_PROGRESS[2]?.need).toBe(MONSTER_SPECIES.length)
  })

  it('writes oral unlock conditions that match how each species is lit', () => {
    expect(monsterUnlockHint('wolfScout')).toBe(HOW_BOUNTY)
    expect(monsterUnlockHint('merchantBuy')).toBe(HOW_MARKET)
    expect(monsterUnlockHint('merchantPawnCopper')).toBe(HOW_COPPER)
    expect(monsterUnlockHint('chapterBoss')).toBe(HOW_BOSS)
    expect(monsterUnlockHint('dungeonJailer')).toBe(HOW_DUNGEON)
    expect(monsterUnlockHint('dungeonBroker')).toBe(HOW_DUNGEON)
    expect(MONSTER_SPECIES.filter((row) => row.how === HOW_BOUNTY)).toHaveLength(5)
    expect(MONSTER_SPECIES.filter((row) => row.how === HOW_MARKET)).toHaveLength(24)
    expect(MONSTER_SPECIES.every((row) => row.how.length > 0)).toBe(true)
    const hows = MONSTER_SPECIES.map((row) => row.how).join('')
    expect(hows).not.toContain('刷出')
    expect(hows).not.toContain('第 0 格')
    expect(HOW_BOUNTY).toContain('悬赏')
    expect(HOW_MARKET).toContain('集市')
    expect(HOW_COPPER).toContain('采矿')
    expect(HOW_BOSS).toContain('10 单')
    expect(HOW_DUNGEON).toContain('地牢')
  })
})

describe('monster light and first reward', () => {
  it('lights seen species without first-light diamonds on a new save', () => {
    const save = createSave()
    expect(isMonsterLit(save, 'wolfScout')).toBe(true)
    expect(isMonsterLit(save, 'banditCamp')).toBe(true)
    expect(save.monsterCodex.firstLightGranted).toEqual([])
    expect(save.diamonds).toBe(0)
  })

  it('grants diamonds once when a new species is first lit during play', () => {
    const save = createSave()
    const before = save.diamonds
    const enc = wonEnemy({ id: 'wildBoar-green-3-1', label: '矮人火枪手' })
    expect(isMonsterLit(save, 'wildBoar')).toBe(false)
    const notes = settleMonsterSubmit(save, enc)
    expect(notes.firstLight).toContain('矮人火枪手')
    expect(isMonsterLit(save, 'wildBoar')).toBe(true)
    expect(save.monsterCodex.submittedIds).toContain('wildBoar')
    expect(save.diamonds).toBe(before + MONSTER_FIRST_LIGHT_DIAMONDS)
    const again = settleMonsterSubmit(save, enc)
    expect(again.firstLight).toBeNull()
    expect(save.diamonds).toBe(before + MONSTER_FIRST_LIGHT_DIAMONDS)
  })
})

describe('monster progress rewards', () => {
  it('lets the player claim each tier once after lighting enough species', () => {
    const save = createSave()
    save.monsterCodex.seenIds = MONSTER_SPECIES.slice(0, 5).map((row) => row.id)
    expect(litMonsterCount(save)).toBe(5)
    const first = claimMonsterProgress(save, 't5')
    expect(first.ok).toBe(true)
    expect(save.diamonds).toBe(8)
    expect(save.monsterCodex.titles).toContain(MONSTER_TITLE_WIDE)
    expect(claimMonsterProgress(save, 't5').ok).toBe(false)
    save.monsterCodex.seenIds = MONSTER_SPECIES.slice(0, 10).map((row) => row.id)
    expect(claimMonsterProgress(save, 't10').ok).toBe(true)
    expect(save.diamonds).toBe(23)
    save.monsterCodex.seenIds = MONSTER_SPECIES.map((row) => row.id)
    expect(claimMonsterProgress(save, 'all').ok).toBe(true)
    expect(save.diamonds).toBe(53)
    expect(save.monsterCodex.titles).toContain(MONSTER_TITLE_MASTER)
    expect(claimMonsterProgress(save, 'all').ok).toBe(false)
  })
})

describe('monster exclusive drops', () => {
  it('drops shards beside gold and does not rewrite the gold or diamond formula', () => {
    setRollOverride(() => 0)
    const save = createSave()
    save.monsterCodex.seenIds = [...new Set([...save.monsterCodex.seenIds, 'wildBoar'])]
    save.monsterCodex.submittedIds = []
    const enc = wonEnemy({ id: 'wildBoar-green-3-1', label: '矮人火枪手', lootGold: 14, lootDiamonds: 0 })
    const payout = enemyLootReward(enc, save)
    expect(payout).toEqual({ gold: 14, diamonds: 0 })
    expect(enemyLootGoldFor(false, 1)).toBe(6)
    expect(MONSTER_EARLY_DROP_CHANCE).toBe(0.08)
    expect(MONSTER_MID_DROP_CHANCE).toBe(0.05)
    expect(MONSTER_SIGN_DROP_CHANCE).toBe(0.03)
    const gold = save.gold
    const diamonds = save.diamonds
    enc.lootClaimed = false
    save.encounters[0] = enc
    const result = claimLoot(save, 0)
    expect(result.ok).toBe(true)
    expect(save.gold).toBe(gold + 14)
    expect(save.diamonds).toBe(diamonds)
    expect(enc.lootGold).toBe(14)
    expect(enc.lootDiamonds ?? 0).toBe(0)
    expect(monsterShardQty(save, 'fang')).toBe(1)
    if (result.ok) {
      expect(result.message).toContain('金币 +14')
      expect(result.message).toContain('牙饰碎片')
    }
  })

  it('guarantees one signature drop the first time that species is submitted', () => {
    setRollOverride(() => 0.99)
    const save = createSave()
    const enc = wonEnemy({
      id: 'hillBrigand-orange-8-0',
      label: '联盟指挥官',
      chapterBoss: true,
      enemyRank: 'boss',
      lootGold: 0,
      lootDiamonds: 5,
    })
    const notes = settleMonsterSubmit(save, enc)
    expect(notes.drop).toMatch(/外观碎片|头像框/)
    expect(save.monsterCodex.signatureDropDone).toContain('chapterBoss')
    const later = settleMonsterSubmit(save, enc)
    expect(later.drop).toBeNull()
  })
})

describe('monster shard exchange', () => {
  it('exchanges ten shards for a small cosmetic once', () => {
    const save = createSave()
    save.monsterCodex.fangShard = MONSTER_SHARD_EXCHANGE_COST
    const first = exchangeMonsterShard(save, 'fangCampFlag')
    expect(first.ok).toBe(true)
    expect(save.monsterCodex.fangShard).toBe(0)
    expect(save.monsterCodex.cosmetics).toContain('fangCampFlag')
    expect(exchangeMonsterShard(save, 'fangCampFlag').ok).toBe(false)
    save.monsterCodex.hideCloth = 3
    expect(exchangeMonsterShard(save, 'beastCampCurtain').ok).toBe(false)
    expect(save.monsterCodex.hideCloth).toBe(3)
  })
})

describe('monster old save hydrate', () => {
  it('lights submitted species without backfilling first-light diamonds', () => {
    const raw = createSave()
    raw.mainChapter = 3
    raw.starterCopperPawnDone = true
    raw.diamonds = 11
    raw.encounters = [
      wonEnemy({
        id: 'riverRaider-green-2-0',
        label: '精灵哨兵',
        lootClaimed: true,
      }),
    ]
    raw.marketEncounters = [pawn('merchantPawnMeal-green-1-0', '地精干粮当')]
    delete (raw as { monsterCodex?: unknown }).monsterCodex
    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(raw)) as Save)
    expect(loaded).toBeTruthy()
    expect(loaded?.diamonds).toBe(11)
    expect(isMonsterLit(loaded!, 'chapterBoss')).toBe(true)
    expect(isMonsterLit(loaded!, 'merchantPawnCopper')).toBe(true)
    expect(isMonsterLit(loaded!, 'riverRaider')).toBe(true)
    expect(isMonsterLit(loaded!, 'merchantPawnMeal')).toBe(true)
    expect(loaded?.monsterCodex.firstLightGranted).toEqual([])
    expect(loaded?.monsterCodex.claimedProgress).toEqual([])
    expect(litMonsterCount(loaded!)).toBeGreaterThanOrEqual(5)
    const before = loaded!.diamonds
    expect(claimMonsterProgress(loaded!, 't5').ok).toBe(true)
    expect(loaded!.diamonds).toBe(before + 8)
    expect(claimMonsterProgress(loaded!, 't5').ok).toBe(false)
    hydrateMonsterCodex(loaded!)
    expect(loaded!.monsterCodex.claimedProgress).toEqual(['t5'])
  })
})

describe('monster board sync', () => {
  it('marks current board encounters as seen', () => {
    const save = createSave()
    save.encounters = [wonEnemy({ id: 'hillBrigand-blue-4-0', label: '圣光牧师', lootClaimed: false })]
    syncMonsterCodex(save, { grantFirstLight: false })
    expect(isMonsterLit(save, 'hillBrigand')).toBe(true)
    expect(save.monsterCodex.submittedIds).not.toContain('hillBrigand')
    expect(save.monsterCodex.firstLightGranted).not.toContain('hillBrigand')
  })
})
