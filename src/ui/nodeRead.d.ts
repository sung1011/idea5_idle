/** 测试里读 icons.css 原文。vitest 会把 css import 换成空字符串。 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}

declare module 'node:path' {
  export function dirname(path: string): string
  export function join(...paths: string[]): string
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}
