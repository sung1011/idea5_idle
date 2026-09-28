import { ref } from 'vue'

/** 工坊精简预览。`current` 是现有默认界面，不写存档。 */
export type WorkshopLayoutDemo = 'current' | 'a' | 'b' | 'c'

export const WORKSHOP_LAYOUT_QUERY = 'workshopDemo'
export const WORKSHOP_SHOT_QUERY = 'workshopShot'

const LAYOUTS: readonly WorkshopLayoutDemo[] = ['current', 'a', 'b', 'c']

export function isWorkshopLayoutDemo(id: unknown): id is WorkshopLayoutDemo {
  return typeof id === 'string' && (LAYOUTS as readonly string[]).includes(id)
}

function paramsOf(search: string): URLSearchParams {
  const raw = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(raw)
}

/** 缺参或无法识别时回到现有界面。 */
export function workshopLayoutFromSearch(search: string): WorkshopLayoutDemo {
  const raw = paramsOf(search).get(WORKSHOP_LAYOUT_QUERY)
  if (raw === 'a' || raw === 'b' || raw === 'c') return raw
  return 'current'
}

export function workshopShotFromSearch(search: string): boolean {
  const raw = paramsOf(search).get(WORKSHOP_SHOT_QUERY)
  return raw === '1' || raw === 'true'
}

export function hasWorkshopLayoutQuery(search: string): boolean {
  return paramsOf(search).has(WORKSHOP_LAYOUT_QUERY)
}

/** 只改查询串，保留其它参数。`current` 会删掉预览参数。 */
export function workshopLayoutSearch(layout: WorkshopLayoutDemo, search = ''): string {
  const params = paramsOf(search)
  if (layout === 'current') params.delete(WORKSHOP_LAYOUT_QUERY)
  else params.set(WORKSHOP_LAYOUT_QUERY, layout)
  const next = params.toString()
  return next ? `?${next}` : ''
}

function locationSearch(): string {
  if (typeof location === 'undefined') return ''
  return location.search
}

export const workshopLayoutDemo = ref<WorkshopLayoutDemo>(workshopLayoutFromSearch(locationSearch()))

/** 带了预览参数才出现切换条；截图参数只藏切换条，不改布局。 */
export const workshopLayoutSwitcherOn = ref(
  hasWorkshopLayoutQuery(locationSearch()) && !workshopShotFromSearch(locationSearch()),
)

export function setWorkshopLayoutDemo(layout: WorkshopLayoutDemo): WorkshopLayoutDemo {
  const next = isWorkshopLayoutDemo(layout) ? layout : 'current'
  workshopLayoutDemo.value = next
  if (typeof history === 'undefined' || typeof location === 'undefined') return next
  const search = workshopLayoutSearch(next, location.search)
  const url = `${location.pathname}${search}${location.hash}`
  history.replaceState(history.state, '', url)
  return next
}
