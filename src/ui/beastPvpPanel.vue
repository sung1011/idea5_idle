<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { workerMatchesWeakness } from '../sim/combatAttrs'
import { COMBAT_ATTR_LABEL } from '../sim/combatAttrs'
import { restCombatCandidates } from '../sim/combat'
import { beastHud, formatBeastDuration, takeBeastFx } from '../sim/beastPvp'
import { isFullWorkshopHp } from '../sim/workshopHp'
import type { Worker } from '../sim/types'
import ActButton from './actButton.vue'
import BeastIcon from './beastIcon.vue'
import CombatPickSheet from './combatPickSheet.vue'
import RankBoard from './rankBoard.vue'
import { useGameStore } from './gameStore'

const game = useGameStore()
const picked = ref<string[]>([])
const pickOpen = ref(false)
const staminaOpen = ref(false)
const flash = ref('')
let flashTimer = 0

const hud = computed(() => {
  void game.save.elapsedS
  void game.save.beastPvp?.hp
  void game.save.beastPvp?.fight?.elapsedMs
  void game.save.beastPvp?.fight?.cowerMs
  return beastHud(game.save, Date.now())
})

const candidates = computed(() => {
  const weakness = hud.value.weakness
  return [...restCombatCandidates(game.save)].sort((a, b) => {
    const am = workerMatchesWeakness(a.combatAttrs, [weakness]) ? 0 : 1
    const bm = workerMatchesWeakness(b.combatAttrs, [weakness]) ? 0 : 1
    return am - bm || a.id.localeCompare(b.id)
  })
})

const hpPct = computed(() => {
  if (hud.value.killed || hud.value.hpMax <= 0) return 0
  return Math.max(0, Math.min(100, (hud.value.hp / hud.value.hpMax) * 100))
})

const staminaPct = computed(() => Math.round((hud.value.stamina / hud.value.staminaMax) * 100))
const cowerSec = computed(() => Math.ceil(hud.value.cowerMs / 1000))
const cowerPct = computed(() =>
  hud.value.cowerTotalMs > 0 ? Math.max(0, Math.min(100, (hud.value.cowerMs / hud.value.cowerTotalMs) * 100)) : 0,
)
const staminaBubble = computed(() => {
  if (hud.value.stamina >= hud.value.staminaMax) return '已满'
  return `${formatBeastDuration(hud.value.staminaNextS)} 后 +1、${formatBeastDuration(hud.value.staminaFullS)} 后回满`
})

function markCounter(worker: Worker): string | null {
  return workerMatchesWeakness(worker.combatAttrs, [hud.value.weakness]) ? '克制' : null
}

function canSend(worker: Worker): boolean {
  return isFullWorkshopHp(worker) && hud.value.stamina >= hud.value.staminaCost
}

function openPick() {
  if (hud.value.killed || hud.value.fighting) return
  if (hud.value.stamina < hud.value.staminaCost) return
  picked.value = []
  pickOpen.value = true
}

function togglePick(worker: Worker) {
  if (picked.value.includes(worker.id)) picked.value = picked.value.filter((row) => row !== worker.id)
  else if (picked.value.length < 3) picked.value = [...picked.value, worker.id]
}

function confirmPick() {
  const ids = picked.value.slice()
  pickOpen.value = false
  picked.value = []
  if (!ids.length) return
  const result = game.startBeastFight(ids)
  if (result.ok) pulse('hit')
}

function pulse(kind: string) {
  flash.value = kind
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    flash.value = ''
  }, 280)
}

function onDodge() {
  const result = game.beastDodge()
  if (result.ok) pulse('dodge')
}

function onInterrupt() {
  const result = game.beastInterrupt()
  if (result.ok) pulse('break')
}

function onCower() {
  const result = game.beastCower()
  if (result.ok) pulse('cower-flash')
}

function pumpFx() {
  for (const fx of takeBeastFx()) pulse(fx.tone)
}

const fxTimer = window.setInterval(pumpFx, 120)

onUnmounted(() => {
  window.clearInterval(fxTimer)
  window.clearTimeout(flashTimer)
  game.settleBeastLeave()
})
</script>

