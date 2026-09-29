import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vitest/config'

function refreshAppVersion() {
  const result = spawnSync(process.execPath, ['scripts/writeAppVersion.mjs'], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error('writeAppVersion failed')
}

function appVersionPlugin(): Plugin {
  const serveJson = (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }, next: () => void) => {
    const path = req.url?.split('?')[0] ?? ''
    const file =
      path === '/version.json' || path === '/idea5_idle/version.json'
        ? 'src/generated/appVersion.json'
        : path === '/history.json' || path === '/idea5_idle/history.json'
          ? 'src/generated/history.json'
          : ''
    if (!file) {
      next()
      return
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    if (!existsSync(file)) {
      res.end('null')
      return
    }
    res.end(readFileSync(file, 'utf8'))
  }
  return {
    name: 'app-version-json',
    buildStart() {
      refreshAppVersion()
    },
    configureServer(server) {
      refreshAppVersion()
      server.middlewares.use(serveJson)
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: readFileSync('src/generated/appVersion.json', 'utf8'),
      })
      if (!existsSync('src/generated/history.json')) return
      this.emitFile({
        type: 'asset',
        fileName: 'history.json',
        source: readFileSync('src/generated/history.json', 'utf8'),
      })
    },
  }
}

/** GitHub Pages project site。manifest 的 start_url / scope 与此相同。 */
const base = '/idea5_idle/'

export default defineConfig({
  plugins: [
    vue(),
    appVersionPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        globIgnores: ['**/version.json', '**/history.json'],
      },
      // GitHub Pages 对 .json 有 application/json；.webmanifest 常被当成二进制，安装检查会失败。
      manifestFilename: 'manifest.json',
      scope: base,
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: '部落工坊',
        short_name: '部落工坊',
        description: '部落酋长带着苦工排流水线，对抗联盟的生活挂机',
        lang: 'zh-CN',
        dir: 'ltr',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#1c522c',
        background_color: '#1c522c',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  base,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
