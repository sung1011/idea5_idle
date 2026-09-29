<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { bankQty } from '../sim/bank'
import { formatMarchClock } from '../sim/encounters'
import { isWorkerInCombat, workerLiveStats } from '../sim/combat'
import { combatZoneRows, formatRemainClock, type CombatZoneRow } from '../sim/march'
import { workerXpProgress } from '../sim/workerLevel'
import CombatAttrRow from './combatAttrRow.vue'
import { potionInstallGroups } from '../sim/potionSlots'
import {
  CLASS_LABEL,
  FOOD_ITEM_IDS,
  ITEM_DEF,
  isPotionItemId,
  STATION_DEF,
  type FoodItemId,
} from '../sim/tables'
import {
  isStimActive,
  potionRemainS,
} from '../sim/potions'
import {
  isPotionHelpOpen,
  nextPotionHelp,
  POTION_EQUIP_HINT,
  potionHelpCopy,
  type PotionHelpKey,
} from './potionHelp'
import { foodHelpCopy, nextFoodHelp, REST_FOOD_HELP_ROWS, REST_FOOD_HELP_TITLE } from './foodHelp'
import ModeHelpSheet from './modeHelpSheet.vue'
import type { ItemId } from '../sim/types'
import {
  guideAlchemyCardFlash,
  guideFuseCue,
  guideFuseFlashStations,
  isGuideQuestFlash,
} from '../sim/guideQuest'
import { isStationUnlocked, stationLockedTip } from '../sim/stationUnlock'
import { pushFloatTip } from './floatTips'
import { potionEffectRemainRatio, potionEmptyAcquireTip, potionQtyRestocked } from './potionHotbar'
import { isWorkerEatFlashing, workerEatFlashText } from './workerEatFlash'
import { isWorkerLevelFlashing } from './workerLevelFlash'
import {
  announceWorkerStationEnters,
  isWorkerEntering,
  workerAssignSnapshot,
  workerEnterDelayMs,
} from './workerEnterFlash'
import { recruitCost } from '../sim/tech'
import { workerRaceLabel, workerRaceShortLabel } from '../sim/workerRace'
import type { CategoryId, PotionItemId, StationId, Worker } from '../sim/types'
import WorkerAvatar from './workerAvatar.vue'
import { openWorkshopStation } from './appNav'
import { stationCraftPickOptions, stationCraftPickReadonly } from './stationCraftLabel'
import StationDetailSheet from './stationDetailSheet.vue'
import StationMiniBar from './stationMiniBar.vue'
import { guideCampOpenRequest, guideCampSheetOpen, takeGuideCampOpenRequest } from './guideQuestNav'
import { showStationDetail, openStationDetailId } from './stationDetailNav'
import { isItemSourceStationFlash } from './itemSource'
import StationTips from './stationTips.vue'
import { dismissWorkshopBanter, greetWorkshopBanter, workshopBanterText } from './workshopBanter'
import { considerWorkerTutor, dismissWorkerTutor, hideWorkerTutor, workerTutorText } from './workerTutorTips'
import { useFrameNow } from './visualProgress'
import { useGameStore } from './gameStore'
import HpBar from './hpBar.vue'
import { hpBarFill, hpBarTone } from './hpBar'
import { workerWearHp } from '../sim/workshopHp'
import {
  canGoToAssignedWorkshop,
  workerAssignChoices,
  workerDutyLabel,
  workerShortName,
  workshopStationBoards,
} from './workerGroups'
import { REST_BLOCK_BADGE, REST_HEAD_BADGE, restQueueRows, restZoneTitle } from './restQueue'
import { restFoodBand, workshopQueueHead } from './workshopQueueHead'
import { formatAtkSpeed } from './formatAtkSpeed'
import FoodIcon from './foodIcon.vue'
import PotionIcon from './potionIcon.vue'
import UiIcon from './uiIcon.vue'
import UiSelect from './uiSelect.vue'
import { qualityOf, workerQualityDotStyle, workerQualityFrameStyle, workerQualityNameStyle } from './workerQuality'
import {
  canDragWorker,
  canDropWorker,
  dropTargetEquals,
  dropTargetFromDataset,
  FUSE_DRAG_TIP,
  MANUAL_DUTY_REASON,
  sameDragEndpoint,
  setWorkerDragActive,
  shouldShowFuseDragTip,
  shouldStartWorkerDrag,
  type WorkerDragSource,
  type WorkerDropTarget,
} from './workerDrag'

const game = useGameStore()
const showFuseDragTip = computed(() => shouldShowFuseDragTip(game.save))
const guideFlashRecruit = computed(() => isGuideQuestFlash(game.save, 'recruit'))
const guideFlashAutoHerb = computed(() => isGuideQuestFlash(game.save, 'autoHerb'))
const guideFlashRestFood = computed(() => isGuideQuestFlash(game.save, 'restFood'))
const guideFlashPotionInstall = computed(() => isGuideQuestFlash(game.save, 'potionInstall'))
const guideFlashPotionUse = computed(() => isGuideQuestFlash(game.save, 'potionUse'))
const frameNow = useFrameNow()
const restFoodOpen = ref(false)
const restFoodLabel = computed(() => {
  const id = game.save.restFoodId
  if (!id) return '未选伙食'
  return `${ITEM_DEF[id].label} ×${bankQty(game.save, id)}`
})
const foodBand = computed(() => {
  const id = game.save.restFoodId
  return restFoodBand(id, id ? bankQty(game.save, id) : 0)
})
const foodHelp = ref<FoodItemId | null>(null)
const foodHelpPos = ref({ left: 8, top: 8 })
const foodRuleOpen = ref(false)

function closeFoodHelp() {
  foodHelp.value = null
}

function closeRestFood() {
  restFoodOpen.value = false
  foodRuleOpen.value = false
  closeFoodHelp()
}

function onFoodHelp(ev: MouseEvent, id: FoodItemId) {
  ev.stopPropagation()
  const next = nextFoodHelp(foodHelp.value, id)
  foodHelp.value = next
  if (!next) return
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  foodHelpPos.value = {
    left: Math.min(window.innerWidth - 228, Math.max(8, rect.left)),
    top: Math.min(window.innerHeight - 120, rect.bottom + 6),
  }
}

const foodHelpBubble = computed(() => {
  const id = foodHelp.value
  if (!id) return null
  return foodHelpCopy(id, bankQty(game.save, id))
})

function onPickRestFood(itemId: FoodItemId | null) {
  closeFoodHelp()
  game.selectRestFood(itemId)
  closeRestFood()
}
const selectedId = ref<string | null>(null)
const pickId = ref<string | null>(null)
const pickPotionIndex = ref<number | null>(null)

const boards = computed(() => workshopStationBoards(game.save))
const fightingRoster = computed(() =>
  combatZoneRows(game.save, frameNow.value)
    .map((row) => {
      const worker = game.save.workers.find((item) => item.id === row.workerId)
      return worker ? { worker, row } : null
    })
    .filter((item): item is { worker: Worker; row: CombatZoneRow } => !!item),
)
const restRows = computed(() => restQueueRows(game.save))
const queueHead = computed(() => workshopQueueHead(game.save))
const restOpen = ref(false)
const combatOpen = ref(false)
const statusBandEl = ref<HTMLElement | null>(null)
const combatFits = ref(true)
let bandObserver: ResizeObserver | null = null
const shownRest = computed(() => restOpen.value)
const shownCombat = computed(() => combatOpen.value && fightingRoster.value.length > 0)
const campSheetShown = computed(() => shownRest.value && !shownCombat.value)
const fuseCue = computed(() => guideFuseCue(game.save, campSheetShown.value))
const fuseStations = computed(() => guideFuseFlashStations(game.save, campSheetShown.value))
const alchemyCardFlash = computed(() => guideAlchemyCardFlash(game.save, 'alchemy', openStationDetailId.value))
const rosterFaceSize = computed(() => (shownRest.value || shownCombat.value ? 'md' : 'sm'))
watch(
  () => fightingRoster.value.length,
  (n) => {
    if (!n) combatOpen.value = false
  },
)
function openCampSheet() {
  combatOpen.value = false
  restOpen.value = true
}
function syncGuideCampRequest() {
  if (!takeGuideCampOpenRequest()) return
  openCampSheet()
}
watch(guideCampOpenRequest, syncGuideCampRequest)
watch(campSheetShown, (open) => {
  guideCampSheetOpen.value = open
}, { immediate: true })
function toggleRest() {
  if (campSheetShown.value) {
    restOpen.value = false
    return
  }
  openCampSheet()
}
function toggleCombat() {
  if (shownCombat.value) {
    combatOpen.value = false
    return
  }
  restOpen.value = false
  combatOpen.value = true
}
function measureCombatFit() {
  const band = statusBandEl.value
  if (!band || fightingRoster.value.length === 0 || band.clientWidth <= 0) {
    if (fightingRoster.value.length === 0) combatFits.value = true
    return
  }
  const measure = band.querySelector<HTMLElement>('[data-combat-measure]')
  const chipW = measure?.offsetWidth ?? 0
  let fixed = 0
  for (const child of Array.from(band.children) as HTMLElement[]) {
    if (child.hasAttribute('data-combat-measure') || child.hasAttribute('data-combat-toggle')) continue
    if (child.classList.contains('band-head')) continue
    fixed += child.offsetWidth
  }
  const headMin = 88
  const gaps = 4 * 4
  combatFits.value = fixed + headMin + chipW + gaps <= band.clientWidth + 1
}
function queueMeasureCombatFit() {
  void nextTick(measureCombatFit)
}
const recruitPrice = computed(() => recruitCost(game.save))
watch(
  () => `${fightingRoster.value.length}|${restRows.value.length}|${restFoodLabel.value}|${recruitPrice.value}|${queueHead.value.kind === 'worker' ? queueHead.value.id : ''}`,
  () => queueMeasureCombatFit(),
)
const canRecruit = computed(() => game.save.diamonds >= recruitPrice.value)
const selected = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return game.save.workers.find((w) => w.id === id) ?? null
})
const picking = computed(() => {
  const id = pickId.value
  if (!id) return null
  return game.save.workers.find((w) => w.id === id) ?? null
})
const pickChoices = computed(() => (picking.value ? workerAssignChoices(game.save, picking.value) : []))

