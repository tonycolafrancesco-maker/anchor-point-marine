#!/usr/bin/env bash
# Build the site and publish dist/ to the gh-pages branch.
#
# Builds from a clean export of a committed ref (default HEAD), NOT from the
# working tree. This repo is worked on by more than one agent at a time, and a
# working-tree build will happily publish somebody else's half-finished page.
# What is deployed must be what is committed.
#
# Why this exists instead of a GitHub Actions workflow:
# the credential this repo was created with holds `repo` scope but not
# `workflow` scope, so it cannot push .github/workflows/*. Once the CEO grants
# workflow scope (gh auth refresh -s workflow), swap this for CI — the workflow
# file is kept at docs/deploy.yml.example, ready to move into place.
#
# Usage:  ./scripts/deploy.sh [ref]      e.g. ./scripts/deploy.sh HEAD
set -euo pipefail

REPO="tonycolafrancesco-maker/anchor-point-marine"
BRANCH="gh-pages"
REF="${1:-HEAD}"

cd "$(dirname "$0")/.."
ROOT="$PWD"

if ! git diff --quiet "$REF" -- . 2>/dev/null; then
  echo "note: working tree differs from $REF — deploying $REF, not your local edits."
fi

BUILD="$(mktemp -d)"
PUB="$(mktemp -d)"
trap 'rm -rf "$BUILD" "$PUB"' EXIT

echo "==> Exporting $REF ($(git rev-parse --short "$REF"))"
git archive "$REF" | tar -x -C "$BUILD"

# Reuse the installed dependencies rather than a fresh npm ci. Safe because the
# build fails loudly if the exported package.json wants something absent.
if [ -d "$ROOT/node_modules" ]; then
  cp -r "$ROOT/node_modules" "$BUILD/node_modules"
else
  (cd "$BUILD" && npm ci)
fi

echo "==> Building"
(cd "$BUILD" && npm run build)

TOK="$(gh auth token -h github.com -u tonycolafrancesco-maker)"
if [ -z "$TOK" ]; then
  echo "No GitHub token available. Run: gh auth login" >&2
  exit 1
fi

# Credentials are embedded in the URL so the global
# url.git@github.com:.insteadOf https://github.com/ rewrite does not match and
# force this through SSH.
PUSH_URL="https://x-access-token:${TOK}@github.com/${REPO}.git"

cp -r "$BUILD/dist/." "$PUB/"
# .nojekyll stops GitHub Pages' Jekyll pass from dropping _astro/.
touch "$PUB/.nojekyll"

echo "==> Publishing to ${BRANCH}"
cd "$PUB"
git init -q -b "$BRANCH"
git add -A
git -c user.name="Anchor Point Deploy" -c user.email="wheresjoe@gmail.com" \
  commit -q -m "Deploy $(cd "$ROOT" && git rev-parse --short "$REF")"
git push -q --force "$PUSH_URL" "$BRANCH:$BRANCH" 2>&1 | sed "s#${TOK}#***#g"

echo "==> Done: https://tonycolafrancesco-maker.github.io/anchor-point-marine/"
