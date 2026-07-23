import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

const zone = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url))

// The Electron main process may resolve @shared and @server, but deliberately
// NOT @client. If someone imports renderer code from the main process the build
// fails loudly here rather than shipping a DMG that crashes on launch.
const mainProcessAliases = {
  '@shared': zone('shared'),
  '@server': zone('server'),
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          // vite-plugin-electron builds the main process with configFile:false,
          // so it does NOT inherit the root config below. Aliases used by
          // anything in the main bundle graph must be declared here too.
          resolve: { alias: mainProcessAliases },
          build: {
            emptyOutDir: true,
            rollupOptions: {
              external: (id) => {
                if (id.startsWith('node:')) return true
                // Aliases must be bundled. dist-electron has no alias resolution
                // at runtime, so a surviving '@shared/...' specifier would make
                // the packaged app die with "Cannot find package '@shared'".
                // electron:dev cannot catch this, only a real build can.
                if (id.startsWith('@shared/') || id.startsWith('@server/')) return false
                if (id.startsWith('.') || id.startsWith('/') || id.startsWith('#')) return false
                // Keep audiobook-related native deps external — they ship via
                // electron-builder's `files` list and resolve from node_modules.
                const audiobookExternals = [
                  'kokoro-js', 'onnxruntime-node', 'onnxruntime-common',
                  'phonemizer', '@huggingface/transformers',
                  '@huggingface/jinja', '@huggingface/tokenizers',
                ]
                if (audiobookExternals.some(p => id === p || id.startsWith(p + '/'))) return true
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
      '@client': zone('client'),
      ...mainProcessAliases,
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3147',
    },
  },
})
