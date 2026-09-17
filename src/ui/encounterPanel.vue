<script setup lang="ts">
import { computed, ref } from 'vue'
import { ENEMY_RANK_LABEL, visibleWeaknessSlots } from '../sim/combatAttrs'
import CombatAttrIcon from './combatAttrIcon.vue'
import CombatAttrRow from './combatAttrRow.vue'
import {
  COMBAT_PARTY_MAX,
  COMBAT_STATUS_LABEL,
  combatStatus,
  isCombatLost,
  isCombatWon,
  isFighting,
  restCombatCandidates,
} from '../sim/combat'
import {
  ENCOUNTER_KIND_LABEL,
  QUALITY_LABEL,
  combatSupplyBlockReason,
  exploreCost,
  formatMarchClock,
  formatNeedMap,
  isEncounterDone,
  isWorkshopBuffActive,
  needLines,
  pawnQuoteLines,
  pawnRewardGold,
  stampLabel,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import { mainChapterTitle, mainLootClaimBarLabel, mainLootClaimFillPct } from '../sim/mainChapter'
import { CLASS_LABEL } from '../sim/tables'
import type { Encounter, EncounterKind, EnemyEncounter, PawnEncounter, Worker } from '../sim/types'
import EncounterTips from './encounterTips.vue'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import {
  qualityOf,
  workerQualityBadgeStyle,
  workerQualityCardStyle,
  workerQualityToneClass,
} from './workerQuality'

const game = useGameStore()
const cost = computed(() => exploreCost(game.save))
const chapterTitle = computed(() => mainChapterTitle(game.save))
const lootBarLabel = computed(() => mainLootClaimBarLabel(game.save))
const lootBarPct = computed(() => mainLootClaimFillPct(game.save))
const lootBarReady = computed(() => game.save.mainLootClaims >= 10)
const departedTotal = computed(() => game.save.departCount)
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
const pickOpen = computed(() => pickIndex.value !== null)
const pickCandidates = computed(() => restCombatCandidates(game.save))

function openPick(index: number) {
  const blocked = combatSupplyBlockReason(game.save, index)
  if (blocked) {
    pushFloatTip(blocked, 'err')
    return
  }
  pickIndex.value = index
  picked.value = []
}

function closePick() {
  pickIndex.value = null
  picked.value = []
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
  const result = game.startCombat(index, [...picked.value])
  if (result.ok) closePick()
}

function enemyLines(enc: Encounter) {
  return enc.kind === 'enemy' ? needLines(game.save, enc.needs) : []
}

function wantLines(enc: Encounter) {
  if (enc.kind === 'passerby' || enc.kind === 'artisan' || enc.kind === 'bulkBuy') {
    return needLines(game.save, enc.wants)
  }
  return []
}

function pawnLines(enc: Encounter) {
  return enc.kind === 'pawn' ? pawnQuoteLines(game.save, enc.pawnWants) : []
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

function statusText(enc: EnemyEncounter) {
  return COMBAT_STATUS_LABEL[combatStatus(enc)]
}

function hpPct(hp: number, hpMax: number) {
  if (hpMax <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((hp / hpMax) * 100)))
}

function workerLine(w: Worker) {
  const job = w.classId ? CLASS_LABEL[w.classId] : '未标'
  return `${w.name ?? w.id} · ${job} · HP ${w.hp}/${w.hpMax}`
}

function weaknessSlots(enc: EnemyEncounter) {
  return visibleWeaknessSlots(enc)
}

function pawnGold(enc: PawnEncounter) {
  return pawnRewardGold(enc)
}
</script>

<template>
  <section class="panel encounter">
    <h2 class="title">主线</h2>
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
      <button type="button" @click="game.explore()">
        探索（{{ cost }} 金）
      </button>
    </div>
    <p class="hint">工坊看板 {{ game.save.encounters.length }} 格。当前金币 {{ game.save.gold }}</p>
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>

    <div class="board">
      <article v-for="(enc, i) in game.save.encounters" :key="enc.id" class="card" :class="cardClass(enc)">
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
          <p class="label">{{ enc.label }} · 战利品 {{ enc.lootGold }} 金</p>
          <p class="weak">
            弱点
            <CombatAttrIcon
              v-for="(slot, si) in weaknessSlots(enc)"
              :key="`${enc.id}-w-${si}`"
              :attr="slot"
            />
          </p>
          <p class="ready">{{ statusText(enc) }}</p>
          <ul>
            <li v-for="line in enemyLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
              {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
              <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
            </li>
          </ul>
          <template v-if="enc.combat">
            <div class="bars">
              <p class="bar-line">
                敌 {{ enc.combat.enemy.hp }}/{{ enc.combat.enemy.hpMax }}
                · ATK {{ enc.combat.enemy.atk }} · SPD {{ enc.combat.enemy.spd }}
              </p>
              <i class="bar" aria-hidden="true"><b :style="{ width: hpPct(enc.combat.enemy.hp, enc.combat.enemy.hpMax) + '%' }" /></i>
              <template v-for="w in enc.combat.workers" :key="w.id">
                <p class="bar-line">
                  {{ w.label }} {{ w.hp }}/{{ w.hpMax }} · ATK {{ w.atk }} · SPD {{ w.spd }}
                </p>
                <i class="bar ally" aria-hidden="true"><b :style="{ width: hpPct(w.hp, w.hpMax) + '%' }" /></i>
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
              class="success"
              @click="game.claimLoot(i)"
            >
              战利品
            </button>
            <button
              v-else
              type="button"
              @click="openPick(i)"
            >
              {{ isCombatLost(enc) ? '再战' : '战斗' }}
            </button>
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

          <template v-if="enc.kind === 'blackMerchant'">
            <p>花金币买工坊货：{{ enc.buyGold }} 金 → {{ formatNeedMap(enc.buyOffers) }}</p>
            <p v-if="enc.completed" class="ready">这笔买卖已成交</p>
            <div class="row">
              <button
                type="button"
                :disabled="enc.completed"
                @click="game.buyMerchant(i)"
              >
                {{ enc.completed ? '成交' : '金币购买' }}
              </button>
            </div>
          </template>

          <template v-else-if="enc.kind === 'passerby'">
            <p>工坊换货：交出 {{ formatNeedMap(enc.wants) }}</p>
            <p>换得 {{ formatNeedMap(enc.offers) }}</p>
            <ul>
              <li v-for="line in wantLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">这笔买卖已成交</p>
            <div class="row">
              <button type="button" :disabled="enc.completed" @click="game.barter(i)">
                {{ enc.completed ? '成交' : '以物易物' }}
              </button>
            </div>
          </template>

          <template v-else-if="enc.kind === 'pawn'">
            <p>工坊典当：{{ formatNeedMap(enc.pawnWants) }} → {{ pawnGold(enc) }} 金</p>
            <ul>
              <li v-for="line in pawnLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span> · 报价 {{ line.gold }} 金</span>
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">这笔买卖已成交</p>
            <div class="row">
              <button type="button" :disabled="enc.completed" @click="game.pawn(i)">
                {{ enc.completed ? '成交' : '以物换钱' }}
              </button>
            </div>
          </template>

          <template v-else-if="enc.kind === 'artisan'">
            <p>交成品：{{ formatNeedMap(enc.wants) }}</p>
            <p>工坊回礼：{{ enc.rewardGold }} 金 + 产量 +{{ Math.round((enc.buffMul - 1) * 100) }}% · {{ formatMarchClock(enc.buffDurationS) }}</p>
            <ul>
              <li v-for="line in wantLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">委托已完成</p>
            <div class="row">
              <button
                type="button"
                :disabled="enc.completed"
                @click="game.submitArtisan(i)"
              >
                {{ enc.completed ? '完成' : '交付成品' }}
              </button>
            </div>
          </template>

          <template v-else-if="enc.kind === 'bulkBuy'">
            <p>高价收成品：交出 {{ formatNeedMap(enc.wants) }} → {{ enc.rewardGold }} 金</p>
            <ul>
              <li v-for="line in wantLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">这笔收购已成交</p>
            <div class="row">
              <button type="button" :disabled="enc.completed" @click="game.sellBulk(i)">
                {{ enc.completed ? '成交' : '高价出售' }}
              </button>
            </div>
          </template>
        </template>
      </article>
    </div>

    <p v-if="departedTotal > 0" class="hint">已开战 {{ departedTotal }} 次</p>

    <div v-if="pickOpen" class="modal" role="dialog" aria-label="选择出战工人" @click.self="closePick">
      <div class="sheet">
        <p>选择休息中工人（最多 {{ COMBAT_PARTY_MAX }} 人）</p>
        <p class="hint">HP≤0 不可选。出战不算派驻工坊。</p>
        <ul class="pick-list">
          <li v-for="w in pickCandidates" :key="w.id">
            <button
              type="button"
              class="pick-worker"
              :class="{ on: picked.includes(w.id), ...workerQualityToneClass(w) }"
              :style="workerQualityCardStyle(w)"
              :disabled="w.hp <= 0"
              @click="togglePick(w)"
            >
              <span class="pick-name">
                <b class="qmark" :style="workerQualityBadgeStyle(w)">{{ qualityOf(w).label }}</b>
                {{ workerLine(w) }}
              </span>
              <CombatAttrRow :attrs="w.combatAttrs" />
            </button>
          </li>
          <li v-if="!pickCandidates.length" class="hint">没有休息中的工人</li>
        </ul>
        <div class="row">
          <button type="button" :disabled="!picked.length" @click="confirmPick">开战</button>
          <button type="button" class="ghost" @click="closePick">取消</button>
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

.hint {
  color: var(--muted);
  font-size: 14px;
}

.short {
  color: var(--danger);
}

.ready {
  color: var(--moss);
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

.bar {
  display: block;
  height: 8px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: linear-gradient(180deg, #efe0b0, #efe4c4);
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(106, 66, 24, 0.16);
}

.bar b {
  display: block;
  height: 100%;
  background: var(--bar-fill-hp);
}

.bar.ally b {
  background: var(--bar-fill-moss);
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  text-align: left;
  font-family: var(--font-body);
  font-size: 14px;
  letter-spacing: 0;
  text-indent: 0;
  text-shadow: none;
  line-height: 1.4;
  min-height: 44px;
  padding: 8px 12px;
  border: 3px solid var(--gold-deep);
  border-radius: var(--radius-card);
  background: linear-gradient(#fffef8, #fff3d8);
  background-blend-mode: normal;
  box-shadow: 0 3px 0 var(--shadow), inset 0 0 0 2px #fff8e0;
  color: var(--ink);
}

.pick-list button::before {
  display: none;
}

.pick-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  color: var(--copper);
}

.pick-list .qmark {
  min-width: 22px;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.pick-worker.rainbow {
  background: linear-gradient(#fffdf8, #ffe8f4);
}

.pick-worker.pink {
  background: linear-gradient(#fffdf8, #ffe4ef);
}

.pick-worker.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 3px 0 var(--shadow), inset 0 2px 4px rgba(90, 56, 20, 0.12);
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
