import type { ClassId } from '../types'

export type ClassDef = {
  id: ClassId
  label: string
}

export const CLASS_DEF: Record<ClassId, ClassDef> = {
  warrior: { id: 'warrior', label: '战士' },
  ranger: { id: 'ranger', label: '游侠' },
  sorcerer: { id: 'sorcerer', label: '术士' },
}

export const CLASS_IDS: ClassId[] = ['warrior', 'ranger', 'sorcerer']
