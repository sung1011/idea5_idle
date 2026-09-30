/** 主线任务条压住面板顶栏按钮时，给面板顶部补出任务条高度。 */

export type Box = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const PAD_ATTR = 'data-quest-pad'
const BASE_ATTR = 'data-quest-pad-base'
const TOP_BAND = 72

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/**
 * 顶栏按钮和任务条相交时，返回应加在面板上的 padding-top。
 * appliedPad 是已经加上的高度。底对齐面板加 padding 后顶栏上移，其它面板的流式顶栏下移。
 */
export function questHeadPadPx(input: {
  quest: Box
  buttons: Box[]
  appliedPad: number
  growsUp: boolean
}): number {
  if (input.quest.height <= 0 || input.buttons.length === 0) return 0
  const shift = input.growsUp ? input.appliedPad : -input.appliedPad
  const hit = input.buttons.some((button) =>
    boxesOverlap(input.quest, {
      left: button.left,
      right: button.right,
      width: button.width,
      height: button.height,
      top: button.top + shift,
      bottom: button.bottom + shift,
    }),
  )
  return hit ? input.quest.height : 0
}

function boxOf(rect: DOMRect): Box {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function visualPanel(dialog: HTMLElement): HTMLElement {
  return (
    dialog.querySelector<HTMLElement>(':scope > .sheet, :scope > .camp-sheet, :scope > .panel') ?? dialog
  )
}

function panelGrowsUp(panel: HTMLElement): boolean {
  const parent = panel.parentElement
  if (!parent) return false
  const align = getComputedStyle(parent).alignItems
  return align === 'flex-end' || align === 'end'
}

function skipDialog(dialog: HTMLElement): boolean {
  return Boolean(
    dialog.getAttribute('role') === 'alertdialog' ||
      dialog.closest('.ask-mask, .guide-mask, .guide-finger'),
  )
}

function topButtons(panel: HTMLElement, appliedPad: number, growsUp: boolean): Box[] {
  const shift = growsUp ? appliedPad : -appliedPad
  const panelTop = panel.getBoundingClientRect().top + shift
  const boxes: Box[] = []
  for (const node of panel.querySelectorAll<HTMLElement>('button')) {
    if (node.closest('[role="alertdialog"], .ask-mask, .guide-mask, .guide-finger')) continue
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    if (rect.top + shift > panelTop + TOP_BAND) continue
    boxes.push(boxOf(rect))
  }
  return boxes
}

function appliedPadOf(panel: HTMLElement): number {
  const value = Number(panel.getAttribute(PAD_ATTR) || 0)
  return Number.isFinite(value) ? value : 0
}

function clearPad(panel: HTMLElement) {
  panel.style.paddingTop = ''
  panel.removeAttribute(PAD_ATTR)
  panel.removeAttribute(BASE_ATTR)
}

function applyPad(panel: HTMLElement, next: number) {
  const prev = appliedPadOf(panel)
  if (prev === next && (next > 0 || !panel.hasAttribute(PAD_ATTR))) return
  if (next <= 0) {
    clearPad(panel)
    return
  }
  if (!panel.hasAttribute(BASE_ATTR)) {
    panel.setAttribute(BASE_ATTR, getComputedStyle(panel).paddingTop || '0px')
  }
  panel.setAttribute(PAD_ATTR, String(next))
  panel.style.paddingTop = `calc(${panel.getAttribute(BASE_ATTR)} + ${next}px)`
}

/** 按当前任务条位置，给被挡住顶栏的面板补上内边距。 */
export function syncQuestHeadPads(questEl: HTMLElement | null) {
  if (typeof document === 'undefined') return
  const seen = new Set<HTMLElement>()
  const quest = questEl ? boxOf(questEl.getBoundingClientRect()) : null
  for (const dialog of document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')) {
    if (skipDialog(dialog)) continue
    const panel = visualPanel(dialog)
    seen.add(panel)
    if (!quest || quest.height <= 0) {
      clearPad(panel)
      continue
    }
    const applied = appliedPadOf(panel)
    const growsUp = panelGrowsUp(panel)
    const next = questHeadPadPx({
      quest,
      buttons: topButtons(panel, applied, growsUp),
      appliedPad: applied,
      growsUp,
    })
    applyPad(panel, next)
  }
  for (const stale of document.querySelectorAll<HTMLElement>(`[${PAD_ATTR}]`)) {
    if (!seen.has(stale)) clearPad(stale)
  }
}

/** 任务条出现、折叠、弹层开关或窗口尺寸变化时重算顶栏留白。 */
export function bindQuestHeadPad(questEl: () => HTMLElement | null): () => void {
  if (typeof document === 'undefined') return () => {}
  let frame = 0
  const sync = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => syncQuestHeadPads(questEl()))
  }
  let watching: HTMLElement | null = null
  const resizeObs = new ResizeObserver(sync)
  const observeQuest = () => {
    const el = questEl()
    if (el === watching) return
    if (watching) resizeObs.unobserve(watching)
    watching = el
    if (el) resizeObs.observe(el)
  }
  const queued = sync
  const syncAndWatch = () => {
    observeQuest()
    queued()
  }
  const observer = new MutationObserver(syncAndWatch)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  window.addEventListener('resize', syncAndWatch)
  syncAndWatch()
  return () => {
    cancelAnimationFrame(frame)
    resizeObs.disconnect()
    observer.disconnect()
    window.removeEventListener('resize', syncAndWatch)
    syncQuestHeadPads(null)
  }
}
