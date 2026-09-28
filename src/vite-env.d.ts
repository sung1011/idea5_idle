/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}
