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
                if (id.startsWith('.') || id.startsWith('/') || id.startsWith('#')) return false
                // Bundle the unified/remark/rehype ecosystem — pure ESM with deep
                // transitive deps that pnpm/electron-builder fails to resolve.
                // Everything else stays external (resolves fine from node_modules).
                const bundlePrefixes = [
                  'unified', 'remark-', 'rehype-', 'mdast-', 'hast-', 'unist-',
                  'micromark', 'estree-util-', 'vfile', 'character-entities',
                ]
                if (bundlePrefixes.some(p => id === p || id.startsWith(p))) return false
                const bundleExact = [
                  'bail', 'trough', 'devlop', 'ccount', 'zwitch', 'longest-streak',
                  'markdown-table', 'trim-lines', 'property-information', 'web-namespaces',
                  'comma-separated-tokens', 'space-separated-tokens', 'stringify-entities',
                  'parse-entities', 'decode-named-character-reference', 'hastscript',
                  'extend', 'is-plain-obj', 'escape-string-regexp', 'parse5',
                  'html-void-elements', '@ungap/structured-clone', 'entities',
                ]
                if (bundleExact.some(p => id === p || id.startsWith(p + '/'))) return false
                return true
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
