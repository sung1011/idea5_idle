<script setup lang="ts">
import { computed, ref } from 'vue'
import { ENEMY_RANK_LABEL, enemyWeaknessView, fighterRecommendLabel } from '../sim/combatAttrs'
import CombatAttrIcon from './combatAttrIcon.vue'
import CombatAttrRow from './combatAttrRow.vue'
import {
  COMBAT_PARTY_MAX,
  isCombatLost,
  isCombatWon,
  isFighting,
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
  type EncounterBoardId,
} from '../sim/encounters'
import { isGuideQuestDealFlash, isGuideQuestFlash } from '../sim/guideQuest'
import { mainChapterTitle, mainLootClaimBarLabel, mainLootClaimFillPct } from '../sim/mainChapter'
import { CLASS_LABEL } from '../sim/tables'
import type { Encounter, EncounterKind, EnemyEncounter, Worker } from '../sim/types'
import EncounterDealLines from './encounterDealLines.vue'
import EncounterTips from './encounterTips.vue'
import { CONSUME_SHORT_TIP, isEncounterActionConsumeShort } from './encounterDeal'
import { formatAtkSpeed } from './formatAtkSpeed'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import { MAINLINE_TAB_IDS, MAINLINE_TAB_LABELS, mainlineTab, selectMainlineTab } from './mainlineTabs'
import HpBar from './hpBar.vue'
import {
  qualityOf,
  workerQualityBadgeStyle,
  workerQualityNameStyle,
} from './workerQuality'

const game = useGameStore()
const guideFlashExplore = computed(() => isGuideQuestFlash(game.save, 'explore'))
const guideFlashMarket = computed(() => isGuideQuestFlash(game.save, 'deal'))
function guideFlashDeal(enc: Encounter) {
  return isGuideQuestDealFlash(game.save, enc)
}
const currentTab = computed(() => mainlineTab.value)
const boardEncounters = computed(() => encountersOf(game.save, currentTab.value))
const cost = computed(() => exploreCost(game.save))
const chapterTitle = computed(() => mainChapterTitle(game.save))
const lootBarLabel = computed(() => mainLootClaimBarLabel(game.save))
const lootBarPct = computed(() => mainLootClaimFillPct(game.save))
const lootBarReady = computed(() => game.save.mainLootClaims >= 10)
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const buffOn = computed(() => isWorkshopBuffActive(game.save, now.value))
const buffLabel = computed(() => {
  if (!buffOn.value) return ''
  const pct = Math.round((workshopBuffMul(game.save, now.value) - 1) * 100)
  return `工匠加持：工坊产量 +${pct}% · 剩余 ${formatMarchClock(workshopBuffRemainS(game.save, now.value))}`
})
const pickIndex = ref<number | null>(null)
const picked = ref<string[]>([])
const assistWorker = ref<Worker | null>(null)
const pickOpen = computed(() => pickIndex.value !== null)
const pickCandidates = computed(() =>
  pickCombatCandidates(restCombatCandidates(game.save), assistWorker.value),
)

function selectTab(id: EncounterBoardId) {
  selectMainlineTab(id)
  closePick()
}

function consumeShort(index: number) {
  return isEncounterActionConsumeShort(game.save, index, currentTab.value)
}

function warnConsumeShort(index: number) {
  if (consumeShort(index)) pushFloatTip(CONSUME_SHORT_TIP, 'err')
}

function openPick(index: number) {
  if (consumeShort(index)) {
    pushFloatTip(CONSUME_SHORT_TIP, 'err')
    return
  }
  const blocked = combatSupplyBlockReason(game.save, index)
  if (blocked) {
    pushFloatTip(blocked, 'err')
    return
  }
  pickIndex.value = index
  picked.value = []
  assistWorker.value = null
}

function closePick() {
  pickIndex.value = null
  picked.value = []
  assistWorker.value = null
}

function inviteAssist() {
  assistWorker.value = createAssistWorker(game.save)
}

