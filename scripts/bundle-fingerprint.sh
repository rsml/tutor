#!/usr/bin/env bash
# Prints every bare module specifier that survives into the built Electron main
# bundle, one per line, sorted and deduplicated.
#
# Why this exists: the Electron main build does NOT inherit the root vite
# config. vite-plugin-electron calls mergeConfig(defaultConfig, options.vite)
# with configFile:false, so root `resolve.alias` is invisible to it, and its
# rollup `external()` returns true for anything it does not recognise. An
# alias specifier such as `@shared/domain.js` that is not explicitly bundled
# therefore survives into dist-electron/main.js and the packaged app dies at
# runtime with "Cannot find package '@shared'". Crucially, `electron:dev` does
# not catch this, because dev loads the renderer from the Vite server.
#
# The monorepo-shape refactor uses this as a no-op proof: run it before any
# move, run it after each step, and the diff must stay empty. A new bare
# specifier appearing in the output means external() needs fixing before the
# change can land.
#
# Usage:
#   pnpm build && scripts/bundle-fingerprint.sh > /tmp/externals-after.txt
#   diff /tmp/externals-before.txt /tmp/externals-after.txt
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d dist-electron ]; then
  echo "dist-electron/ not found. Run 'pnpm build' first." >&2
  exit 1
fi

grep -ohE 'from ?"[^"]+"' dist-electron/*.js | sort -u
