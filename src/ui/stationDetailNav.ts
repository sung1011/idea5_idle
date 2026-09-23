import { ref } from 'vue'
import type { StationId } from '../sim/types'

/** 合并工坊页当前打开的站详情。切页再回来仍读这一份。 */
export const openStationDetailId = ref<StationId | null>(null)

export function showStationDetail(stationId: StationId | null) {
  openStationDetailId.value = stationId
}
