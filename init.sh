#!/bin/bash
set -e

echo "=== Harness Initialization ==="

if [ ! -f package.json ]; then
  echo "Missing package.json."
  echo "Create or import the Muse Bun + Next.js scaffold before running full verification."
  echo "Expected scripts after scaffold: typecheck, lint, build."
  exit 1
fi

echo "=== bun install ==="
bun install

echo "=== bun run typecheck ==="
bun run typecheck

echo "=== bun run lint ==="
bun run lint

echo "=== bun run build ==="
bun run build

echo "=== npx @google/design.md lint DESIGN.md ==="
npx @google/design.md lint DESIGN.md

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming done"
