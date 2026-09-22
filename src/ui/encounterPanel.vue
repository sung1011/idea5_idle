<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ENEMY_RANK_LABEL, enemyWeaknessView, fighterRecommendLabel } from '../sim/combatAttrs'
import CombatAttrIcon from './combatAttrIcon.vue'
import CombatAttrRow from './combatAttrRow.vue'
import {
  canReinforceCombat,
  combatPartyCap,
  combatRosterFighters,
  fieldFighterCount,
  isCombatLost,
  isCombatStunned,
  isCombatWon,
  isFighting,
  isFullCombatHp,
  restCombatCandidates,
} from '../sim/combat'
import { createAssistWorker, isAssistWorker, pickCombatCandidates } from '../sim/combatAssist'
import {
  ENCOUNTER_KIND_LABEL,
  QUALITY_LABEL,
  combatSupplyBlockReason,
  encountersOf,
  exploreCost,
  formatMarchClock,
  isEncounterDone,
  isWorkshopBuffActive,
  stampLabel,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import { timedOrderLine } from '../sim/marketTimed'
import {
  DUNGEON_ATTEMPTS_PER_DAY,
  DUNGEON_MECHANIC_LABEL,
  battlefieldAffixRow,
  dungeonAffixRows,
  dungeonAttemptsLeft,
  dungeonEncounterOf,
  dungeonRefreshCountdownLabel,
  dungeonSupplyBlockReason,
  isDungeonEncounter,
  type CombatAffixScope,
  type DungeonAffixId,
} from '../sim/dungeon'
import {
  battlefieldRuneGuideOpenIndex,
  isGuideQuestCombatFlash,
  isGuideQuestFlash,
  isGuideQuestRuneFlash,
} from '../sim/guideQuest'
import { mainChapterTitle, mainLootClaimBarLabel, mainLootClaimFillPct } from '../sim/mainChapter'
import { isRuneItemId, RUNE_DEF } from '../sim/tables'
import { pickWorkerName } from './pickWorkerName'
import {
  availableRuneQty,
  confirmableRunePicks,
  isRuneSlotUnlocked,
  listRunePickOptions,
  runeSlotLockedTip,
  runeSlotTapKind,
} from '../sim/runes'
import type { Encounter, EncounterKind, EnemyEncounter, RuneItemId, Worker } from '../sim/types'
import EncounterDealLines from './encounterDealLines.vue'
import EncounterTips from './encounterTips.vue'
import { encounterHpShakeAt } from './encounterTips'
import { CONSUME_SHORT_TIP, isEncounterActionConsumeShort } from './encounterDeal'
import {
  dungeonAffixHelpCopy,
  isDungeonAffixHelpOpen,
  nextDungeonAffixHelp,
} from './dungeonAffixHelp'
import { pendingGuideRunePick, takeGuideRunePickRequest } from './guideQuestNav'
import { FIGHTING_DOT_MS, fightingButtonLabel } from './fightingLabel'
import { actChargeFill, actChargeStunned } from './actCharge'
import ActChargeBar from './actChargeBar.vue'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import {
  MAINLINE_DENSITY_IDS,
  MAINLINE_DENSITY_LABELS,
  mainlineDensity,
  selectMainlineDensity,
  type MainlineDensityId,
} from './mainlineDensity'
import {
  MAINLINE_TAB_IDS,
  MAINLINE_TAB_LABELS,
  mainlineTab,
  selectMainlineTab,
  type MainlineTabId,
} from './mainlineTabs'
import HpBar from './hpBar.vue'
import {
  qualityOf,
  workerQualityBadgeStyle,
  workerQualityNameStyle,
} from './workerQuality'

const game = useGameStore()
const guideFlashCombat = computed(() => isGuideQuestFlash(game.save, 'combat'))
const guideFlashRune = computed(() => isGuideQuestFlash(game.save, 'rune'))
function guideFlashEnemy(enc: Encounter) {
  return isGuideQuestCombatFlash(game.save, enc) || (guideFlashRune.value && isGuideQuestRuneFlash(game.save, enc))
}
function tryOpenGuideRunePick() {
  if (!guideFlashRune.value || pickOpen.value) return
  if (!takeGuideRunePickRequest()) return
  const index = battlefieldRuneGuideOpenIndex(game.save)
  if (index == null) return
  const enc = game.save.encounters[index]
  if (enc?.kind !== 'enemy') return
  if (isFighting(enc) && canReinforceCombat(enc)) openReinforce(index)
  else openPick(index)
}
const currentTab = computed(() => mainlineTab.value)
const isDungeonTab = computed(() => currentTab.value === 'dungeon')
const currentDensity = computed(() => mainlineDensity.value)
const isBrief = computed(() => currentDensity.value === 'brief')
const boardEncounters = computed(() => {
  if (isDungeonTab.value) return [dungeonEncounterOf(game.save)]
  return encountersOf(game.save, currentTab.value === 'market' ? 'market' : 'battlefield')
})
const dungeonAffixList = computed(() => (isDungeonTab.value ? dungeonAffixRows(game.save) : []))
const dungeonAttemptLabel = computed(() =>
  isDungeonTab.value ? `次数 ${DUNGEON_ATTEMPTS_PER_DAY - dungeonAttemptsLeft(game.save)}/${DUNGEON_ATTEMPTS_PER_DAY}` : '',
)
const affixHelp = ref<DungeonAffixId | null>(null)
const affixHelpScope = ref<CombatAffixScope>('dungeon')
const affixHelpPos = ref({ left: 8, top: 8 })
const affixHelpBubble = computed(() =>
  affixHelp.value ? dungeonAffixHelpCopy(affixHelp.value, affixHelpScope.value) : null,
)

function closeAffixHelp() {
  affixHelp.value = null
}

function onAffixHelp(ev: MouseEvent, id: DungeonAffixId, scope: CombatAffixScope = 'dungeon') {
  ev.stopPropagation()
  const next = nextDungeonAffixHelp(affixHelp.value, id)
  affixHelp.value = next
  affixHelpScope.value = scope
  if (!next) return
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  affixHelpPos.value = {
    left: Math.min(window.innerWidth - 228, Math.max(8, rect.left)),
    top: Math.min(window.innerHeight - 160, rect.bottom + 6),
  }
}

function onDocAffixHelp(ev: PointerEvent) {
  const el = ev.target
  if (!(el instanceof Element)) return
  if (el.closest('[data-dungeon-affix]') || el.closest('[data-dungeon-affix-bubble]')) return
  closeAffixHelp()
}
const cost = computed(() => exploreCost(game.save))
const dungeonRefreshLabel = computed(() => dungeonRefreshCountdownLabel(game.save.elapsedS))
const chapterTitle = computed(() => mainChapterTitle(game.save))
const lootBarLabel = computed(() => mainLootClaimBarLabel(game.save))
const lootBarPct = computed(() => mainLootClaimFillPct(game.save))
const lootBarReady = computed(() => game.save.mainLootClaims >= 10)
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const fightNow = ref(Date.now())
const actNow = ref(Date.now())
let fightDotTimer = 0
let actTimer = 0
onMounted(() => {
  fightNow.value = Date.now()
  actNow.value = Date.now()
  fightDotTimer = window.setInterval(() => {
    fightNow.value = Date.now()
  }, FIGHTING_DOT_MS)
  actTimer = window.setInterval(() => {
    actNow.value = Date.now()
  }, 100)
  document.addEventListener('pointerdown', onDocAffixHelp)
  tryOpenGuideRunePick()
})
onUnmounted(() => {
  window.clearInterval(fightDotTimer)
  window.clearInterval(actTimer)
  document.removeEventListener('pointerdown', onDocAffixHelp)
})
const fightingNowLabel = computed(() => fightingButtonLabel(fightNow.value))
const buffOn = computed(() => isWorkshopBuffActive(game.save, now.value))
const buffLabel = computed(() => {
  if (!buffOn.value) return ''
  const pct = Math.round((workshopBuffMul(game.save, now.value) - 1) * 100)
  return `工匠加持：工坊产量 +${pct}% · 剩余 ${formatMarchClock(workshopBuffRemainS(game.save, now.value))}`
})
const pickIndex = ref<number | null>(null)
const pickMode = ref<'start' | 'reinforce'>('start')
const picked = ref<string[]>([])
const assistWorker = ref<Worker | null>(null)
const pickRunes = ref<Partial<Record<string, RuneItemId>>>({})
const runePickWorkerId = ref<string | null>(null)
const pickOpen = computed(() => pickIndex.value !== null)
const runePickOpen = computed(() => runePickWorkerId.value !== null)
const runeSlotUnlocked = computed(() => isRuneSlotUnlocked(game.save))
const runeOptions = computed(() => listRunePickOptions(game.save))
const pickMax = computed(() => {
  const enc = activeEnemy()
  const cap = combatPartyCap(enc)
  if (pickMode.value === 'reinforce' && enc) return Math.max(0, cap - fieldFighterCount(enc))
  return cap
})
const pickCandidates = computed(() =>
  pickCombatCandidates(restCombatCandidates(game.save), assistWorker.value),
)

function selectTab(id: MainlineTabId) {
  selectMainlineTab(id)
  closePick()
  closeAffixHelp()
}

function onExplore() {
  game.explore()
}

function activeEnemy(): EnemyEncounter | null {
  if (isDungeonTab.value) return dungeonEncounterOf(game.save)
  const i = pickIndex.value
  if (i == null) return null
  const enc = game.save.encounters[i]
  return enc?.kind === 'enemy' ? enc : null
}

function selectDensity(id: MainlineDensityId) {
  selectMainlineDensity(id)
}

function showCardHeader(enc: Encounter) {
  return !isBrief.value || enc.kind === 'enemy'
}

function showCardLabel(enc: Encounter) {
  return !isBrief.value || enc.kind !== 'enemy'
}

function showFightReadout(enc: Encounter) {
  return enc.kind === 'enemy' && (!isBrief.value || isFighting(enc))
}

function consumeShort(index: number) {
  if (isDungeonTab.value) {
    const reason = dungeonSupplyBlockReason(game.save)
    return !!reason && reason.startsWith('货不够')
  }
  return isEncounterActionConsumeShort(game.save, index, currentTab.value === 'market' ? 'market' : 'battlefield')
}

function warnConsumeShort(index: number) {
  if (consumeShort(index)) pushFloatTip(CONSUME_SHORT_TIP, 'err')
}

function openPick(index: number) {
  if (consumeShort(index)) {
    pushFloatTip(CONSUME_SHORT_TIP, 'err')
    return
  }
  const blocked = isDungeonTab.value ? dungeonSupplyBlockReason(game.save) : combatSupplyBlockReason(game.save, index)
  if (blocked) {
    pushFloatTip(blocked, 'err')
    return
  }
  pickMode.value = 'start'
  pickIndex.value = index
  picked.value = []
  assistWorker.value = null
  pickRunes.value = {}
  runePickWorkerId.value = null
}

function openReinforce(index: number) {
  const enc = isDungeonTab.value ? dungeonEncounterOf(game.save) : game.save.encounters[index]
  if (enc?.kind !== 'enemy' || !canReinforceCombat(enc)) return
  pickMode.value = 'reinforce'
  pickIndex.value = index
  picked.value = []
  assistWorker.value = null
  pickRunes.value = {}
  runePickWorkerId.value = null
}

function closePick() {
  pickIndex.value = null
  pickMode.value = 'start'
  picked.value = []
  assistWorker.value = null
  pickRunes.value = {}
  runePickWorkerId.value = null
}

function openRunePick(workerId: string, ev?: Event) {
  ev?.stopPropagation()
  if (!isRuneSlotUnlocked(game.save)) {
    pushFloatTip(runeSlotLockedTip())
    return
  }
  game.clearWorkerNew(workerId)
  runePickWorkerId.value = workerId
  game.markGuideRuneOpened()
}

watch([guideFlashRune, pendingGuideRunePick], () => {
  tryOpenGuideRunePick()
})

function onRuneSlotTap(worker: Worker, ev?: Event) {
  ev?.stopPropagation()
  const kind = runeSlotTapKind(game.save, isFullCombatHp(worker))
  if (kind === 'locked') {
    pushFloatTip(runeSlotLockedTip())
    return
  }
  if (kind === 'open') openRunePick(worker.id, ev)
}

function closeRunePick() {
  runePickWorkerId.value = null
}

function equippedRune(workerId: string): RuneItemId | null {
  const id = pickRunes.value[workerId]
  return isRuneItemId(id) ? id : null
}

function runeSlotLabel(workerId: string): string {
  const id = equippedRune(workerId)
  return id ? RUNE_DEF[id].label : '符文'
}

function pickRune(runeId: RuneItemId | null) {
  const workerId = runePickWorkerId.value
  if (!workerId) return
  if (!runeId) {
    const next = { ...pickRunes.value }
    delete next[workerId]
    pickRunes.value = next
    closeRunePick()
    return
  }
  if (availableRuneQty(game.save, pickRunes.value, runeId, workerId) < 1) {
    pushFloatTip(`${RUNE_DEF[runeId].label}见底`, 'err')
    return
  }
  pickRunes.value = { ...pickRunes.value, [workerId]: runeId }
  closeRunePick()
}

function runePicksForConfirm() {
  return confirmableRunePicks(game.save, pickRunes.value, picked.value)
}

function inviteAssist() {
  assistWorker.value = createAssistWorker(game.save)
}

function togglePick(worker: Worker) {
  if (!isFullCombatHp(worker)) return
  game.clearWorkerNew(worker.id)
  const id = worker.id
  if (picked.value.includes(id)) {
    picked.value = picked.value.filter((x) => x !== id)
    const next = { ...pickRunes.value }
    delete next[id]
    pickRunes.value = next
    return
  }
  if (picked.value.length >= pickMax.value) {
    pushFloatTip(`最多选 ${pickMax.value} 人`, 'err')
    return
  }
  picked.value = [...picked.value, id]
}

function confirmPick() {
  const index = pickIndex.value
  if (index == null) return
  const guests = assistWorker.value ? [assistWorker.value] : []
  const runes = runePicksForConfirm()
  if (pickMode.value === 'reinforce') {
    const result = isDungeonTab.value
      ? game.reinforceDungeonCombat([...picked.value], guests, runes)
      : game.reinforceCombat(index, [...picked.value], guests, runes)
    if (result.ok) closePick()
    return
  }
  if (consumeShort(index)) {
    pushFloatTip(CONSUME_SHORT_TIP, 'err')
    return
  }
  const result = isDungeonTab.value
    ? game.startDungeonCombat([...picked.value], guests, runes)
    : game.startCombat(index, [...picked.value], guests, runes)
  if (result.ok) closePick()
}

function kindTitle(kind: EncounterKind, enc?: Encounter) {
  if (enc && isDungeonEncounter(enc)) return '地牢'
  return ENCOUNTER_KIND_LABEL[kind]
}

function spriteKind(kind: EncounterKind) {
  return kind
}

function cardClass(enc: Encounter) {
  return {
    [`q-${enc.quality}`]: true,
    compact: isBrief.value,
    done: isEncounterDone(enc, now.value),
    stunned: enc.kind === 'enemy' && !!enc.combat && isCombatStunned(enc.combat, fightNow.value),
  }
}

function enemyCardAffix(enc: Encounter) {
  return enc.kind === 'enemy' ? battlefieldAffixRow(enc) : null
}

function enemyActStunned(enc: Encounter) {
  if (enc.kind !== 'enemy' || !enc.combat) return false
  return actChargeStunned(enc.combat.stunnedUntil, actNow.value)
}

function enemyHpShakeKey(enc: Encounter) {
  void fightNow.value
  return encounterHpShakeAt(enc.id)
}

function rosterFighters(enc: Encounter) {
  return enc.kind === 'enemy' ? combatRosterFighters(enc.combat) : []
}

function combatShield(enc: EnemyEncounter): number | null {
  if (!enc.combat || typeof enc.combat.shield !== 'number') return null
  return enc.combat.shield
}

function weaknessSlots(enc: EnemyEncounter) {
  return enemyWeaknessView(enc).slots
}

function pickEnemy(): EnemyEncounter | null {
  return activeEnemy()
}

function pickRecommend(w: Worker) {
  const enc = pickEnemy()
  return enc ? fighterRecommendLabel(w.combatAttrs, enc) : null
}

function timedLine(enc: Encounter) {
  return timedOrderLine(enc, now.value)
}

</script>

<template>
  <section class="panel encounter">
    <h2 class="title">主线</h2>
    <div class="board-nav">
      <nav class="sub" role="tablist" aria-label="主线分页">
        <button
          v-for="id in MAINLINE_TAB_IDS"
          :key="id"
          type="button"
          role="tab"
          :aria-selected="currentTab === id"
          :class="{ on: currentTab === id, 'guide-flash': guideFlashCombat && id === 'battlefield' }"
          @click="selectTab(id)"
        >
          {{ MAINLINE_TAB_LABELS[id] }}
        </button>
      </nav>
    </div>
    <div class="chapter-head">
      <p class="chapter">{{ chapterTitle }}</p>
      <div
        class="loot-bar"
        :class="{ ready: lootBarReady }"
        role="progressbar"
        :aria-valuenow="Math.min(game.save.mainLootClaims, 10)"
        :aria-valuemin="0"
        :aria-valuemax="10"
        :aria-label="lootBarLabel"
      >
        <i class="fill" :style="{ width: lootBarPct + '%' }" />
        <span>{{ lootBarLabel }}</span>
      </div>
    </div>
    <div class="row refresh">
      <button
        v-if="!isDungeonTab"
        type="button"
        @click="onExplore"
      >
        探索（{{ cost }} 金）
      </button>
      <p
        v-else
        class="refresh-hint"
        aria-live="polite"
      >
        {{ dungeonRefreshLabel }}
      </p>
      <nav class="sub density" role="tablist" aria-label="订单详略">
        <button
          v-for="id in MAINLINE_DENSITY_IDS"
          :key="id"
          type="button"
          role="tab"
          :aria-selected="currentDensity === id"
          :class="{ on: currentDensity === id }"
          @click="selectDensity(id)"
        >
          {{ MAINLINE_DENSITY_LABELS[id] }}
        </button>
      </nav>
    </div>
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>
    <div v-if="isDungeonTab" class="dungeon-meta">
      <p class="affix-row">
        <span>今日词缀：</span>
        <button
          v-for="row in dungeonAffixList"
          :key="row.id"
          type="button"
          class="affix-chip"
          data-dungeon-affix
          :aria-pressed="isDungeonAffixHelpOpen(affixHelp, row.id)"
          :aria-label="`查看 ${row.label} 效果`"
          @click="onAffixHelp($event, row.id, 'dungeon')"
        >
          {{ row.label }}
        </button>
      </p>
      <p>{{ dungeonAttemptLabel }}</p>
    </div>

    <div class="board" :class="{ solo: isDungeonTab }">
      <article v-for="(enc, i) in boardEncounters" :key="enc.id" class="card" :class="cardClass(enc)">
        <EncounterTips :encounter-id="enc.id" />
        <i v-if="isEncounterDone(enc, now)" class="stamp" aria-hidden="true">{{ stampLabel(enc) }}</i>
        <b class="qmark">{{ QUALITY_LABEL[enc.quality] }}</b>

        <template v-if="enc.kind === 'enemy'">
          <i v-if="cardClass(enc).stunned" class="stun-veil" aria-hidden="true" />
          <header v-if="showCardHeader(enc)">
            <i
              v-if="!isBrief"
              class="sprite sprite-encounter"
              :class="[spriteKind(enc.kind), { stunned: cardClass(enc).stunned }]"
              aria-hidden="true"
            />
            <div class="titles">
              <span class="kind">{{ kindTitle(enc.kind, enc) }}</span>
              <span class="tags">
                <i>{{ isDungeonEncounter(enc) ? '地牢' : ENEMY_RANK_LABEL[enc.enemyRank] }}</i>
                <i v-if="isDungeonEncounter(enc)">阶段 {{ enc.dungeonPhase ?? 1 }}/3</i>
                <i v-if="isDungeonEncounter(enc) && enc.dungeonMechanic && !isBrief">
                  {{ DUNGEON_MECHANIC_LABEL[enc.dungeonMechanic] }}
                </i>
              </span>
            </div>
          </header>
          <p v-if="showCardLabel(enc)" class="label">{{ enc.label }}</p>
          <p v-if="enemyCardAffix(enc)" class="affix-row card-affix">
            <button
              type="button"
              class="affix-chip"
              data-dungeon-affix
              :aria-pressed="isDungeonAffixHelpOpen(affixHelp, enemyCardAffix(enc)!.id)"
              :aria-label="`查看 ${enemyCardAffix(enc)!.label} 效果`"
              @click="onAffixHelp($event, enemyCardAffix(enc)!.id, 'battlefield')"
            >
              {{ enemyCardAffix(enc)!.label }}
            </button>
          </p>
          <EncounterDealLines :encounter="enc" />
          <p v-if="showFightReadout(enc)" class="weak">
            弱点
            <CombatAttrIcon
              v-for="(slot, si) in weaknessSlots(enc)"
              :key="`${enc.id}-w-${si}`"
              :attr="slot"
            />
            <i
              v-if="combatShield(enc) != null || cardClass(enc).stunned"
              class="shield"
              :class="{ broke: cardClass(enc).stunned }"
            >
              {{ cardClass(enc).stunned ? '破防中' : `盾 ${combatShield(enc)}` }}
            </i>
          </p>
          <template v-if="enc.combat && (!isBrief || isFighting(enc))">
            <div class="bars">
              <p class="bar-line">敌</p>
              <HpBar
                variant="enemy"
                :hp="enc.combat.enemy.hp"
                :hp-max="enc.combat.enemy.hpMax"
                :shake-key="enemyHpShakeKey(enc)"
              />
              <ActChargeBar
                v-if="isFighting(enc)"
                enemy
                :stunned="enemyActStunned(enc)"
                :fill="actChargeFill(enc.combat.enemy.spd, enc.combat.enemy.nextActAt, actNow)"
              />
              <template v-for="w in rosterFighters(enc)" :key="w.id">
                <p class="bar-line">{{ w.label }}</p>
                <HpBar :hp="w.hp" :hp-max="w.hpMax" />
                <ActChargeBar
                  v-if="isFighting(enc)"
                  :fill="actChargeFill(w.spd, w.nextActAt, actNow)"
                />
              </template>
            </div>
          </template>
          <div class="row">
            <button
              v-if="enc.lootClaimed"
              type="button"
              disabled
            >
              已领
            </button>
            <template v-else-if="isFighting(enc)">
              <button type="button" disabled aria-label="战斗中">{{ fightingNowLabel }}</button>
              <button
                v-if="canReinforceCombat(enc)"
                type="button"
                :class="{ 'guide-flash': guideFlashEnemy(enc) && !pickOpen }"
                @click="openReinforce(i)"
              >
                增援
              </button>
            </template>
            <button
              v-else-if="isDungeonEncounter(enc) && (isCombatWon(enc) || isCombatLost(enc))"
              type="button"
              @click="game.claimDungeonChest()"
            >
              宝箱
            </button>
            <button
              v-else-if="isCombatWon(enc)"
              type="button"
              :class="{ 'guide-flash': guideFlashEnemy(enc) && !pickOpen }"
              @click="game.claimLoot(i)"
            >
              战利品
            </button>
            <span v-else class="act-hit" @click="warnConsumeShort(i)">
              <button
                type="button"
                :class="{ 'guide-flash': guideFlashEnemy(enc) && !pickOpen }"
                :disabled="consumeShort(i)"
                @click.stop="openPick(i)"
              >
                开战
              </button>
            </span>
          </div>
        </template>

        <template v-else>
          <header v-if="showCardHeader(enc)">
            <i v-if="!isBrief" class="sprite sprite-encounter" :class="spriteKind(enc.kind)" aria-hidden="true" />
            <div class="titles">
              <span class="kind">{{ kindTitle(enc.kind, enc) }}</span>
            </div>
          </header>
          <p v-if="showCardLabel(enc)" class="label">{{ enc.label }}</p>
          <p v-if="timedLine(enc)" class="timed">{{ timedLine(enc) }}</p>
          <EncounterDealLines :encounter="enc" />

          <template v-if="enc.kind === 'blackMerchant'">
            <div class="row">
              <span class="act-hit" @click="warnConsumeShort(i)">
                <button
                  type="button"
                  :disabled="enc.completed || consumeShort(i)"
                  @click.stop="game.buyMerchant(i)"
                >
                  {{ enc.completed ? '成交' : '金币购买' }}
                </button>
              </span>
            </div>
          </template>

          <template v-else-if="enc.kind === 'passerby'">
            <div class="row">
              <span class="act-hit" @click="warnConsumeShort(i)">
                <button
                  type="button"
                  :disabled="enc.completed || consumeShort(i)"
                  @click.stop="game.barter(i)"
                >
                  {{ enc.completed ? '成交' : '以物易物' }}
                </button>
              </span>
            </div>
          </template>

          <template v-else-if="enc.kind === 'pawn'">
            <div class="row">
              <span class="act-hit" @click="warnConsumeShort(i)">
                <button
                  type="button"
                  :disabled="enc.completed || consumeShort(i)"
                  @click.stop="game.pawn(i)"
                >
                  {{ enc.completed ? '成交' : '以物换钱' }}
                </button>
              </span>
            </div>
          </template>

          <template v-else-if="enc.kind === 'artisan'">
            <div class="row">
              <span class="act-hit" @click="warnConsumeShort(i)">
                <button
                  type="button"
                  :disabled="enc.completed || consumeShort(i)"
                  @click.stop="game.submitArtisan(i)"
                >
                  {{ enc.completed ? '完成' : '交付成品' }}
                </button>
              </span>
            </div>
          </template>

          <template v-else-if="enc.kind === 'bulkBuy'">
            <div class="row">
              <span class="act-hit" @click="warnConsumeShort(i)">
                <button
                  type="button"
                  :disabled="enc.completed || consumeShort(i)"
                  @click.stop="game.sellBulk(i)"
                >
                  {{ enc.completed ? '成交' : '高价出售' }}
                </button>
              </span>
            </div>
          </template>
        </template>
      </article>
    </div>

    <div v-if="pickOpen" class="modal" role="dialog" aria-label="选择出战工人" @click.self="closePick">
      <div class="sheet">
        <p>{{ pickMode === 'reinforce' ? '选择增援工人' : '选择出战工人' }}（最多 {{ pickMax }} 人）</p>
        <p class="hint">列出休息工人；未达出战条件的灰显。出战不算派驻工坊。点邀请才加入 1 名临时助战。{{ pickMode === 'reinforce' ? '增援不消耗补给。' : `1～${pickMax} 人即可，不必凑满。` }}</p>
        <ul class="pick-list">
          <li v-for="w in pickCandidates" :key="w.id" class="pick-row">
            <button
              type="button"
              class="pick-worker"
              :class="{ on: picked.includes(w.id), assist: isAssistWorker(w), dim: !isFullCombatHp(w) }"
              :disabled="!isFullCombatHp(w)"
              @click="togglePick(w)"
            >
              <span class="pick-name">
                <b class="qmark" :style="workerQualityBadgeStyle(w)">{{ qualityOf(w).label }}</b>
                <i v-if="isAssistWorker(w)" class="pick-assist">助战</i>
                <i v-else-if="w.isNew" class="pick-new">NEW</i>
                <CombatAttrRow class="pick-attrs" :attrs="w.combatAttrs" />
                <b class="pick-worker-name" :style="workerQualityNameStyle(w)">{{ pickWorkerName(w) }}</b>
                <span class="pick-meta">· Lv{{ w.level }}</span>
                <i
                  v-if="pickRecommend(w) && isFullCombatHp(w)"
                  class="pick-rec"
                  :class="{ hot: pickRecommend(w) === '强烈推荐' }"
                >{{ pickRecommend(w) }}</i>
              </span>
            </button>
            <span class="act-hit rune-slot-hit" @click="onRuneSlotTap(w, $event)">
              <button
                type="button"
                class="rune-slot"
                :class="{ on: runeSlotUnlocked && !!equippedRune(w.id), locked: !runeSlotUnlocked, 'guide-flash': guideFlashRune && runeSlotUnlocked }"
                :disabled="!runeSlotUnlocked || !isFullCombatHp(w)"
                :aria-label="`${pickWorkerName(w)} 符文槽`"
                @click.stop="onRuneSlotTap(w, $event)"
              >{{ runeSlotLabel(w.id) }}</button>
            </span>
          </li>
          <li v-if="!pickCandidates.length" class="hint">没有休息中的工人</li>
        </ul>
        <div class="row">
          <span class="act-hit" @click="pickMode === 'start' && pickIndex != null && warnConsumeShort(pickIndex)">
            <button
              type="button"
              :class="{ 'guide-flash': guideFlashCombat && pickMode === 'start' }"
              :disabled="!picked.length || (pickMode === 'start' && pickIndex != null && consumeShort(pickIndex))"
              @click.stop="confirmPick"
            >
              {{ pickMode === 'reinforce' ? '增援' : '开战' }}
            </button>
          </span>
          <button type="button" @click="inviteAssist">邀请</button>
        </div>
      </div>
    </div>

    <div v-if="runePickOpen" class="modal" role="dialog" aria-label="选择符文" @click.self="closeRunePick">
      <div class="sheet rune-sheet">
        <p>选择符文（一人一槽，开战消耗）</p>
        <p class="hint">列出全部种类与库存；短文案是本场效果。未选则空手出战。</p>
        <ul class="rune-list">
          <li>
            <button type="button" class="rune-item" :class="{ on: runePickWorkerId && !equippedRune(runePickWorkerId) }" @click="pickRune(null)">
              <b>空槽</b>
              <span>不带符文</span>
            </button>
          </li>
          <li v-for="row in runeOptions" :key="row.id">
            <button
              type="button"
              class="rune-item"
              :class="{ on: runePickWorkerId ? equippedRune(runePickWorkerId) === row.id : false }"
              :disabled="availableRuneQty(game.save, pickRunes, row.id, runePickWorkerId ?? undefined) < 1 && !(runePickWorkerId && equippedRune(runePickWorkerId) === row.id)"
              @click="pickRune(row.id)"
            >
              <b>{{ row.label }} ×{{ availableRuneQty(game.save, pickRunes, row.id, runePickWorkerId ?? undefined) }}</b>
              <span>{{ row.effect }}</span>
            </button>
          </li>
        </ul>
        <div class="row">
          <button type="button" @click="closeRunePick">关闭</button>
        </div>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="affixHelpBubble"
      class="affix-bubble"
      data-dungeon-affix-bubble
      role="dialog"
      :aria-label="affixHelpBubble.title"
      :style="{ left: `${affixHelpPos.left}px`, top: `${affixHelpPos.top}px` }"
    >
      <b>{{ affixHelpBubble.title }}</b>
      <p>{{ affixHelpBubble.effect }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 10px;
}

.title {
  margin: 0;
  font-size: 20px;
}

.board-nav {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.board-nav .sub {
  flex: 1 1 0;
  min-width: 0;
}

.sub {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 3px;
  border: 2px solid var(--gold);
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #fffef8 0%, #fff3d4 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.sub button {
  flex: 1 1 0;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  box-shadow: none;
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.08em;
  opacity: 1;
  filter: none;
}

.sub button:hover:not(:disabled) {
  filter: none;
  background: rgba(255, 243, 196, 0.45);
}

.sub button:active:not(:disabled) {
  transform: none;
  box-shadow: none;
}

.sub button:focus-visible {
  outline: 2px solid var(--gold-deep);
  outline-offset: 1px;
}

.sub button.on,
.sub button.on:hover:not(:disabled),
.sub button.on:active:not(:disabled) {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 2px 6px rgba(212, 160, 23, 0.32);
  opacity: 1;
  filter: none;
}

.sub.density button {
  flex: 0 0 auto;
  min-width: 40px;
  padding: 4px 12px;
}

.panel p,
.panel .title,
.hint,
.label,
.buff {
  margin: 0;
  line-height: 1.5;
}

.chapter-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chapter {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  letter-spacing: 0.08em;
}

.loot-bar {
  position: relative;
  height: 22px;
  overflow: hidden;
  border: 2px solid var(--gold-deep);
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #efe0b0, var(--bar-track));
  box-shadow: inset 0 1px 2px rgba(106, 66, 24, 0.16);
}

.loot-bar .fill {
  display: block;
  height: 100%;
  background: var(--bar-fill-gold);
}

.loot-bar.ready .fill {
  background: var(--bar-sheen), linear-gradient(90deg, #e67a12, #c0392b);
}

.loot-bar span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--ink);
  text-shadow: 0 1px 0 #fff8e0;
}

.label {
  font-family: var(--font-mono);
  color: var(--copper);
}

.timed {
  margin: 0;
  font-family: var(--font-mono);
  font-weight: 700;
  color: #c0392b;
}

.buff {
  color: var(--moss-deep);
  font-weight: 700;
}

.board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.board.solo {
  grid-template-columns: minmax(0, 1fr);
}

.dungeon-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-family: var(--font-mono);
  color: var(--ink);
}