function fighting(w: Worker) {
  return isWorkerInCombat(game.save, w.id)
}

function combatTail(w: Worker) {
  const stats = workerLiveStats(w, game.save)
  const xp = workerXpProgress(w)
  return `Lv${w.level} · ATK ${stats.atk} · 攻速 ${formatAtkSpeed(stats.spd)} · XP ${xp.xp}/${xp.need}`
}

const potionSlots = computed(() => game.save.potionSlots)
const potionBuffLine = computed(() => {
  const save = game.save
  const t = save.elapsedS
  const parts: string[] = []
  if (isStimActive(save)) parts.push(`嗜血 ${formatMarchClock(potionRemainS(save.potionBuffs.stimUntil, t))}`)
  if (save.potionBuffs.renewUntil != null && t < save.potionBuffs.renewUntil) {
    parts.push(`先祖 ${formatMarchClock(potionRemainS(save.potionBuffs.renewUntil, t))}`)
  }
  const mist = save.potionBuffs.doubleMist
  if (mist) parts.push(`双份雾 ${STATION_DEF[mist.stationId].label} ×${mist.mul}`)
  if (save.potionBuffs.rushStation) {
    parts.push(`赶工 ${STATION_DEF[save.potionBuffs.rushStation].label}`)
  }
  return parts.join(' · ')
})
const potionPickGroups = computed(() => potionInstallGroups(game.save))

function potionSlotQty(id: PotionItemId | null) {
  return id ? bankQty(game.save, id) : 0
}

const potionPressed = ref<number[]>([])
const potionRestock = ref<number[]>([])
const potionPressTimers = new Map<number, ReturnType<typeof setTimeout>>()
let potionQtySnap: { id: PotionItemId | null; qty: number }[] | null = null

function potionRemainRatio(itemId: PotionItemId | null) {
  return potionEffectRemainRatio({
    itemId,
    elapsedS: game.save.elapsedS,
    lastTick: game.save.lastTick,
    now: frameNow.value,
    buffs: game.save.potionBuffs,
  })
}

function potionHaloStyle(itemId: PotionItemId | null) {
  return { '--remain': potionRemainRatio(itemId).toFixed(4) }
}

watch(
  () => potionSlots.value.map((id) => ({ id, qty: potionSlotQty(id) })),
  (rows) => {
    if (!potionQtySnap) {
      potionQtySnap = rows.map((row) => ({ id: row.id, qty: row.qty }))
      return
    }
    const prev = potionQtySnap
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    rows.forEach((row, index) => {
      const before = prev[index]
      const same = !!before && before.id != null && before.id === row.id
      if (reduced || !potionQtyRestocked(before?.qty ?? 0, row.qty, same)) return
      potionRestock.value = potionRestock.value.filter((slot) => slot !== index)
      void nextTick(() => {
        if (!potionRestock.value.includes(index)) potionRestock.value = [...potionRestock.value, index]
      })
    })
    potionQtySnap = rows.map((row) => ({ id: row.id, qty: row.qty }))
  },
  { immediate: true },
)

function onPotionRestockEnd(index: number, ev: AnimationEvent) {
  if (!ev.animationName.includes('potion-breathe')) return
  potionRestock.value = potionRestock.value.filter((slot) => slot !== index)
}

function onPotionPointerDown(index: number, ev: PointerEvent) {
  const target = ev.target
  if (target instanceof Element && target.closest('.potion-help')) return
  const pending = potionPressTimers.get(index)
  if (pending) clearTimeout(pending)
  potionPressed.value = potionPressed.value.filter((slot) => slot !== index)
  void nextTick(() => {
    if (!potionPressed.value.includes(index)) potionPressed.value = [...potionPressed.value, index]
  })
  potionPressTimers.set(
    index,
    setTimeout(() => {
      potionPressed.value = potionPressed.value.filter((slot) => slot !== index)
      potionPressTimers.delete(index)
    }, 220),
  )
}

const potionHelp = ref<PotionHelpKey | null>(null)
const potionHelpPos = ref({ left: 8, top: 8 })

function closePotionHelp() {
  potionHelp.value = null
}

function onPotionHelp(ev: MouseEvent, source: PotionHelpKey['source'], id: PotionItemId, index?: number) {
  ev.stopPropagation()
  const next = nextPotionHelp(potionHelp.value, source === 'slot' ? { source, id, index } : { source, id })
  potionHelp.value = next
  if (!next) return
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  potionHelpPos.value = {
    left: Math.min(window.innerWidth - 228, Math.max(8, rect.left)),
    top: Math.min(window.innerHeight - 120, rect.bottom + 6),
  }
}

const canUnequipPotionHelp = computed(() => {
  const key = potionHelp.value
  if (!key || key.source !== 'slot' || key.index == null) return false
  return game.save.potionSlots[key.index] != null
})

function onUnequipPotionHelp() {
  const key = potionHelp.value
  if (!key || key.source !== 'slot' || key.index == null) return
  game.clearPotionSlot(key.index)
  closePotionHelp()
}

function onDocPotionHelp(ev: PointerEvent) {
  const el = ev.target
  if (!(el instanceof Element)) return
  if (!(el.closest('[data-potion-help]') || el.closest('[data-potion-bubble]'))) closePotionHelp()
  if (!(el.closest('[data-food-help]') || el.closest('[data-food-bubble]'))) closeFoodHelp()
  if (
    el.closest('[data-rest-pop]') ||
    el.closest('[data-rest-toggle]') ||
    el.closest('[data-combat-pop]') ||
    el.closest('[data-combat-toggle]')
  ) {
    return
  }
  if (!shownRest.value && !shownCombat.value) return
  restOpen.value = false
  combatOpen.value = false
}

const potionHelpBubble = computed(() => {
  const key = potionHelp.value
  if (!key) return null
  return potionHelpCopy(key.id, key.source === 'slot' ? bankQty(game.save, key.id) : undefined)
})

function onPotionSlot(index: number) {
  const id = game.save.potionSlots[index]
  closePotionHelp()
  if (!id) {
    pickPotionIndex.value = index
    return
  }
  if (potionSlotQty(id) <= 0) {
    pushFloatTip(potionEmptyAcquireTip(id), 'err')
    return
  }
  game.usePotionSlot(index)
}

function onInstallPotion(itemId: PotionItemId) {
  const index = pickPotionIndex.value
  if (index == null) return
  closePotionHelp()
  const result = game.installPotion(index, itemId)
  if (result.ok) pickPotionIndex.value = null
}

function closePotionPick() {
  pickPotionIndex.value = null
  closePotionHelp()
}

function jobLabel(w: Worker) {
  return w.classId ? CLASS_LABEL[w.classId] : '未标'
}

function raceLabel(w: Worker) {
  return workerRaceLabel(w.race)
}

function raceShortLabel(w: Worker) {
  return workerRaceShortLabel(w.race)
}

function sheetMeta(w: Worker) {
  return `${qualityOf(w).label} · ${jobLabel(w)} · Lv${w.level} · ${workerDutyLabel(game.save, w)}`
}

function hpFillStyle(w: Worker) {
  return { width: `${(hpBarFill(workerWearHp(w), w.hpMax) * 100).toFixed(2)}%` }
}

function hpToneClass(w: Worker) {
  return `hp-${hpBarTone(workerWearHp(w), w.hpMax)}`
}

function openSheet(w: Worker) {
  game.clearWorkerNew(w.id)
  selectedId.value = w.id
}

function closeSheet() {
  selectedId.value = null
}

function openPick(w: Worker) {
  pickId.value = w.id
}

function closePick() {
  pickId.value = null
}

function goWorkshop() {
  const w = picking.value
  if (!w?.assignment) return
  openWorkshopStation(w.assignment)
  closePick()
}

function openStationDetail(stationId: StationId) {
  if (!isStationUnlocked(game.save, stationId)) {
    pushFloatTip(stationLockedTip(stationId))
    return
  }
  showStationDetail(stationId)
}

function onStationCardClick(ev: MouseEvent, stationId: StationId) {
  const target = ev.target
  if (target instanceof Element) {
    const slot = target.closest('.slot')
    if (slot && !slot.classList.contains('empty')) return
  }
  openStationDetail(stationId)
}

function closeStationDetail() {
  showStationDetail(null)
}

function onPickStation(stationId: StationId | null) {
  const w = picking.value
  if (!w) return
  if (stationId == null || w.assignment == null) {
    pushFloatTip(MANUAL_DUTY_REASON)
    return
  }
  if (!isStationUnlocked(game.save, stationId)) {
    pushFloatTip(stationLockedTip(stationId))
    return
  }
  const result = game.assign(w.id, stationId)
  if (result.ok) closePick()
  else if (result.reason) pushFloatTip(result.reason)
}

