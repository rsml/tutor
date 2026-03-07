import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@server': new URL('./server', import.meta.url).pathname,
      '@src': new URL('./src', import.meta.url).pathname,
    },
  },
})
