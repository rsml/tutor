#!/usr/bin/env bash
# The final gate. Clones this repo into a temp dir exactly as a stranger would
# get it, then proves the whole stack from that clone alone, install, every
# unit and contract test, typecheck, lint, dead-code check, both doc checkers,
# the E2E journey suite, a real server boot, and a packaged build smoke.
# Runs against a throwaway data dir, never the user's real library, and never
# needs an API key. Notarization is disabled so the run cannot hang waiting
# for Apple credentials, the signed path stays scripts/release.sh.
set -euo pipefail

TMP="$(mktemp -d "${TMPDIR:-/tmp}/tutor-fresh-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
SRC="$(cd "$(dirname "$0")/.." && pwd)"
START=$(date +%s)

step() { printf '\n== %s\n' "$1"; }

step "clone (tracked files only, catches works-only-with-untracked-files)"
git clone --depth 1 "file://$SRC" "$TMP/tutor"
cd "$TMP/tutor"

step "install"
pnpm install --frozen-lockfile

step "unit and contract tests"
pnpm test

step "typecheck"
pnpm typecheck

step "lint"
pnpm lint

step "dead code"
pnpm knip

step "doc paths"
pnpm tsx scripts/check-doc-paths.ts

step "unnamed buttons"
pnpm tsx scripts/find-unnamed-buttons.mts client

step "routes doc drift"
pnpm docs:routes
git diff --exit-code docs/api-routes.md

step "server boot"
TUTOR_DATA_DIR="$TMP/data" pnpm dev:server &
SERVER_PID=$!
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3147/api/health | grep -q ok; then BOOTED=1; break; fi
  sleep 0.5
done
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
[ "${BOOTED:-0}" = "1" ] || { echo "server never answered /api/health"; exit 1; }

step "e2e journeys (builds the bundle itself)"
TUTOR_DATA_DIR="$TMP/e2e-data" pnpm e2e --project=web

step "packaged build smoke (signed if an identity exists, never notarized here)"
pnpm electron:build -c.mac.notarize=false --publish never
ls release/*.dmg >/dev/null || { echo "no DMG produced"; exit 1; }

printf '\nfresh clone verified green in %ss\n' "$(( $(date +%s) - START ))"