function togglePick(worker: Worker) {
  if (worker.hp <= 0) return
  const id = worker.id
  if (picked.value.includes(id)) {
    picked.value = picked.value.filter((x) => x !== id)
    return
  }
  if (picked.value.length >= COMBAT_PARTY_MAX) {
    pushFloatTip(`最多选 ${COMBAT_PARTY_MAX} 人`, 'err')
    return
  }
  picked.value = [...picked.value, id]
}

function confirmPick() {
  const index = pickIndex.value
  if (index == null) return
  if (consumeShort(index)) {
    pushFloatTip(CONSUME_SHORT_TIP, 'err')
    return
  }
  const guests = assistWorker.value ? [assistWorker.value] : []
  const result = game.startCombat(index, [...picked.value], guests)
  if (result.ok) closePick()
}

function kindTitle(kind: EncounterKind) {
  return ENCOUNTER_KIND_LABEL[kind]
}

function spriteKind(kind: EncounterKind) {
  return kind
}

function cardClass(enc: Encounter) {
  return {
    [`q-${enc.quality}`]: true,
    done: isEncounterDone(enc, now.value),
  }
}

function workerJob(w: Worker) {
  return w.classId ? CLASS_LABEL[w.classId] : '未标'
}

function weaknessSlots(enc: EnemyEncounter) {
  return enemyWeaknessView(enc).slots
}

function pickEnemy(): EnemyEncounter | null {
  const i = pickIndex.value
  if (i == null) return null
  const enc = game.save.encounters[i]
  return enc?.kind === 'enemy' ? enc : null
}

function pickRecommend(w: Worker) {
  const enc = pickEnemy()
  return enc ? fighterRecommendLabel(w.combatAttrs, enc) : null
}

</script>