<template>
  <div class="beast">
    <header class="beast-head" :class="flash">
      <BeastIcon class="mark" :kind="hud.kind" />
      <div>
        <h3>{{ hud.name }}</h3>
        <p>{{ hud.blurb }}</p>
      </div>
      <ActButton class="auto" icon="check" kind="minor" @click="game.setBeastAuto(!hud.auto)">
        {{ hud.auto ? '自动开' : '自动' }}
      </ActButton>
    </header>

    <div class="hp" :class="{ dead: hud.killed, near: hud.nearLine }">
      <div class="hp-fill" :style="{ width: `${hpPct}%` }" />
    </div>
    <p class="meta">
      <template v-if="hud.killed">已被猎杀 · 日结 {{ formatBeastDuration(hud.dayRemainS) }}</template>
      <template v-else>
        血量 {{ hud.hpText }} · 弱点 {{ COMBAT_ATTR_LABEL[hud.weakness] }}
        <span v-if="hud.nearLine"> · 接近阶段线</span>
      </template>
    </p>
    <p v-if="hud.telegraph" class="tele">
      {{ hud.telegraph.label }}
      <span class="tele-bar"><i :style="{ width: `${Math.round(hud.telegraph.ratio * 100)}%` }" /></span>
    </p>

    <ActButton
      v-if="!hud.fighting"
      icon="raid"
      kind="primary"
      tone="combat"
      :cost="`${hud.staminaCost} 体力`"
      :disabled="hud.killed || hud.stamina < hud.staminaCost"
      @click="openPick"
    >
      开始挑战
    </ActButton>

    <div v-if="hud.fighting" class="crew">
      <div v-for="row in hud.workers" :key="row.id" class="fighter">
        <b>{{ row.name }}</b>
        <span class="mini"><i :style="{ width: `${Math.max(0, Math.round((row.hp / Math.max(1, row.hpMax)) * 100))}%` }" /></span>
      </div>
    </div>

    <p v-if="hud.fighting && hud.cowerMs > 0" class="cower" role="status">
      <b>畏缩中</b>
      <span>受到的伤害 -50% · 打出的伤害 -30%</span>
      <strong>{{ cowerSec }} 秒</strong>
      <i class="cower-bar"><em :style="{ width: `${cowerPct}%` }" /></i>
    </p>

    <div v-if="hud.fighting" class="reacts">
      <ActButton icon="raid" kind="primary" tone="combat" :disabled="!hud.canInterrupt" @click="onInterrupt">打断</ActButton>
      <ActButton icon="shield" kind="primary" tone="combat" :disabled="!hud.canDodge" @click="onDodge">闪避</ActButton>
      <ActButton icon="cower" kind="primary" tone="combat" :disabled="!hud.canCower" @click="onCower">畏缩</ActButton>
    </div>
    <div v-if="!hud.fighting" class="stamina" :class="{ open: staminaOpen }">
      <button type="button" class="meter" :aria-expanded="staminaOpen" :aria-label="`困兽体力 ${hud.stamina}/${hud.staminaMax}`" @click="staminaOpen = !staminaOpen">
        <i class="fill" :style="{ width: `${staminaPct}%` }" />
        <span>体力 {{ hud.stamina }}/{{ hud.staminaMax }}</span>
      </button>
      <p v-if="staminaOpen" class="bubble">{{ staminaBubble }}</p>
    </div>

    <section class="board" aria-label="本组输出排行">
      <h3>本组输出 · 日结 {{ formatBeastDuration(hud.dayRemainS) }} · 你第 {{ hud.rank }} 名</h3>
      <RankBoard
        label="本组输出排行"
        :rows="hud.board.map((row) => ({
          id: row.id,
          name: row.name,
          avatarId: row.avatarId,
          rank: row.rank,
          score: row.damage,
          self: row.self,
        }))"
      />
    </section>

    <section class="recent" aria-label="最近">
      <h3>最近</h3>
      <p v-if="!hud.recent.length" class="empty">还没有人出手</p>
      <ul v-else>
        <li v-for="(row, index) in hud.recent" :key="`${row.atS}-${index}`">{{ row.text }}</li>
      </ul>
    </section>

    <CombatPickSheet
      :open="pickOpen"
      :max="3"
      :candidates="candidates"
      :picked="picked"
      :runes="{}"
      mode="start"
      title-text="派去困兽"
      confirm-text="开始挑战"
      note-text="最多 3 人。克制当前弱点的伤害翻倍。"
      :show-runes="false"
      :show-assist="false"
      :can-pick="canSend"
      :recommend-label="markCounter"
      @close="pickOpen = false"
      @confirm="confirmPick"
      @toggle="togglePick"
    />
  </div>
</template>

<style scoped>
.beast {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.beast-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.auto {
  margin-left: auto;
}
.beast-head.hit,
.beast-head.hurt,
.beast-head.break,
.beast-head.dodge,
.beast-head.cower-flash {
  animation: flash 280ms ease;
}
.mark {
  width: 48px;
  height: 48px;
  color: var(--ink);
}
.beast-head h3,
.board h3,
.recent h3 {
  margin: 0;
  font-size: 16px;
}
.beast-head p,
.meta,
.empty {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}
.hp,
.stam,
.mini,
.tele-bar {
  position: relative;
  overflow: hidden;
  height: 14px;
  border-radius: 999px;
  background: var(--bar-track);
  border: 2px solid var(--gold);
}
.hp-fill,
.stam-fill,
.mini i,
.tele-bar i {
  display: block;
  height: 100%;
  background: var(--danger);
}
.stam-fill {
  background: var(--copper);
}
.mini {
  height: 8px;
  border-width: 1px;
}
.mini i {
  background: var(--moss);
}
.hp.dead .hp-fill {
  width: 0 !important;
}
.stam span,
.tele {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink);
}
.stam {
  height: auto;
  background: transparent;
  border: none;
}
.stam-fill {
  height: 10px;
  border-radius: 999px;
}
.cower {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 4px 8px;
  align-items: center;
  margin: 0;
  padding: 8px 10px 10px;
  border: 2px solid #8a5a12;
  border-radius: 10px;
  background: linear-gradient(#fff6c8, #f0c14a);
  color: #4a2c08;
  font-size: 13px;
  font-weight: 800;
}
.cower strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.cower-bar {
  grid-column: 1 / -1;
  display: block;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(74, 44, 8, 0.18);
}
.cower-bar em {
  display: block;
  height: 100%;
  background: #8a3b12;
}
.reacts {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
.reacts :deep(button.act) {
  width: 100%;
}
.auto {
  align-self: flex-end;
}
.stamina {
  position: relative;
}
.meter {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 28px;
  overflow: hidden;
}
.meter .fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: var(--moss);
}
.meter span,
.bubble {
  position: relative;
  z-index: 1;
  font-size: 12px;
}
.bubble {
  margin: 4px 0 0;
}
.crew {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fighter {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
  align-items: center;
}
.recent ul {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}
.recent li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}
@keyframes flash {
  50% {
    filter: brightness(1.35);
  }
}
</style>
