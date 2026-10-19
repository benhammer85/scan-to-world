#!/usr/bin/env bash
# Publish Well Rounded to GitHub Pages: builds the site (the daily practice as index.html, the first
# game as classic.html) and pushes it, as the whole of the branch, to a repository of its own whose
# Pages are served from that branch's root. (This repository's own Pages are Warm to the Touch's.)
#
#   scripts/publish-pages.sh [remote-url] [branch]
#   default: https://github.com/benhammer85/well-rounded main
set -euo pipefail
REMOTE="${1:-https://github.com/benhammer85/well-rounded}"
BRANCH="${2:-main}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_REV="$(git -C "$ROOT" rev-parse --short HEAD)"

cd "$ROOT"
GAME=rings npm run build:app

OUT="$(mktemp -d)"
cp -R dist-rings/. "$OUT/"
# (No Jekyll: serve the files as they are.)
touch "$OUT/.nojekyll"
cat > "$OUT/README.md" <<EOF
# Well Rounded

A ring a day. This repository is the published site only, built from
[benhammer85/scan-to-world](https://github.com/benhammer85/scan-to-world) (branch \`annulus-oak\`,
commit \`$SRC_REV\`) by \`scripts/publish-pages.sh\`. Edit the source there, not here.
EOF

cd "$OUT"
git init -q -b "$BRANCH"
git add -A
git -c user.name="$(git -C "$ROOT" config user.name || echo publisher)" -c user.email="$(git -C "$ROOT" config user.email || echo publisher@localhost)" \
  commit -q -m "Publish Well Rounded from scan-to-world $SRC_REV"
git push -f "$REMOTE" "HEAD:$BRANCH"
echo "Published $SRC_REV to $REMOTE ($BRANCH)"