.dungeon-meta p {
  margin: 0;
}

.affix-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.affix-chip {
  padding: 2px 8px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: #fff8e8;
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.affix-chip[aria-pressed='true'] {
  background: var(--gold);
}

.card-affix {
  margin: 0;
}

.affix-bubble {
  position: fixed;
  z-index: calc(var(--z-sheet) + 8);
  width: min(240px, calc(100vw - 16px));
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 2px solid var(--gold-deep);
  border-radius: 10px;
  background: linear-gradient(#fffef8, #fff3d8);
  box-shadow: 0 4px 0 var(--shadow);
  color: var(--ink);
}

.affix-bubble b {
  font-size: 13px;
}

.affix-bubble p {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 700;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow: visible;
}

.card.compact {
  gap: 6px;
  padding: 8px 10px;
}

.card header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.titles {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.kind {
  font-family: var(--font-display);
  letter-spacing: 0.12em;
}

.tags {
  display: flex;
  gap: 6px;
}

.tags i {
  font-style: normal;
  padding: 1px 8px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: var(--slot);
  color: var(--ink);
  font-size: 12px;
}

.qmark {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  min-width: 22px;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: var(--plate);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.card.q-gray {
  border-color: #9a8f7a;
}

.card.q-gray .qmark {
  color: #7a715f;
}

.card.q-green {
  border-color: #3e9a2a;
}

.card.q-green .qmark {
  color: #2f7a20;
  background: #e7f8d8;
}

.card.q-blue {
  border-color: #3a7ad9;
}

.card.q-blue .qmark {
  color: #1f56b0;
  background: #dcebff;
}

.card.q-purple {
  border-color: #8a4ecf;
}

.card.q-purple .qmark {
  color: #6b2fb0;
  background: #f0e2ff;
}

.card.q-orange {
  border-color: #e67a12;
}

.card.q-orange .qmark {
  color: #b85a08;
  background: #ffe7c8;
}

.card.done {
  background: linear-gradient(#efe6c8, #e4d3a4);
  box-shadow: 0 3px 0 #c4a24a, inset 0 0 0 2px #fff4d0;
}

.card.done.q-green {
  background: linear-gradient(#e8f3d4, #d7e6b4);
}

.card.done.q-blue {
  background: linear-gradient(#dce8f8, #c5d6ee);
}

.card.done.q-purple {
  background: linear-gradient(#eadcf6, #d8c4ea);
}

.card.done.q-orange {
  background: linear-gradient(#f8e4c4, #efd09a);
}

.stamp {
  position: absolute;
  top: 42%;
  right: 18px;
  z-index: 2;
  padding: 6px 14px;
  border: 3px solid #c0392b;
  border-radius: 8px;
  color: #c0392b;
  background: rgba(255, 248, 238, 0.72);
  font-family: var(--font-display);
  font-size: 22px;
  font-style: normal;
  font-weight: 400;
  letter-spacing: 0.28em;
  pointer-events: none;
  transform: rotate(-18deg);
  box-shadow: inset 0 0 0 2px rgba(192, 57, 43, 0.35);
  animation: stamp-in var(--motion) ease;
}

@keyframes stamp-in {
  from {
    opacity: 0;
    transform: rotate(-18deg) scale(1.12);
  }
  to {
    opacity: 1;
    transform: rotate(-18deg) scale(1);
  }
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-mono);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.refresh {
  align-items: center;
}

.refresh .density {
  flex: 0 0 auto;
  margin-left: auto;
}

.refresh-hint {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 14px;
}

.act-hit {
  display: inline-flex;
}

.act-hit > :disabled {
  pointer-events: none;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

.weak {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
}

.shield {
  font-style: normal;
  padding: 1px 7px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: #fff3d4;
  color: var(--ink);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.shield.broke {
  border-color: #c0392b;
  background: #ffe0cc;
  color: #c0392b;
  animation: stun-pulse 0.85s ease-in-out infinite;
}

.card.stunned {
  box-shadow: 0 3px 0 #c0392b, inset 0 0 0 2px #ffd0b8;
}

.card.stunned .bars {
  filter: saturate(0.7) brightness(0.92);
}

.card.stunned :deep(.hp) {
  outline: 2px solid #c0392b;
  outline-offset: 1px;
}

.stun-veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: inherit;
  background: rgba(192, 57, 43, 0.1);
  animation: stun-pulse 0.85s ease-in-out infinite;
}

.sprite.stunned {
  outline: 3px solid #c0392b;
  outline-offset: 2px;
  filter: saturate(0.45) brightness(0.82);
  animation: stun-pulse 0.85s ease-in-out infinite;
}

@keyframes stun-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.62;
  }
}

.weak :deep(.chip) {
  flex: none;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  max-width: 20px;
  max-height: 20px;
  aspect-ratio: 1;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bar-line {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(40, 24, 8, 0.45);
}

.sheet {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 3px solid var(--gold-deep);
  border-radius: 16px;
  background: var(--plate);
  box-shadow: 0 6px 0 var(--shadow);
}

.pick-list {
  max-height: 50vh;
  overflow: auto;
}

.pick-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.pick-list .pick-worker {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  text-align: left;
}

.rune-slot-hit {
  flex: 0 0 56px;
}

.rune-slot {
  flex: 0 0 56px;
  width: 100%;
  min-width: 56px;
  min-height: 44px;
  padding: 4px 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.rune-slot.on {
  background: linear-gradient(#ffe27a, #f0b83a);
}

.rune-slot.locked,
.rune-slot:disabled {
  opacity: 0.45;
  filter: grayscale(0.35);
}

.rune-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 46vh;
  overflow: auto;
}

.rune-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
}

.rune-item span {
  color: var(--muted);
  font-size: 12px;
}

.rune-item.on {
  background: linear-gradient(#ffe27a, #f0b83a);
}

.pick-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  color: var(--copper);
}

.pick-attrs {
  flex: none;
}

.pick-worker-name {
  font-weight: 700;
}

.pick-assist {
  font-style: normal;
  padding: 1px 7px;
  border: 2px solid #1f7a4a;
  border-radius: 999px;
  background: #d8f3e4;
  color: #14603a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.pick-new {
  font-style: normal;
  padding: 1px 6px;
  border: 1px solid #7a1808;
  border-radius: 4px;
  background: linear-gradient(#ff6a3d, #d62828);
  color: #fff8e8;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.pick-worker.assist {
  box-shadow: inset 0 0 0 2px #1f7a4a;
}

.pick-rec {
  font-style: normal;
  padding: 1px 7px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: #ffe9a0;
  color: #6b4218;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.pick-rec.hot {
  background: #f0c14a;
  color: #4a2c0a;
}

.pick-list .qmark {
  position: static;
  min-width: 22px;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.pick-worker.dim,
.pick-worker:disabled {
  opacity: 0.5;
  filter: grayscale(0.15);
}

.pick-worker.on,
.pick-worker.on:disabled {
  color: var(--ink);
  background: linear-gradient(180deg, #ffe9a0, #f0c14a);
  border-color: var(--gold-deep);
  box-shadow:
    0 3px 0 var(--gold-deep),
    inset 0 1px 0 #fff6c8,
    inset 0 0 0 2px #ffe28a;
  filter: none;
  opacity: 1;
}

.pick-list :deep(.chip) {
  flex: none;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  aspect-ratio: 1;
}

@media (prefers-reduced-motion: reduce) {
  .stamp,
  .shield.broke,
  .stun-veil,
  .sprite.stunned {
    animation: none;
  }
}
</style>