function stationLocked(stationId: StationId) {
  return !isStationUnlocked(game.save, stationId)
}

function potionSlotLabel(itemId: ItemId | null) {
  if (!itemId || !isPotionItemId(itemId)) return '空'
  return `${ITEM_DEF[itemId].label} ×${bankQty(game.save, itemId)}`
}

function openSheetThenPick(w: Worker) {
  closeSheet()
  openPick(w)
}

type DragSession = {
  workerId: string
  name: string
  source: WorkerDragSource | null
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  pointerId: number
  over: WorkerDropTarget | null
}

const drag = ref<DragSession | null>(null)

function sourceOf(w: Worker, stationId: StationId | null, slotIndex: number | null): WorkerDragSource | null {
  if (stationId && slotIndex != null) {
    if (!canDragWorker(game.save, w.id)) return null
    return { kind: 'slot', workerId: w.id, stationId, slotIndex }
  }
  if (w.assignment === null) return { kind: 'rest', workerId: w.id }
  return null
}

function unbindDrag() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

function hitTarget(x: number, y: number): WorkerDropTarget | null {
  const el = document.elementFromPoint(x, y)
  const node = el instanceof Element ? el.closest('[data-drop]') : null
  return node instanceof HTMLElement ? dropTargetFromDataset(node.dataset) : null
}

function onWorkerPointerDown(ev: PointerEvent, w: Worker, stationId: StationId | null, slotIndex: number | null) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return
  unbindDrag()
  drag.value = {
    workerId: w.id,
    name: workerShortName(w),
    source: sourceOf(w, stationId, slotIndex),
    startX: ev.clientX,
    startY: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    active: false,
    pointerId: ev.pointerId,
    over: null,
  }
  window.addEventListener('pointermove', onDragMove, { passive: false })
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(ev: PointerEvent) {
  const session = drag.value
  if (!session || session.pointerId !== ev.pointerId) return
  session.x = ev.clientX
  session.y = ev.clientY
  if (!session.active) {
    if (!session.source) return
    if (!canDragWorker(game.save, session.workerId)) return
    const dx = session.x - session.startX
    const dy = session.y - session.startY
    if (!shouldStartWorkerDrag(session.source, dx, dy)) return
    session.active = true
    setWorkerDragActive(true)
    game.clearWorkerNew(session.workerId)
    const handle = ev.target
    if (handle instanceof Element && handle.setPointerCapture) {
      try {
        handle.setPointerCapture(ev.pointerId)
      } catch {
        // already released
      }
    }
  }
  ev.preventDefault()
  session.over = hitTarget(ev.clientX, ev.clientY)
}

function onDragEnd(ev: PointerEvent) {
  const session = drag.value
  if (!session || session.pointerId !== ev.pointerId) return
  unbindDrag()
  const worker = game.save.workers.find((row) => row.id === session.workerId) ?? null
  const source = session.source
  const over = session.over ?? hitTarget(ev.clientX, ev.clientY)
  const wasActive = session.active
  drag.value = null
  setWorkerDragActive(false)
  if (wasActive) {
    if (source && over && !sameDragEndpoint(source, over)) game.dragAssign(source, over)
    return
  }
  if (source?.kind === 'slot') return
  if (source?.kind === 'rest') return
  if (worker) openSheet(worker)
}

function slotDropClass(stationId: StationId, slotIndex: number): string {
  const session = drag.value
  if (!session?.active || !session.source) return ''
  const target: WorkerDropTarget = { kind: 'slot', stationId, slotIndex }
  if (canDropWorker(game.save, session.source, target)) return 'drop-ok'
  if (dropTargetEquals(session.over, target)) return 'drop-no'
  return ''
}

function restDropClass(): string {
  const session = drag.value
  if (!session?.active || !session.source) return ''
  const target: WorkerDropTarget = { kind: 'rest' }
  if (canDropWorker(game.save, session.source, target)) return 'drop-ok'
  if (dropTargetEquals(session.over, target)) return 'drop-no'
  return ''
}

function restWorkerDropClass(workerId: string): string {
  const session = drag.value
  if (!session?.active || !session.source) return ''
  const target: WorkerDropTarget = { kind: 'restWorker', workerId }
  if (canDropWorker(game.save, session.source, target)) return 'drop-ok'
  if (dropTargetEquals(session.over, target)) return 'drop-no'
  return ''
}

function onCraftCategory(stationId: StationId, value: string) {
  const row = stationCraftPickOptions(game.save, stationId).find((opt) => opt.value === value)
  if (!row || row.disabled) return
  game.selectCategory(stationId, value as CategoryId)
}

function banterLine(workerId: string): string {
  return workshopBanterText(workerId)
}

function tutorLine(workerId: string): string {
  return workerTutorText(workerId)
}

function onDismissTutor() {
  dismissWorkerTutor(Date.now())
}

watch(openStationDetailId, (id) => {
  if (id && !isStationUnlocked(game.save, id)) showStationDetail(null)
})

let assignBefore = workerAssignSnapshot(game.save.workers)
watch(
  () => game.save.workers,
  (workers) => {
    announceWorkerStationEnters(assignBefore, workers)
    assignBefore = workerAssignSnapshot(workers)
  },
)

function stationAvatarStyle(worker: Worker) {
  if (!isWorkerEntering(worker.id)) return undefined
  return {
    '--enter-delay': `${workerEnterDelayMs(worker.id)}ms`,
    '--enter-edge': workerQualityFrameStyle(worker.qualityTier).borderColor,
  }
}

let tutorTimer = 0
function refreshTutor() {
  considerWorkerTutor(game.save, Date.now(), Math.random, campSheetShown.value)
}
onMounted(() => {
  syncGuideCampRequest()
  document.addEventListener('pointerdown', onDocPotionHelp, true)
  greetWorkshopBanter(game.save)
  refreshTutor()
  tutorTimer = window.setInterval(refreshTutor, 1000)
  if (statusBandEl.value) {
    bandObserver = new ResizeObserver(() => measureCombatFit())
    bandObserver.observe(statusBandEl.value)
  }
  queueMeasureCombatFit()
})
onUnmounted(() => {
  guideCampSheetOpen.value = false
  unbindDrag()
  setWorkerDragActive(false)
  dismissWorkshopBanter()
  window.clearInterval(tutorTimer)
  hideWorkerTutor()
  bandObserver?.disconnect()
  document.removeEventListener('pointerdown', onDocPotionHelp, true)
  for (const timer of potionPressTimers.values()) clearTimeout(timer)
  potionPressTimers.clear()
})
</script>