<template>
  <section class="panel encounter">
    <h2 class="title">主线</h2>
    <nav class="sub" role="tablist" aria-label="主线分页">
      <button
        v-for="id in MAINLINE_TAB_IDS"
        :key="id"
        type="button"
        role="tab"
        :aria-selected="currentTab === id"
        :class="{ on: currentTab === id, 'guide-flash': guideFlashMarket && id === 'market' }"
        @click="selectTab(id)"
      >
        {{ MAINLINE_TAB_LABELS[id] }}
      </button>
    </nav>
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
    <div class="row">
      <button type="button" :class="{ 'guide-flash': guideFlashExplore }" @click="game.explore()">
        探索（{{ cost }} 金）
      </button>
    </div>
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>

    <div class="board">
      <article v-for="(enc, i) in boardEncounters" :key="enc.id" class="card" :class="cardClass(enc)">
        <EncounterTips :encounter-id="enc.id" />
        <i v-if="isEncounterDone(enc, now)" class="stamp" aria-hidden="true">{{ stampLabel(enc) }}</i>
        <b class="qmark">{{ QUALITY_LABEL[enc.quality] }}</b>

        <template v-if="enc.kind === 'enemy'">
          <header>
            <i class="sprite sprite-encounter" :class="spriteKind(enc.kind)" aria-hidden="true" />
            <div class="titles">
              <span class="kind">{{ kindTitle(enc.kind) }}</span>
              <span class="tags">
                <i>{{ ENEMY_RANK_LABEL[enc.enemyRank] }}</i>
              </span>
            </div>
          </header>
          <p class="label">{{ enc.label }}</p>
          <EncounterDealLines :encounter="enc" />
          <p class="weak">
            弱点
            <CombatAttrIcon
              v-for="(slot, si) in weaknessSlots(enc)"
              :key="`${enc.id}-w-${si}`"
              :attr="slot"
            />
          </p>
          <template v-if="enc.combat">
            <div class="bars">
              <p class="bar-line">
                敌 · ATK {{ enc.combat.enemy.atk }} · 攻速 {{ formatAtkSpeed(enc.combat.enemy.spd) }}
              </p>
              <HpBar :hp="enc.combat.enemy.hp" :hp-max="enc.combat.enemy.hpMax" />
              <template v-for="w in enc.combat.workers" :key="w.id">
                <p class="bar-line">
                  {{ w.label }} · ATK {{ w.atk }} · 攻速 {{ formatAtkSpeed(w.spd) }}
                </p>
                <HpBar :hp="w.hp" :hp-max="w.hpMax" />
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
            <button
              v-else-if="isFighting(enc)"
              type="button"
              disabled
            >
              战斗中
            </button>
            <button
              v-else-if="isCombatWon(enc)"
              type="button"
              @click="game.claimLoot(i)"
            >
              战利品
            </button>
            <span v-else class="act-hit" @click="warnConsumeShort(i)">
              <button
                type="button"
                :disabled="consumeShort(i)"
                @click.stop="openPick(i)"
              >
                {{ isCombatLost(enc) ? '再战' : '战斗' }}
              </button>
            </span>
          </div>
        </template>

        <template v-else>
          <header>
            <i class="sprite sprite-encounter" :class="spriteKind(enc.kind)" aria-hidden="true" />
            <div class="titles">
              <span class="kind">{{ kindTitle(enc.kind) }}</span>
            </div>
          </header>
          <p class="label">{{ enc.label }}</p>
          <EncounterDealLines :encounter="enc" />

          <template v-if="enc.kind === 'blackMerchant'">
            <div class="row">
              <span class="act-hit" @click="warnConsumeShort(i)">
                <button
                  type="button"
                  :class="{ 'guide-flash': guideFlashDeal(enc) }"
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
                  :class="{ 'guide-flash': guideFlashDeal(enc) }"
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
                  :class="{ 'guide-flash': guideFlashDeal(enc) }"
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
                  :class="{ 'guide-flash': guideFlashDeal(enc) }"
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
                  :class="{ 'guide-flash': guideFlashDeal(enc) }"
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
        <p>选择休息中工人（最多 {{ COMBAT_PARTY_MAX }} 人）</p>
        <p class="hint">HP≤0 不可选。出战不算派驻工坊。点邀请才加入 1 名临时助战。</p>
        <ul class="pick-list">
          <li v-for="w in pickCandidates" :key="w.id">
            <button
              type="button"
              class="pick-worker"
              :class="{ on: picked.includes(w.id), assist: isAssistWorker(w) }"
              :disabled="w.hp <= 0"
              @click="togglePick(w)"
            >
              <span class="pick-name">
                <b class="qmark" :style="workerQualityBadgeStyle(w)">{{ qualityOf(w).label }}</b>
                <i v-if="isAssistWorker(w)" class="pick-assist">助战</i>
                <CombatAttrRow class="pick-attrs" :attrs="w.combatAttrs" />
                <b class="pick-worker-name" :style="workerQualityNameStyle(w)">{{ w.name ?? w.id }}</b>
                <span class="pick-meta">· Lv{{ w.level }} · {{ workerJob(w) }} · HP {{ w.hp }}/{{ w.hpMax }}</span>
                <i
                  v-if="pickRecommend(w)"
                  class="pick-rec"
                  :class="{ hot: pickRecommend(w) === '强烈推荐' }"
                >{{ pickRecommend(w) }}</i>
              </span>
            </button>
          </li>
          <li v-if="!pickCandidates.length" class="hint">没有休息中的工人</li>
        </ul>
        <div class="row">
          <span class="act-hit" @click="pickIndex != null && warnConsumeShort(pickIndex)">
            <button
              type="button"
              :disabled="!picked.length || (pickIndex != null && consumeShort(pickIndex))"
              @click.stop="confirmPick"
            >
              开战
            </button>
          </span>
          <button type="button" @click="inviteAssist">邀请</button>
        </div>
      </div>
    </div>
  </section>
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

.buff {
  color: var(--moss-deep);
  font-weight: 700;
}

.board {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 560px) {
  .board {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 900px) {
  .board {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow: visible;
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

.pick-list button {
  width: 100%;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  text-align: left;
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
  .stamp {
    animation: none;
  }
}
</style>
