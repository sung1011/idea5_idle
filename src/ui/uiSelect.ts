export type UiSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

let nextUid = 0

export function nextUiSelectUid(): string {
  nextUid += 1
  return `ui-sel-${nextUid}`
}

export function uiSelectLabel(options: readonly UiSelectOption[], value: string): string {
  return options.find((row) => row.value === value)?.label ?? ''
}

export function uiSelectCanPick(option: UiSelectOption | undefined): boolean {
  return !!option && !option.disabled
}

export function uiSelectStepIndex(
  options: readonly UiSelectOption[],
  from: number,
  step: number,
): number {
  if (!options.length || step === 0) return from
  const dir = step > 0 ? 1 : -1
  let i = from
  for (let n = 0; n < options.length; n++) {
    i = (i + dir + options.length) % options.length
    if (uiSelectCanPick(options[i])) return i
  }
  return from
}
