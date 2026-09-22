import { ENCOUNTER_KIND_LABEL } from '../sim/encounters'
import type { EncounterKind } from '../sim/types'

/**
 * 订单卡卡头种类字。
 * 战场 / 地牢敌人格不写「敌人」；商场等其它 kind 仍用中文种类名。
 */
export function encounterCardKindTitle(kind: EncounterKind): string | null {
  if (kind === 'enemy') return null
  return ENCOUNTER_KIND_LABEL[kind]
}
