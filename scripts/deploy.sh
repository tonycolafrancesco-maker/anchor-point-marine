#!/usr/bin/env bash
# Build the site and publish dist/ to the gh-pages branch.
#
# Why this exists instead of a GitHub Actions workflow:
# the credential this repo was created with holds `repo` scope but not
# `workflow` scope, so it cannot push .github/workflows/*. Once the CEO grants
# workflow scope (gh auth refresh -s workflow), swap this for CI — the workflow
# file is kept at docs/deploy.yml.example, ready to move into place.
#
# Usage:  ./scripts/deploy.sh
set -euo pipefail

REPO="tonycolafrancesco-maker/anchor-point-marine"
BRANCH="gh-pages"

cd "$(dirname "$0")/.."

echo "==> Building"
npm run build

TOK="$(gh auth token -h github.com -u tonycolafrancesco-maker)"
if [ -z "$TOK" ]; then
  echo "No GitHub token available. Run: gh auth login" >&2
  exit 1
fi

# Credentials are embedded in the URL so the global
# url.git@github.com:.insteadOf https://github.com/ rewrite does not match and
# force this through SSH.
PUSH_URL="https://x-access-token:${TOK}@github.com/${REPO}.git"

# .nojekyll stops GitHub Pages' Jekyll pass from dropping _astro/.
touch dist/.nojekyll

echo "==> Publishing to ${BRANCH}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cp -r dist/. "$WORK/"
cd "$WORK"
git init -q -b "$BRANCH"
git add -A
git -c user.name="Anchor Point Deploy" -c user.email="wheresjoe@gmail.com" \
  commit -q -m "Deploy site"
git push -q --force "$PUSH_URL" "$BRANCH:$BRANCH" 2>&1 | sed "s#${TOK}#***#g"

echo "==> Done: https://tonycolafrancesco-maker.github.io/anchor-point-marine/"
