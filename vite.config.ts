import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  base: '/idea5_idle/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
