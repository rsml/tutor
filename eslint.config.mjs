import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * Import boundaries between the four zones.
 *
 * client and server never touch each other. shared is the only meeting point
 * and depends on neither. Inside shared, `shared/node/` is the Node-only corner
 * and must never reach browser code, because importing it from the client would
 * pull `process` into the renderer bundle.
 *
 * Each group lists both the alias form and the relative-escape form, since this
 * rule matches on the import string rather than resolving paths. That pairing is
 * what closes the gap for every form this repo can actually produce. The
 * typescript-eslint version of the rule is used rather than the core one so that
 * `import type` is covered too, and ESLint applies it to dynamic `import()` with
 * a literal argument, which is the exact shape of the old electron to renderer
 * violation this refactor removed.
 */
const forbid = (patterns) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
})

// shared/ may not reach outward into either application zone.
const NO_APP_ZONES = {
  group: ['@client/**', '**/client/**', '@server/**', '**/server/**'],
  message: 'shared/ is the dependency root, so it may not import client or server.',
}

// Flat config replaces a rule rather than merging it when a later block matches
// the same file, so the narrower shared/*.ts block below must restate the
// patterns from the broader shared/**/*.ts block. Leaving them out silently
// disabled the client and server restriction for every top-level shared file.
const NO_NODE_CORNER = {
  group: ['@shared/node/**', './node/**'],
  message: 'Files directly in shared/ are browser-safe and may not import the Node-only shared/node/ corner.',
}

const boundaries = [
  {
    files: ['client/**/*.{ts,tsx}'],
    rules: forbid([
      {
        group: ['@server/**', '**/server/**'],
        message: 'client to server is forbidden. Call the API through the client API module, and share types via @shared/*.',
      },
      {
        group: ['@shared/node/**', '**/shared/node/**'],
        message: '@shared/node/* is Node-only and cannot run in the browser.',
      },
    ]),
  },
  {
    // Everything that reaches the server goes through client/api/. This is a
    // rule rather than a convention because the client used to hold eighty
    // four scattered fetch calls, and the only durable reason it now holds
    // none is that adding one fails the build.
    //
    // EventSource is covered too, because reconnection has to live in one
    // place. The background task stream used to be constructed in two
    // separate components, each with its own idea of when to reconnect.
    files: ['client/**/*.{ts,tsx}'],
    ignores: ['client/api/**'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'Reach the server through @client/api rather than calling fetch. If an endpoint is missing, add a function to the matching api module.',
        },
        {
          selector: "NewExpression[callee.name='EventSource']",
          message: 'Subscribe through @client/api rather than constructing an EventSource, so reconnection stays in one place.',
        },
      ],
    },
  },
  {
    files: ['server/**/*.ts'],
    rules: forbid([
      {
        group: ['@client/**', '**/client/**'],
        message: 'server to client is forbidden. Move anything both sides need into shared/.',
      },
    ]),
  },
  {
    files: ['shared/**/*.ts'],
    rules: forbid([NO_APP_ZONES]),
  },
  {
    // Browser-safe shared modules only, meaning the files directly in shared/.
    // shared/node/** is deliberately not matched here because it is allowed,
    // and required, to use Node built-ins.
    files: ['shared/*.ts'],
    rules: forbid([NO_APP_ZONES, NO_NODE_CORNER]),
  },
  {
    files: ['electron/**/*.ts'],
    rules: forbid([
      {
        group: ['@client/**', '**/client/**'],
        message: 'The Electron main process may not import renderer code. Put shared logic in shared/.',
      },
    ]),
  },
  {
    // The end-to-end journey suite drives the client through a browser, never
    // by importing it. It may reach @server and @shared, because it boots the
    // real server in process and wires Phase 2's own fakes into it, but a
    // direct @client import would mean a journey had reached past the browser
    // into the code it is supposed to be testing from the outside.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    rules: forbid([
      {
        group: ['@client/**', '**/client/**'],
        message: 'A journey drives the client through the browser. Assert on what a reader can see, not on client internals.',
      },
    ]),
  },
  {
    files: ['e2e/**/*.ts'],
    rules: {
      // Playwright fixtures that take no dependencies are declared with an
      // empty destructuring pattern, which is the framework's own documented
      // signature and not the mistake this rule usually catches.
      'no-empty-pattern': 'off',
      // A Playwright fixture hands its value to the test by calling `use`,
      // which is an unrelated function that happens to share a name with
      // React 19's hook. There is no React in this zone at all.
      'react-hooks/rules-of-hooks': 'off',
    },
  },
]

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'books/**',
      // Nested git worktrees can hold full copies of this repo, including their
      // own source tree. Linting them would report another branch's problems.
      '.worktrees/**',
      '.claude/worktrees/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['client/**/*.{ts,tsx}', 'shared/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['server/**/*.ts', 'electron/**/*.ts', 'shared/node/**/*.ts', 'e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
  ...boundaries,
)
