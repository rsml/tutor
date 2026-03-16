#!/bin/bash
set -euo pipefail

# Apple signing credentials
export APPLE_ID="admin@serendipityapps.com"
export APPLE_TEAM_ID="9CD626Q2L2"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
  echo "Error: APPLE_APP_SPECIFIC_PASSWORD not found in .env or environment"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
DMG="release/Tutor-${VERSION}-arm64.dmg"
TAG="v${VERSION}"

echo "==> Building Tutor ${VERSION} with code signing + notarization..."
pnpm electron:build

echo "==> Verifying code signature..."
codesign -dv --verbose=2 release/mac-arm64/Tutor.app

echo "==> Verifying Gatekeeper acceptance..."
spctl -a -vvv release/mac-arm64/Tutor.app

if [ ! -f "$DMG" ]; then
  echo "Error: Expected DMG not found at ${DMG}"
  exit 1
fi

echo "==> Creating GitHub release ${TAG}..."
gh release create "$TAG" "$DMG" \
  --title "Tutor ${VERSION}" \
  --generate-notes

echo "==> Done! Release published at:"
gh release view "$TAG" --json url -q .url