<template>
  <section
    class="panel roster-v2"
    :class="{
      dragging: drag?.active,
      'sheet-rest': shownRest && !shownCombat,
      'sheet-combat': shownCombat,
    }"
  >
    <div class="board">
      <section class="col workshop" aria-label="在工坊">
        <p v-if="showFuseDragTip" class="fuse-drag-tip" role="status">{{ FUSE_DRAG_TIP }}</p>
        <div class="station-list">
          <article
            v-for="board in boards"
            :key="board.stationId"
            class="station"
            :class="{
              locked: stationLocked(board.stationId),
              closed: game.save.stations[board.stationId].closed,
              'guide-flash':
                isItemSourceStationFlash(board.stationId) ||
                (guideFlashAutoHerb && board.stationId === 'herbalism') ||
                (alchemyCardFlash && board.stationId === 'alchemy') ||
                fuseStations.includes(board.stationId),
            }"
            @click="onStationCardClick($event, board.stationId)"
          >
            <StationTips :station-id="board.stationId" />
            <div class="station-rail">
              <div class="station-name">
                <UiIcon :name="board.stationId" />
                <b>{{ board.label }}</b>
              </div>
              <button
                type="button"
                class="station-detail"
                :aria-label="`查看${board.label}详情`"
                @click.stop="openStationDetail(board.stationId)"
              >
                详情
              </button>
            </div>
            <div class="station-work">
              <div class="slots">
                <button
                  v-for="(w, i) in board.slots"
                  :key="`${board.stationId}-${i}`"
                  type="button"
                  class="slot"
                  :class="[
                    {
                      empty: !w,
                      'level-flash': !!w && isWorkerLevelFlashing(w.id),
                      'enter-slot': !!w && isWorkerEntering(w.id),
                      'has-banter': !!w && banterLine(w.id),
                      'has-tutor': !!w && tutorLine(w.id),
                    },
                    w ? hpToneClass(w) : '',
                    slotDropClass(board.stationId, i),
                  ]"
                  :data-drop="'slot'"
                  :data-station="board.stationId"
                  :data-slot="i"
                  :aria-label="w ? `${workerShortName(w)} ${sheetMeta(w)}` : `${board.label}空岗`"
                  @pointerdown="w ? onWorkerPointerDown($event, w, board.stationId, i) : undefined"
                >
                  <i v-if="w" class="hp-fill" :style="hpFillStyle(w)" aria-hidden="true" />
                  <template v-if="w">
                    <span v-if="banterLine(w.id)" class="banter" role="status">{{ banterLine(w.id) }}</span>
                    <span
                      v-if="tutorLine(w.id)"
                      class="tutor-tip"
                      role="button"
                      tabindex="0"
                      :aria-label="`关掉教程：${tutorLine(w.id)}`"
                      @pointerdown.stop
                      @click.stop="onDismissTutor"
                      @keydown.enter.stop.prevent="onDismissTutor"
                      @keydown.space.stop.prevent="onDismissTutor"
                    >{{ tutorLine(w.id) }}</span>
                    <WorkerAvatar
                      class="worker-avatar"
                      :class="{ 'enter-land': isWorkerEntering(w.id) }"
                      :style="stationAvatarStyle(w)"
                      size="lg"
                      :show-new="!!w.isNew"
                      :race="w.race"
                      :quality="w.qualityTier"
                      :worker-id="w.id"
                    />
                    <span class="slot-main">
                      <b>
                        <i class="qdot" :style="workerQualityDotStyle(w.qualityTier)" />
                        <em :style="workerQualityNameStyle(w)">{{ workerShortName(w) }}</em>
                        <i v-if="raceShortLabel(w)" class="race-tag">{{ raceShortLabel(w) }}</i>
                      </b>
                      <small>Lv{{ w.level }}</small>
                    </span>
                  </template>
                  <template v-else>
                    <span class="empty-lab">空</span>
                  </template>
                </button>
              </div>
              <div class="station-craft-row">
                <UiSelect
                  class="station-craft-pick"
                  :model-value="game.save.stations[board.stationId].selectedCategory"
                  :options="stationCraftPickOptions(game.save, board.stationId)"
                  :disabled="stationCraftPickReadonly(game.save, board.stationId)"
                  :aria-label="`${board.label}产出`"
                  @update:model-value="onCraftCategory(board.stationId, $event)"
                />
                <StationMiniBar class="station-progress" :station-id="board.stationId" />
              </div>
            </div>
          </article>
        </div>
      </section>
      <div
        class="col side"
        :data-rest-pop="(shownRest && !shownCombat) || undefined"
        :data-combat-pop="shownCombat || undefined"
      >
        <section class="zone combat" :class="{ empty: !fightingRoster.length }" aria-label="战斗区" data-combat-pop>
          <header class="zone-head">战斗区 · {{ fightingRoster.length }}</header>
          <p v-if="!fightingRoster.length" class="empty-combat">无人出战</p>
          <div v-if="fightingRoster.length" class="zone-list">
            <div
              v-for="item in fightingRoster"
              :key="item.worker.id"
              class="rest-row march-row"
              :class="[hpToneClass(item.worker), `tone-${item.row.tone}`, { 'level-flash': isWorkerLevelFlashing(item.worker.id) }]"
            >
              <i class="hp-fill" :style="hpFillStyle(item.worker)" aria-hidden="true" />
              <button
                type="button"
                class="rest-face"
                :aria-label="`战斗区 ${workerShortName(item.worker)} ${item.row.label}`"
                @pointerdown="onWorkerPointerDown($event, item.worker, null, null)"
              >
                <WorkerAvatar
                  :size="rosterFaceSize"
                  :show-new="!!item.worker.isNew"
                  :race="item.worker.race"
                  :quality="item.worker.qualityTier"
                  :worker-id="item.worker.id"
                />
                <b class="rest-name" :style="workerQualityNameStyle(item.worker)">{{ workerShortName(item.worker) }}</b>
                <i v-if="raceShortLabel(item.worker)" class="race-tag">{{ raceShortLabel(item.worker) }}</i>
                <i class="march-tag">{{ item.row.label }}<template v-if="item.row.tone !== 'fight'"> {{ formatRemainClock(item.row.remainS) }}</template></i>
                <i v-if="item.row.tone !== 'fight'" class="march-bar" aria-hidden="true"><b :style="{ width: `${Math.round(item.row.progress * 100)}%` }" /></i>
              </button>
              <button
                type="button"
                class="rest-go"
                :aria-label="`${workerShortName(item.worker)} 详情`"
                @pointerdown.stop
                @click="openSheet(item.worker)"
              >
                ›
              </button>
            </div>
          </div>
        </section>
        <section
          class="zone rest"
          :class="[restDropClass(), { 'guide-flash': fuseCue === 'drag' }]"
          aria-label="营地"
          data-drop="rest"
          data-rest-pop
        >
          <header class="zone-head">{{ restZoneTitle(restRows.length) }}</header>
          <button
            v-if="fightingRoster.length && !combatFits"
            type="button"
            class="rest-combat-entry"
            data-combat-toggle
            :aria-pressed="shownCombat"
            aria-label="展开战斗区"
            @click.stop="toggleCombat"
          >
            战斗 {{ fightingRoster.length }}
          </button>
          <div v-if="restRows.length" class="zone-list rest-list">
            <div
              v-for="row in restRows"
              :key="row.id"
              class="rest-row"
              :class="[
                hpToneClass(row.worker),
                restWorkerDropClass(row.id),
                {
                  'level-flash': isWorkerLevelFlashing(row.id),
                  'eat-flash': isWorkerEatFlashing(row.id),
                  'has-tutor': tutorLine(row.id),
                  'queue-ready': row.badge === REST_HEAD_BADGE,
                  'queue-blocked': row.badge === '堵队',
                  'queue-dim': row.dim,
                  'guide-flash': guideFlashAutoHerb && row.order === 1,
                },
              ]"
              data-drop="rest-worker"
              :data-worker="row.id"
            >
              <i class="hp-fill" :style="hpFillStyle(row.worker)" aria-hidden="true" />
              <button
                type="button"
                class="rest-face"
                :aria-label="`${row.order}${row.badge ? ' ' + row.badge : ''} 拖动派驻 ${workerShortName(row.worker)}`"
                @pointerdown="onWorkerPointerDown($event, row.worker, null, null)"
              >
                <span class="rest-queue">
                  <span class="rest-order">{{ row.order }}</span>
                  <i v-if="row.badge" class="rest-badge">{{ row.badge }}</i>
                </span>
                <WorkerAvatar
                  :size="rosterFaceSize"
                  :show-new="!!row.worker.isNew"
                  :race="row.worker.race"
                  :quality="row.worker.qualityTier"
                  :worker-id="row.worker.id"
                />
                <em v-if="workerEatFlashText(row.id)" class="eat-float">{{ workerEatFlashText(row.id) }}</em>
                <b class="rest-name" :style="workerQualityNameStyle(row.worker)">{{ workerShortName(row.worker) }}</b>
                <i v-if="raceShortLabel(row.worker)" class="race-tag">{{ raceShortLabel(row.worker) }}</i>
              </button>
              <button
                v-if="tutorLine(row.id)"
                type="button"
                class="tutor-tip"
                :aria-label="`关掉教程：${tutorLine(row.id)}`"
                @pointerdown.stop
                @click.stop="onDismissTutor"
              >
                {{ tutorLine(row.id) }}
              </button>
              <button
                type="button"
                class="rest-go"
                :aria-label="`${workerShortName(row.worker)} 详情`"
                @pointerdown.stop
                @click="openSheet(row.worker)"
              >
                ›
              </button>
            </div>
          </div>
          <p v-else class="empty-rest">无人</p>
        </section>
      </div>
    </div>
    <section ref="statusBandEl" class="status-band" aria-label="工坊状态">
      <div
        v-if="queueHead.kind === 'worker'"
        class="queue-head band-head"
        :class="{ 'guide-flash': guideFlashAutoHerb, 'has-tutor': !campSheetShown && tutorLine(queueHead.id) }"
        role="status"
        :aria-label="`${queueHead.title} 血量 ${queueHead.hpLabel}`"
      >
        <button
          v-if="!campSheetShown && tutorLine(queueHead.id)"
          type="button"
          class="tutor-tip"
          :aria-label="`关掉教程：${tutorLine(queueHead.id)}`"
          @pointerdown.stop
          @click.stop="onDismissTutor"
        >
          {{ tutorLine(queueHead.id) }}
        </button>
        <WorkerAvatar
          class="queue-avatar"
          size="md"
          :race="queueHead.worker.race"
          :quality="queueHead.worker.qualityTier"
          :worker-id="queueHead.worker.id"
        />
        <span class="queue-copy">
          <b class="queue-name">{{ queueHead.title }}</b>
          <span class="queue-hp">
            <span class="queue-bar" :class="hpToneClass(queueHead.worker)">
              <i :style="hpFillStyle(queueHead.worker)" />
            </span>
            <em class="queue-hp-num">{{ queueHead.hpLabel }}</em>
          </span>
        </span>
      </div>
      <p v-else class="queue-empty band-head">队列空</p>
      <button
        type="button"
        class="band-tile band-rest"
        data-rest-toggle
        :class="{ 'guide-flash': fuseCue === 'openCamp' }"
        :aria-pressed="shownRest && !shownCombat"
        aria-label="展开营地"
        @click="toggleRest"
      >
        <svg class="tile-ico" viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M2 11.2H14V13.2H2Z" />
          <path fill="currentColor" d="M3 8.2H7.2V11.2H3Z" />
          <path fill="currentColor" d="M7 6.4H13.2V11.2H7Z" />
          <path fill="currentColor" d="M8.2 4.2H10.4V6.4H8.2Z" />
        </svg>
        <span class="cap">营地 {{ restRows.length }}</span>
        <i v-if="restRows.length" class="tile-badge">{{ restRows.length }}</i>
      </button>
      <button
        type="button"
        class="band-tile band-food"
        :class="{ low: foodBand.low, 'guide-flash': guideFlashRestFood }"
        :aria-label="`营地伙食 · ${restFoodLabel}`"
        @click="restFoodOpen = true"
      >
        <FoodIcon v-if="foodBand.itemId" :name="foodBand.itemId" />
        <svg v-else class="tile-ico" viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M1.6 8.2H14.4V9.6H1.6Z" />
          <path fill="currentColor" d="M3.4 9.4H12.6V12.6H3.4Z" />
        </svg>
        <span class="cap">{{ foodBand.caption }}</span>
      </button>
      <button
        type="button"
        class="band-recruit"
        :class="{ off: !canRecruit, 'guide-flash': guideFlashRecruit || fuseCue === 'recruit' }"
        :disabled="!canRecruit"
        :aria-label="`抽苦工 · ${recruitPrice} 钻`"
        @click="game.recruit()"
      >
        <span>抽苦工</span>
        <small>· {{ recruitPrice }} 钻</small>
      </button>
      <button
        v-if="fightingRoster.length && combatFits"
        type="button"
        class="band-combat"
        data-combat-toggle
        :class="{ on: shownCombat }"
        :aria-pressed="shownCombat"
        aria-label="展开战斗区"
        @click="toggleCombat"
      >
        战斗 {{ fightingRoster.length }}
      </button>
      <span v-if="fightingRoster.length" class="band-combat band-combat-measure" data-combat-measure aria-hidden="true">战斗 {{ fightingRoster.length }}</span>
    </section>
    <div class="potion-dock">
      <div class="potion-row" aria-label="药剂技能槽">
        <button
          v-for="(itemId, i) in potionSlots"
          :key="`potion-${i}`"
          type="button"
          class="potion-slot"
          :class="{
            empty: !itemId,
            dry: !!itemId && potionSlotQty(itemId) <= 0,
            pressed: potionPressed.includes(i),
            restock: potionRestock.includes(i),
            'guide-flash': (!itemId && guideFlashPotionInstall) || (!!itemId && guideFlashPotionUse),
          }"
          :aria-label="itemId ? `${potionSlotLabel(itemId)} · 点击使用` : `装入药剂槽 ${i + 1}`"
          @pointerdown="onPotionPointerDown(i, $event)"
          @click="onPotionSlot(i)"
          @animationend="onPotionRestockEnd(i, $event)"
        >
          <template v-if="itemId">
            <span
              v-if="potionRemainRatio(itemId) > 0"
              class="potion-halo"
              :style="potionHaloStyle(itemId)"
              aria-hidden="true"
            />
            <PotionIcon :name="itemId" />
            <span class="potion-name">{{ ITEM_DEF[itemId].label }}</span>
            <span class="potion-qty">{{ potionSlotQty(itemId) }}</span>
            <span
              class="potion-help"
              data-potion-help
              role="button"
              :aria-pressed="isPotionHelpOpen(potionHelp, 'slot', itemId, i)"
              :aria-label="`查看 ${ITEM_DEF[itemId].label} 效果`"
              @click.stop="onPotionHelp($event, 'slot', itemId, i)"
            >i</span>
          </template>
          <template v-else>
            <span class="potion-vacant" aria-hidden="true"></span>
          </template>
        </button>
      </div>
      <p v-if="potionBuffLine" class="potion-buffs">{{ potionBuffLine }}</p>
    </div>
    <Teleport to="body">
      <div v-if="drag?.active" class="drag-ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }">
        {{ drag.name }}
      </div>
    </Teleport>
  </section>

  <Teleport to="body">
    <div
      v-if="selected"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="workerShortName(selected)"
      @click.self="closeSheet"
    >
      <div class="sheet">
        <header>
          <h2 class="title">
            {{ workerShortName(selected) }}
            <i v-if="raceLabel(selected)" class="race-tag">{{ raceLabel(selected) }}</i>
          </h2>
          <button type="button" class="close" @click="closeSheet">关闭</button>
        </header>
        <p class="meta">{{ sheetMeta(selected) }}</p>
        <HpBar class="hp-slot" :hp="selected.hp" :hp-max="selected.hpMax" />
        <p class="hint">{{ combatTail(selected) }}<template v-if="fighting(selected)"> · 战斗中</template></p>
        <p class="attrs">
          <CombatAttrRow :attrs="selected.combatAttrs" />
        </p>
        <div class="sheet-actions">
          <button type="button" class="go" @click="openSheetThenPick(selected)">派驻</button>
        </div>
      </div>
    </div>
  </Teleport>

  <StationDetailSheet
    v-if="openStationDetailId"
    :station-id="openStationDetailId"
    @close="closeStationDetail"
    @open-worker="openSheet"
  />

  <Teleport to="body">
    <div
      v-if="picking"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`派驻 · ${workerShortName(picking)}`"
      @click.self="closePick"
    >
      <div class="sheet">
        <header>
          <h2 class="title">派驻 · {{ workerShortName(picking) }}</h2>
        </header>
        <div class="pick-list">
          <div v-for="choice in pickChoices" :key="choice.stationId ?? 'rest'" class="pick-cell">
            <button
              type="button"
              :class="{
                on: choice.current,
                locked: choice.locked,
              }"
              :disabled="choice.disabled && !choice.locked"
              :aria-pressed="choice.current"
              @click="onPickStation(choice.stationId)"
            >
              <span class="crew" aria-hidden="true">
                <i
                  v-for="(dot, i) in choice.dots"
                  :key="i"
                  :class="{ empty: dot.empty }"
                  :style="{ background: dot.color }"
                />
              </span>
              <span>{{ choice.label }}</span>
            </button>
          </div>
        </div>
        <div class="sheet-actions">
          <button type="button" class="go" :disabled="!canGoToAssignedWorkshop(picking)" @click="goWorkshop">
            前往
          </button>
          <button type="button" class="close" @click="closePick">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="restFoodOpen"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="选择伙食"
      @click.self="closeRestFood"
    >
      <div class="sheet">
        <header>
          <h2 class="title">选择伙食</h2>
          <span class="sheet-head-actions">
            <button type="button" class="food-rule" aria-label="伙食说明" @click="closeFoodHelp(); foodRuleOpen = true">？</button>
            <button type="button" class="close" @click="closeRestFood">关闭</button>
          </span>
        </header>
        <div class="pick-list">
          <div v-for="id in FOOD_ITEM_IDS" :key="id" class="pick-cell">
            <div class="potion-pick-row">
              <button
                type="button"
                class="potion-pick-main"
                :class="{ on: game.save.restFoodId === id }"
                :aria-pressed="game.save.restFoodId === id"
                @click="onPickRestFood(id)"
              >
                {{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}
              </button>
              <button
                type="button"
                class="potion-help pick"
                data-food-help
                :aria-pressed="foodHelp === id"
                :aria-label="`查看 ${ITEM_DEF[id].label} 效果`"
                @click.stop="onFoodHelp($event, id)"
              >i</button>
            </div>
          </div>
          <div class="pick-cell">
            <button
              type="button"
              :class="{ on: !game.save.restFoodId }"
              :aria-pressed="!game.save.restFoodId"
              @click="onPickRestFood(null)"
            >
              不选
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <ModeHelpSheet
      v-if="foodRuleOpen"
      :title="REST_FOOD_HELP_TITLE"
      :rows="REST_FOOD_HELP_ROWS"
      @close="foodRuleOpen = false"
    />
  </Teleport>

  <Teleport to="body">
    <div
      v-if="pickPotionIndex != null"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="装配药剂"
      @click.self="closePotionPick"
    >
      <div class="sheet">
        <header>
          <h2 class="title">装配药剂</h2>
          <button type="button" class="close" @click="closePotionPick">关闭</button>
        </header>
        <p class="hint">{{ POTION_EQUIP_HINT }}</p>
        <div v-if="potionPickGroups.length" class="potion-groups">
          <section v-for="group in potionPickGroups" :key="group.label" class="potion-group">
            <h3 class="potion-group-title">{{ group.label }}</h3>
            <div class="pick-list">
              <div v-for="id in group.ids" :key="id" class="pick-cell">
                <div class="potion-pick-row">
                  <button type="button" class="potion-pick-main" @click="onInstallPotion(id)">
                    <PotionIcon :name="id" />
                    <span>{{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}</span>
                  </button>
                  <button
                    type="button"
                    class="potion-help pick"
                    data-potion-help
                    :aria-pressed="isPotionHelpOpen(potionHelp, 'pick', id)"
                    :aria-label="`查看 ${ITEM_DEF[id].label} 效果`"
                    @click.stop="onPotionHelp($event, 'pick', id)"
                  >i</button>
                </div>
              </div>
            </div>
          </section>
        </div>
        <p v-else class="hint">没有可装的药剂</p>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="potionHelpBubble"
      class="potion-bubble"
      data-potion-bubble
      role="dialog"
      :aria-label="potionHelpBubble.title"
      :style="{ left: `${potionHelpPos.left}px`, top: `${potionHelpPos.top}px` }"
    >
      <b>{{ potionHelpBubble.title }}</b>
      <p>{{ potionHelpBubble.effect }}</p>
      <small v-if="potionHelpBubble.stock != null">库存 ×{{ potionHelpBubble.stock }}</small>
      <button v-if="canUnequipPotionHelp" type="button" class="potion-bubble-unequip" @click="onUnequipPotionHelp">卸下</button>
    </div>
    <div
      v-if="foodHelpBubble"
      class="potion-bubble"
      data-food-bubble
      role="dialog"
      :aria-label="foodHelpBubble.title"
      :style="{ left: `${foodHelpPos.left}px`, top: `${foodHelpPos.top}px` }"
    >
      <b>{{ foodHelpBubble.title }}</b>
      <p>{{ foodHelpBubble.effect }}</p>
      <small>库存 ×{{ foodHelpBubble.stock }}</small>
    </div>
  </Teleport>
</template>

<style scoped>
.panel {
  --roster-side-width: 72px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
}

.panel.dragging {
  user-select: none;
  cursor: grabbing;
}

.board {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.workshop {
  flex: 1 1 auto;
  border-right: 2px solid rgba(212, 160, 23, 0.55);
}

.fuse-drag-tip {
  flex: 0 0 auto;
  margin: 4px 6px 0;
  padding: 4px 8px;
  border: 2px solid var(--gold-deep);
  border-radius: 8px;
  background: linear-gradient(#fffef8, #fff3d8);
  box-shadow: 0 2px 0 var(--shadow);
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.3;
  text-align: center;
}

.side {
  flex: 0 0 var(--roster-side-width);
  width: var(--roster-side-width);
  overflow: hidden;
}

.zone {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.combat {
  flex: 0 1 auto;
  max-height: 62%;
  background: linear-gradient(180deg, rgba(176, 62, 58, 0.14), rgba(255, 214, 196, 0.28));
  border-bottom: 2px solid rgba(176, 72, 64, 0.32);
}

.combat.empty {
  flex: 0 0 auto;
  max-height: none;
}

.rest {
  flex: 1 1 auto;
  background: linear-gradient(180deg, rgba(154, 112, 72, 0.06), rgba(255, 247, 216, 0.2));
}

.zone-head {
  flex: 0 0 auto;
  padding: 4px 2px 2px;
  color: #7a4a22;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
  text-align: center;
}

.combat .zone-head {
  color: #8a3228;
}

.rest > .zone-head {
  font-size: 9px;
  line-height: 1.25;
}

.march-row {
  position: relative;
}

.march-tag {
  display: block;
  margin-top: 1px;
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.1;
}

.march-bar {
  display: block;
  height: 3px;
  margin-top: 2px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(90, 48, 16, 0.16);
}

.march-bar b {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.tone-out {
  background: linear-gradient(90deg, rgba(232, 176, 74, 0.35), rgba(255, 236, 196, 0.2));
}

.tone-out .march-tag,
.tone-win .march-tag {
  color: #8a4e12;
}

.tone-out .march-bar b,
.tone-win .march-bar b {
  background: linear-gradient(90deg, #e2a31a, #ffe27a);
}

.tone-win {
  background: linear-gradient(90deg, rgba(255, 214, 120, 0.72), rgba(255, 244, 214, 0.45));
  animation: march-glow 1.1s ease-in-out infinite;
}

.tone-lose {
  background: linear-gradient(90deg, rgba(58, 74, 112, 0.55), rgba(28, 36, 58, 0.28));
  animation: march-glow 1.35s ease-in-out infinite;
}

.tone-lose .march-tag {
  color: #d5e4ff;
}

.tone-lose .march-bar b {
  background: linear-gradient(90deg, #6d8fd4, #d5e4ff);
}

.tone-fight .march-tag {
  color: #8a3228;
}

@keyframes march-glow {
  50% { filter: brightness(1.12); }
}

@media (prefers-reduced-motion: reduce) {
  .tone-win,
  .tone-lose {
    animation: none;
  }
}

.recruit-bar {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: calc(100% - 6px);
  margin: 0 3px 4px;
  min-height: 36px;
  padding: 4px 4px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(#ffe27a, #e2a31a);
  color: #5a3010;
  box-shadow: 0 2px 0 var(--gold-deep);
  font-weight: 900;
  line-height: 1.15;
  text-align: center;
}

.recruit-bar-lab {
  font-size: 10px;
}

.recruit-bar-cost {
  font-size: 11px;
}

.recruit-bar.off {
  opacity: 0.45;
  filter: grayscale(0.28);
  box-shadow: none;
}

.rest-food {
  flex: 0 0 auto;
  width: calc(100% - 6px);
  margin: 0 3px 4px;
  min-height: 22px;
  padding: 2px 4px;
  border: 1px solid var(--gold-deep);
  border-radius: 6px;
  background: #fff9de;
  color: var(--ink);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
}

.rest-food.dry {
  opacity: 0.55;
}

.zone-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 3px 3px 6px;
}

.station-list {
  display: grid;
  grid-template-rows: repeat(var(--workshop-rail-row-count), minmax(var(--workshop-rail-row-min), 1fr));
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 4px 6px 16px;
  gap: var(--workshop-rail-row-gap);
}

.rest-list {
  padding: 3px 3px 6px;
}

.station {
  position: relative;

  display: flex;
  align-items: stretch;
  min-height: var(--workshop-rail-row-min);
  min-width: 0;
  border: 2px solid var(--gold);
  border-radius: 8px;
  background: linear-gradient(145deg, #fff9de, #f3ddaa);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.station.locked {
  filter: grayscale(0.85);
  opacity: 0.48;
}

.station-rail {
  flex: 0 0 32px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  min-height: 0;
  padding: 2px;
}

.station-name {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  padding: 3px 1px;
  border-radius: 4px;
  background: linear-gradient(180deg, #6a3218, #4a2214);
  color: #fff4d8;
}

.station-name :deep(.ui-ico) {
  width: 15px;
  height: 15px;
  color: #fff4d8;
}

.station-name b {
  font-size: 13px;
  line-height: 1.1;
  letter-spacing: 0.04em;
  writing-mode: vertical-rl;
}

.station-detail {
  flex: 1 1 0;
  width: 100%;
  min-height: 32px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 2px 0;
  border: 1px solid var(--gold-deep);
  border-radius: 4px;
  background: linear-gradient(180deg, #fff9de, #f3ddaa);
  color: var(--ink);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  line-height: 1.05;
  writing-mode: vertical-rl;
  white-space: nowrap;
}

.station-work {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.station-craft-row {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 6px;
  row-gap: 3px;
  min-width: 0;
  padding: 0 4px 3px;
}

.station-craft-row :deep(.ui-select.station-craft-pick) {
  grid-column: 1;
  grid-row: 1;
  width: 100%;
  min-width: 0;
}

.station-craft-row :deep(.station-craft-pick .face) {
  min-height: 26px;
  padding: 1px 6px;
  gap: 4px;
  font-size: 12px;
}

.station-craft-row :deep(.station-craft-pick .lab) {
  font-weight: 800;
  color: var(--copper);
}

.station-craft-row :deep(.station-progress .eff) {
  grid-column: 2;
  grid-row: 1;
}

.station-craft-row :deep(.station-progress .bar) {
  grid-column: 1 / -1;
  grid-row: 2;
  width: 100%;
  height: 12px;
  border-width: 1px;
}

.potion-row {
  display: flex;
  align-items: stretch;
  min-height: 78px;
  min-width: 0;
  gap: 6px;
}

.potion-slot {
  position: relative;
  overflow: visible;
  flex: 1;
  min-width: 0;
  min-height: 78px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 4px 16px;
  border: 1px solid #6a4a22;
  border-radius: 14px;
  background: linear-gradient(180deg, #6e5736 0%, #3a2a18 58%, #24180f 100%);
  box-shadow: inset 0 1px 0 rgba(255, 228, 170, 0.5), 0 4px 0 #120e0a;
  color: #ffe7b8;
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}

.potion-slot:active:not(:has(.potion-help:active)) {
  transform: translateY(3px);
  box-shadow: inset 0 1px 0 rgba(255, 228, 170, 0.22), 0 1px 0 #120e0a;
}

.potion-slot.pressed::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(255, 220, 140, 0.42);
  pointer-events: none;
  animation: potion-flash 0.2s ease-out;
}

.potion-slot.empty {
  border-style: dashed;
  border-color: rgba(226, 163, 26, 0.38);
  background: rgba(255, 244, 220, 0.05);
  box-shadow: inset 0 1px 0 rgba(255, 228, 170, 0.12), 0 3px 0 #120e0a;
  color: #b7a48a;
}

.potion-slot.dry {
  background: linear-gradient(180deg, #4a463f 0%, #2c2925 100%);
  border-color: #3a342c;
  color: #8d867c;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 3px 0 #120e0a;
}

.potion-halo {
  position: absolute;
  inset: -3px;
  z-index: 1;
  border-radius: 16px;
  padding: 2px;
  background: conic-gradient(from -90deg, #ffc14a calc(var(--remain) * 1turn), rgba(255, 193, 74, 0.14) 0);
  pointer-events: none;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
}

.potion-vacant {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 244, 220, 0.08);
  box-shadow: inset 0 0 0 1.5px rgba(226, 163, 26, 0.28);
}

.potion-slot .potion-help {
  position: absolute;
  top: 3px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

.potion-slot .potion-help::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.potion-slot .potion-help {
  right: 3px;
  background: #6a4a18;
  color: #fff8ee;
}

.potion-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.potion-group-title {
  margin: 0 0 6px;
  color: #8a6410;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.potion-pick-row {
  position: relative;
  min-width: 0;
}

.potion-pick-main {
  width: 100%;
  min-width: 0;
  padding-right: 40px;
}

.potion-groups .potion-pick-main {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding-left: 8px;
}

.potion-groups .potion-pick-main :deep(.potion-ico) {
  width: 16px;
  height: 16px;
  color: #6a3218;
}

.potion-groups .potion-pick-main span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.potion-help.pick {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  width: 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.potion-bubble {
  position: fixed;
  z-index: calc(var(--z-sheet) + 8);
  width: min(220px, calc(100vw - 16px));
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

.potion-bubble b {
  font-size: 13px;
}

.potion-bubble p,
.potion-bubble small {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 700;
}

.potion-bubble small {
  color: var(--muted);
}

.potion-bubble-unequip {
  align-self: flex-start;
  min-height: 22px;
  margin-top: 2px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
}

.potion-buffs {
  margin: 4px 0 0;
  padding: 0 2px;
  color: #f0c56a;
  font-size: 10px;
  font-weight: 800;
}

.potion-slot :deep(.potion-ico) {
  width: 28px;
  height: 28px;
  color: #ffd98a;
}

.potion-slot.dry :deep(.potion-ico) {
  color: #8d867c;
}

.potion-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.02em;
  text-align: center;
}

.potion-qty {
  position: absolute;
  right: 4px;
  bottom: 4px;
  z-index: 2;
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 99px;
  background: #3a2a14;
  color: #ffe7b0;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 1px 0 #120e0a;
}

.potion-slot.dry .potion-qty {
  background: #b42318;
  color: #fff6f4;
}

.potion-slot.pressed .potion-qty {
  animation: potion-badge-pop 0.22s ease-out;
}

@keyframes potion-flash {
  from { opacity: 0.95; }
  to { opacity: 0; }
}

@keyframes potion-badge-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.35); }
  100% { transform: scale(1); }
}

@keyframes potion-breathe {
  0%,
  100% { filter: brightness(1); }
  45% {
    filter: brightness(1.45);
    box-shadow: inset 0 0 0 2px #ffc14a, 0 0 14px rgba(255, 196, 74, 0.85), 0 4px 0 #120e0a;
  }
}

.potion-slot.restock {
  animation: potion-breathe 0.45s ease-in-out 2;
}

@media (prefers-reduced-motion: reduce) {
  .potion-slot,
  .potion-slot.restock,
  .potion-slot.pressed::after,
  .potion-slot.pressed .potion-qty {
    animation: none;
    transition: none;
  }
}

.slots {
  display: flex;
  align-items: stretch;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  gap: 4px;
  padding: 4px;
}

.slot {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border: 1px solid #d4a84a;
  border-radius: 7px;
  background: rgba(255, 247, 212, 0.45);
  box-shadow: none;
  touch-action: none;
}

.slot.empty {
  justify-content: center;
  flex-direction: column;
  gap: 0;
  border-style: dashed;
  background: rgba(255, 241, 190, 0.35);
  color: #a77840;
  cursor: default;
  touch-action: manipulation;
}

.slot.drop-ok,
.rest.drop-ok,
.rest-row.drop-ok {
  box-shadow: 0 0 0 2px var(--moss);
}

.slot.drop-no,
.rest.drop-no,
.rest-row.drop-no {
  box-shadow: 0 0 0 2px var(--danger);
}

.empty-lab {
  font-size: 9px;
  font-weight: 800;
}

.hp-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(196, 148, 28, 0.58), rgba(168, 118, 12, 0.46));
  box-shadow: inset -2px 0 0 rgba(106, 66, 24, 0.28);
  transition: width 0.3s ease;
}

.slot.has-banter {
  overflow: visible;
  z-index: 2;
}

.slot.has-banter .slot-main {
  overflow: visible;
}

.slot.has-banter .hp-fill {
  border-radius: 6px 0 0 6px;
}

.slot.has-banter.hp-full .hp-fill {
  border-radius: 6px;
}

.hp-full .hp-fill {
  background: linear-gradient(90deg, rgba(74, 168, 42, 0.58), rgba(46, 132, 28, 0.46));
  box-shadow: inset -2px 0 0 rgba(46, 100, 24, 0.32);
}

.hp-low .hp-fill {
  background: linear-gradient(90deg, rgba(196, 72, 58, 0.6), rgba(168, 40, 34, 0.48));
  box-shadow: inset -2px 0 0 rgba(120, 28, 24, 0.34);
}

.rest-row.eat-flash {
  overflow: visible;
  z-index: 3;
  animation: eat-glow 0.7s ease-out;
}

.rest-row.eat-flash .hp-fill {
  background: linear-gradient(90deg, rgba(150, 230, 110, 0.88), rgba(90, 190, 70, 0.72));
  box-shadow: inset 0 0 8px rgba(230, 255, 200, 0.95);
}

.eat-float {
  position: absolute;
  left: 26px;
  top: 1px;
  z-index: 4;
  color: #2f7a22;
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
  animation: eat-float 0.7s ease-out forwards;
}

@keyframes eat-glow {
  0% {
    box-shadow: 0 0 0 0 rgba(120, 210, 90, 0);
  }
  40% {
    box-shadow:
      inset 0 0 0 2px rgba(170, 235, 120, 0.95),
      0 0 10px 2px rgba(120, 210, 90, 0.7);
  }
  100% {
    box-shadow: 0 2px 0 rgba(170, 108, 31, 0.28);
  }
}

@keyframes eat-float {
  0% {
    opacity: 0;
    transform: translateY(4px);
  }
  18% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-12px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hp-fill {
    transition: none;
  }

  .station .slot :deep(.worker-avatar.enter-land),
  .rest-row.eat-flash,
  .eat-float {
    animation: none;
  }
}

.station .slot.enter-slot {
  overflow: visible;
  z-index: 2;
}

.station .slot :deep(.worker-avatar) {
  z-index: 1;
}

.station .slot :deep(.worker-avatar.enter-land) {
  z-index: 2;
  animation: worker-enter 0.45s cubic-bezier(0.22, 0.9, 0.24, 1) both;
  animation-delay: var(--enter-delay, 0ms);
}

@keyframes worker-enter {
  0% {
    transform: translateY(-8px) scale(0.55);
    box-shadow: 0 0 0 0 transparent;
  }
  62% {
    transform: translateY(1px) scale(1.08);
    box-shadow: 0 0 0 3px var(--enter-edge, #d4a84a);
  }
  100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 0 0 0 transparent;
  }
}

.slot-main {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  overflow: hidden;
}

.slot-main b {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  line-height: 12px;
}

.slot-main em,
.rest-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
}

.race-tag {
  flex: 0 0 auto;
  margin-left: 3px;
  padding: 0 3px;
  border: 1px solid var(--gold-deep, #8a6a32);
  border-radius: 3px;
  color: var(--ink, #3a2a16);
  font-style: normal;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0;
}

.slot-main small {
  color: var(--muted);
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

.station .slot .slot-main {
  flex-wrap: nowrap;
  gap: 4px;
}

.station .slot .slot-main b {
  min-width: 0;
  gap: 6px;
  font-size: 20px;
  line-height: 22px;
}

.station .slot .slot-main small {
  font-size: 18px;
}

.banter {
  position: absolute;
  z-index: 6;
  left: 0;
  right: 0;
  top: auto;
  bottom: calc(100% + 1px);
  margin: 0;
  padding: 1px 4px;
  border: 1px solid var(--gold-deep);
  border-radius: 6px;
  background: rgba(255, 248, 230, 0.96);
  color: var(--ink);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  pointer-events: none;
  transform: none;
  animation: worker-banter 10s ease-out forwards;
}

.station-list:has(> .station:first-child .slot.has-banter) {
  padding-top: 22px;
}

.tutor-tip {
  position: absolute;
  z-index: 2;
  left: 28px;
  bottom: calc(100% - 8px);
  max-width: 168px;
  margin: 0;
  padding: 2px 5px;
  border: 1px solid var(--gold-deep);
  border-radius: 6px;
  background: rgba(255, 248, 230, 0.96);
  color: var(--ink);
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  text-align: left;
  pointer-events: auto;
  cursor: pointer;
  appearance: none;
}

.slot.has-tutor {
  overflow: visible;
  z-index: 2;
}

.station .slot .tutor-tip {
  left: 56px;
  right: 4px;
  bottom: auto;
  top: 4px;
  max-width: none;
}

.rest-row.has-tutor {
  overflow: visible;
  z-index: 2;
}

.rest-list:has(> .rest-row.has-tutor) {
  padding-top: 36px;
}

.rest-name {
  position: relative;
  z-index: 1;
  flex: 1;
  font-size: 10px;
  font-weight: 800;
  line-height: 12px;
}

.qdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid #8a6410;
}

.station .slot .qdot {
  flex: none;
  width: 12px;
  height: 12px;
  border-width: 2px;
}

.rest-row {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 4px;
  border: 1px solid #d4a84a;
  border-radius: 7px;
  background: rgba(255, 247, 212, 0.45);
  box-shadow: 0 2px 0 rgba(170, 108, 31, 0.28);
}

.rest-row.queue-ready {
  background: rgba(255, 236, 160, 0.95);
  box-shadow:
    inset 0 0 0 1px rgba(62, 154, 42, 0.55),
    0 2px 0 rgba(170, 108, 31, 0.28);
}

.rest-row.queue-blocked {
  box-shadow:
    inset 0 0 0 1px rgba(176, 72, 64, 0.7),
    0 2px 0 rgba(170, 108, 31, 0.28);
}

.rest-row.queue-dim {
  opacity: 0.5;
}

.rest-queue {
  position: relative;
  z-index: 1;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  gap: 1px;
}

.rest-order {
  color: var(--ink);
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
  line-height: 1;
  text-align: center;
}

.rest-badge {
  padding: 0 1px;
  border-radius: 3px;
  font-size: 8px;
  font-style: normal;
  font-weight: 900;
  line-height: 1.15;
  white-space: nowrap;
}

.queue-ready .rest-badge {
  background: rgba(122, 214, 78, 0.45);
  color: var(--moss-deep);
}

.queue-blocked .rest-badge {
  background: rgba(226, 74, 58, 0.22);
  color: #8a3228;
}

.rest-face {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 14px 3px 2px;
  border: 0;
  background: transparent;
  box-shadow: none;
  touch-action: pan-y;
}

.rest-go {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  width: 16px;
  height: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: #b77720;
  font-size: 13px;
  font-weight: 900;
}

.empty-rest {
  margin: 6px 3px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.drag-ghost {
  position: fixed;
  z-index: 80;
  pointer-events: none;
  transform: translate(-50%, -120%);
  min-height: 32px;
  padding: 6px 10px;
  border: 2px solid var(--gold-deep);
  border-radius: 10px;
  background: linear-gradient(#fff8dc, #f0c14a);
  color: var(--ink);
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 4px 0 var(--gold-deep);
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px 12px 0;
  background: rgba(40, 24, 8, 0.45);
}

.sheet {
  width: min(480px, 100%);
  position: relative;
  z-index: calc(var(--z-sheet) + 1);
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(78vh, 640px);
  overflow: auto;
  padding: 16px 16px calc(16px + var(--dock-height));
  border: 3px solid var(--gold-deep);
  border-radius: 16px 16px 12px 12px;
  background: linear-gradient(180deg, #fffef8, #fff3d8);
  box-shadow: 0 6px 0 var(--shadow);
}

.sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sheet-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.food-rule {
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.sheet .title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
}

.sheet-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.go,
.close {
  min-height: 32px;
  padding: 4px 10px;
}

.meta {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.hp-slot {
  width: 100%;
}

.attrs {
  display: flex;
  align-items: center;
  margin: 0;
}

.tool-row {
  align-items: center;
}

.tool-row :deep(.ui-select) {
  min-width: 132px;
  flex: 1 1 132px;
}

.qty-input {
  font: inherit;
  color: var(--ink);
  min-height: 36px;
  min-width: 64px;
  width: 72px;
  padding: 6px 10px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: linear-gradient(#fffbeb, var(--btn));
  box-shadow: 0 3px 0 var(--shadow);
}

.crew {
  display: flex;
  gap: 4px;
  min-height: 8px;
  align-items: center;
}

.crew i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid #8a6410;
  display: block;
}

.crew i.empty {
  opacity: 0.55;
}

.pick-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pick-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.pick-list button {
  font: inherit;
  font-weight: 800;
  min-height: 48px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: linear-gradient(#fffbeb, #fff7d8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.pick-list .fuse-main {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.pick-list button.on {
  background: linear-gradient(#ffe27a, #f0b83a);
}

.pick-list button:disabled:not(.on) {
  opacity: 0.55;
}

.pick-list button.locked {
  filter: grayscale(0.8);
  opacity: 0.5;
}

@keyframes worker-banter {
  0% {
    opacity: 0;
  }
  2.64%,
  95.16% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .banter {
    animation: none;
  }
}

.roster-v2 .workshop {
  border-right: 0;
}

.roster-v2 .board {
  position: relative;
}

.roster-v2 .col.side {
  display: none;
}

.roster-v2 .station-list {
  grid-template-rows: repeat(6, minmax(36px, 1fr));
}

.roster-v2 .station {
  cursor: pointer;
}

.roster-v2:not(.sheet-ops) .station-detail,
.roster-v2:not(.sheet-ops) .station-craft-row :deep(.ui-select.station-craft-pick) {
  display: none;
}

.roster-v2:not(.sheet-ops) .station-rail {
  flex: 0 0 64px;
  width: 64px;
  align-self: stretch;
  align-items: stretch;
  justify-content: flex-start;
  padding: 0;
}

.roster-v2:not(.sheet-ops) .station-name {
  flex: 1 1 auto;
  align-self: stretch;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  min-height: 100%;
  box-sizing: border-box;
  padding: 4px 2px;
  border-radius: 6px 0 0 6px;
}

.roster-v2:not(.sheet-ops) .station-name :deep(.ui-ico) {
  width: 28px;
  height: 28px;
}

.roster-v2:not(.sheet-ops) .station-name b {
  letter-spacing: 0;
  writing-mode: horizontal-tb;
  text-align: center;
  white-space: nowrap;
}

.roster-v2:not(.sheet-ops) .station-craft-row :deep(.station-progress .bar) {
  grid-column: 1;
  grid-row: 1;
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
}

.roster-v2:not(.sheet-ops) .station-craft-row :deep(.station-progress .eff) {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  text-align: right;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.station.closed .station-name b::after {
  content: '封';
  margin-left: 4px;
  padding: 0 3px;
  border-radius: 3px;
  background: #8a3a2a;
  color: #fff4d8;
  font-size: 10px;
  line-height: 1.3;
  letter-spacing: 0;
  writing-mode: horizontal-tb;
}

.roster-v2 .slot.empty {
  opacity: 0.55;
}

.potion-dock {
  flex: 0 0 auto;
  margin: 4px 6px 4px;
  padding: 7px 7px 6px;
  border: 1px solid #e2a31a;
  border-radius: 12px;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(226, 163, 26, 0.18), transparent 58%),
    linear-gradient(180deg, #2c241c, #14110e);
  box-shadow: inset 0 0 14px rgba(226, 163, 26, 0.22), inset 0 1px 0 rgba(255, 214, 140, 0.22);
}

.roster-v2.sheet-rest .col.side,
.roster-v2.sheet-combat .col.side {
  display: flex;
  flex-direction: column;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: auto;
  height: 58%;
  z-index: 6;
  overflow: auto;
  background: #fff8ee;
  border-top: 3px solid var(--gold-deep);
  box-shadow: 0 -6px 0 rgba(90, 48, 16, 0.12);
}

.roster-v2.sheet-combat .zone.rest,
.roster-v2.sheet-rest .zone.combat {
  display: none;
}

.roster-v2.sheet-rest .zone-head,
.roster-v2.sheet-combat .zone-head {
  padding: 8px 10px 4px;
  font-size: 13px;
  text-align: left;
}

.roster-v2.sheet-rest .rest-name,
.roster-v2.sheet-combat .rest-name {
  font-size: 14px;
  line-height: 18px;
}

.roster-v2.sheet-rest .rest-face,
.roster-v2.sheet-combat .rest-face {
  gap: 8px;
  min-height: 44px;
  padding: 6px 32px 6px 8px;
}

.roster-v2.sheet-rest .rest-go,
.roster-v2.sheet-combat .rest-go {
  width: 28px;
  font-size: 18px;
}

.roster-v2.sheet-rest .rest-order,
.roster-v2.sheet-combat .rest-order {
  font-size: 13px;
}

.roster-v2.sheet-rest .rest-badge,
.roster-v2.sheet-combat .rest-badge {
  font-size: 10px;
}

.empty-combat {
  margin: 10px 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

.status-band {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-top: 6px;
  padding: 4px;
  overflow: hidden;
  border: 2px solid var(--gold);
  border-radius: 10px;
  background: #fff9de;
}

.band-head,
.queue-head,
.queue-empty {
  flex: 1 1 auto;
  min-width: 0;
}

.queue-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-band:has(.queue-head.has-tutor) {
  overflow: visible;
}

.queue-avatar {
  flex: 0 0 auto;
}

.queue-copy {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.queue-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #5a3a10;
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-hp {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.queue-bar {
  flex: 1 1 auto;
  height: 4px;
  min-width: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: #efe0b0;
}

.queue-bar i {
  display: block;
  height: 100%;
  background: #e2a31a;
}

.queue-bar.hp-full i {
  background: #3e9a2a;
}

.queue-bar.hp-low i {
  background: #e24a3a;
}

.queue-hp-num {
  flex: 0 0 auto;
  color: #7a4a22;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.queue-empty {
  margin: 0;
  overflow: hidden;
  color: #9a9286;
  font-size: 12px;
  font-weight: 800;
}

.band-head em {
  min-width: 0;
  overflow: hidden;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.band-tile {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 2px;
  border: 1.5px solid #9a9286;
  border-radius: 8px;
  background: #f6f4f0;
  color: #6d665c;
  box-shadow: none;
}

.band-tile .cap {
  max-width: 100%;
  overflow: hidden;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.band-tile .tile-ico,
.band-tile :deep(.food-ico) {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.tile-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff8f4;
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
  line-height: 14px;
  text-align: center;
}

.band-food.low .cap {
  color: #b42318;
}

.band-recruit {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  min-height: 32px;
  padding: 2px 8px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(#ffe27a, #e2a31a);
  color: #5a3010;
  box-shadow: 0 2px 0 var(--gold-deep);
  font-size: 12px;
  font-weight: 900;
}

.band-recruit small {
  font-size: 11px;
  font-weight: 800;
}

.band-recruit.off,
.band-recruit:disabled {
  opacity: 0.45;
  filter: grayscale(0.28);
  box-shadow: none;
}

.band-combat,
.rest-combat-entry {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 2px 6px;
  border: 1.5px solid #9a9286;
  border-radius: 8px;
  background: #f6f4f0;
  color: #6d665c;
  box-shadow: none;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.band-combat.on {
  border-color: var(--gold-deep);
  background: linear-gradient(#ffe27a, #f0b83a);
  color: #5a3010;
  box-shadow: 0 2px 0 var(--gold-deep);
}

.rest-combat-entry {
  margin: 2px 8px 4px;
  font-size: 13px;
}

.band-combat-measure {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
}
</style>
