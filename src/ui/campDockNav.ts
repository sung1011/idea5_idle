import { ref } from 'vue'

/** 营地弹框是否打开。任意页（含工坊）都用这一份。 */
export const campSheetOpen = ref(false)

export function closeCampSheet() {
  campSheetOpen.value = false
}

export function toggleCampSheet() {
  campSheetOpen.value = !campSheetOpen.value
}
