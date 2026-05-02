import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            emptyOutDir: true,
            rollupOptions: {
              external: (id) => {
                if (id.startsWith('node:')) return true
                if (id === 'electron') return true
                // Resolved at runtime via createRequire().resolve()
                if (id === 'mermaid' || id.startsWith('mermaid/')) return true
                // Bundle everything else — pnpm hoisting causes electron-builder
                // to miss transitive deps in the asar
                return false
              },
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
      },
    }),
  ],
  resolve: {
    alias: {
      '@src': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3147',
    },
  },
})
