import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

/** GitHub Pages project site。manifest 的 start_url / scope 与此相同。 */
const base = '/idea5_idle/'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // GitHub Pages 对 .json 有 application/json；.webmanifest 常被当成二进制，安装检查会失败。
      manifestFilename: 'manifest.json',
      scope: base,
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: '骑士工坊',
        short_name: '工坊',
        description: '抽工人、排流水线的生活挂机',
        lang: 'zh-CN',
        dir: 'ltr',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#fff8ee',
        background_color: '#fff8ee',
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
