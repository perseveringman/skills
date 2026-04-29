#!/usr/bin/env bash
# Initialize (or upgrade) a self-contained "trips repo" — a directory
# that holds your trips/ data PLUS a copy of the explorer SPA + scripts +
# vercel.json. After this:
#
#   cd <repo>          → start chatting in any agent session
#   git push           → Vercel auto-builds & deploys the site
#
# The user repo is fully self-contained: no submodules, no skill
# dependency at runtime. Skill upgrades are pulled in via:
#
#   bash <skill>/scripts/init_trips_repo.sh <existing-repo> --upgrade
#
# which re-copies web/, scripts/ and vercel.json but leaves trips/ alone.
#
# Usage:
#   bash scripts/init_trips_repo.sh ~/Trips
#   bash scripts/init_trips_repo.sh ~/Trips --remote git@github.com:me/trips.git
#   bash scripts/init_trips_repo.sh ~/Trips --seed egypt-south
#   bash scripts/init_trips_repo.sh ~/Trips --upgrade
#
# Flags:
#   --remote URL    git remote add origin URL (only on init)
#   --seed NAME     copy fixtures/<NAME>/ into trips/<NAME>/ as a starter
#   --upgrade       refresh web/ scripts/ vercel.json from skill;
#                   leaves trips/ + .workbuddy/ + git history untouched
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=""
REMOTE=""
SEED=""
UPGRADE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)  REMOTE="$2"; shift 2 ;;
    --seed)    SEED="$2";   shift 2 ;;
    --upgrade) UPGRADE=1;   shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      if [[ -z "$TARGET" ]]; then TARGET="$1"; shift
      else echo "! unexpected arg: $1" >&2; exit 1; fi ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "! usage: $0 <target-dir> [--remote URL] [--seed NAME] [--upgrade]" >&2
  exit 1
fi

# Expand ~/...
TARGET="${TARGET/#~/$HOME}"

if [[ -e "$TARGET" && ! -d "$TARGET" ]]; then
  echo "! $TARGET exists and is not a directory" >&2; exit 1
fi
mkdir -p "$TARGET"
cd "$TARGET"

# ───────────────────────────────────────────────────────────────────────
# Copy the SPA + scripts + vercel.json from the skill into the user repo.
# This is the "self-contained" part — after this, the user repo can be
# built by Vercel without referencing the skill.
# ───────────────────────────────────────────────────────────────────────
echo "==> copying explorer SPA into web/"
mkdir -p web
# Copy everything except node_modules, dist, public/trips/ (transient).
rsync -a --delete \
      --exclude="node_modules" \
      --exclude="dist" \
      --exclude="public/trips" \
      --exclude=".thumbs" \
      "$SKILL_DIR/web/" "web/"

echo "==> copying scripts/ into scripts/"
mkdir -p scripts
rsync -a --delete \
      --exclude="__pycache__" \
      --exclude=".thumbs" \
      --exclude=".DS_Store" \
      "$SKILL_DIR/scripts/" "scripts/"

echo "==> copying assets/ into assets/ (SCHEMA.md + single-file template)"
mkdir -p assets
rsync -a --exclude=".thumbs" --exclude=".DS_Store" \
      "$SKILL_DIR/assets/" "assets/"

echo "==> copying references/ into references/ (extraction prompts etc.)"
mkdir -p references
rsync -a --exclude=".thumbs" --exclude=".DS_Store" \
      "$SKILL_DIR/references/" "references/"

# Write vercel.json (self-contained — points at local web/)
echo "==> writing vercel.json"
cat > vercel.json <<'EOF'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "cd web && npm install && TRIPS_DIR=../trips npm run build && rm -rf ../dist && cp -R dist ../dist",
  "outputDirectory": "dist",
  "framework": null,
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/trips/(.*)\\.json",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=60, stale-while-revalidate=600" },
        { "key": "Content-Type", "value": "application/json; charset=utf-8" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/((?!trips/|assets/|favicon).*)", "destination": "/index.html" }
  ]
}
EOF

# ───────────────────────────────────────────────────────────────────────
# Init-only steps (skipped on --upgrade).
# ───────────────────────────────────────────────────────────────────────
if [[ $UPGRADE == 0 ]]; then
  echo "==> initializing trips/ data dir"
  mkdir -p trips

  if [[ -n "$SEED" ]]; then
    src="$SKILL_DIR/fixtures/$SEED"
    if [[ ! -d "$src" ]]; then
      echo "! seed fixture not found: $src" >&2; exit 1
    fi
    if [[ -d "trips/$SEED" ]]; then
      echo "==> trips/$SEED already exists, skipping seed"
    else
      echo "==> seeding trips/$SEED from fixtures/$SEED"
      rsync -a --exclude="graph" --exclude="map" --exclude=".thumbs" \
            --exclude=".DS_Store" \
            "$src/" "trips/$SEED/"
      if [[ ! -f "trips/$SEED/.trip/meta.json" ]]; then
        cat > "trips/$SEED/.trip/meta.json" <<EOF
{
  "slug": "$SEED",
  "title": "$SEED",
  "subtitle": null,
  "destination": null,
  "countryHint": null,
  "cover": null,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"
}
EOF
      fi
    fi
  fi

  # .gitignore
  cat > .gitignore <<'EOF'
# Personal pointer (per-cwd active trip) — never commit
.workbuddy/

# Build outputs
node_modules/
dist/
web/dist/
web/public/trips/

# OS junk
.DS_Store
**/.DS_Store

# Editor
.vscode/
.idea/

# Transient
*.log
EOF

  cat > README.md <<'EOF'
# My Trips

A travel knowledge base + explorer site, populated by chatting with an
agent that has the [`travel-companion`](https://github.com/perseveringman/skills/tree/main/travel-companion)
skill loaded.

## How to use

1. `cd` into this repo from any agent session (codebuddy / claude code / etc.)
2. Just chat about a trip — the agent will:
   - extract entities into `trips/<slug>/wiki/`
   - geocode places, generate recommendations
   - rebuild `trips/<slug>/data/trip.json`
   - `git commit && git push`
3. Vercel watches this repo and redeploys within ~30 seconds.
4. Open your Vercel URL → see the live explorer.

## Layout

```
trips/<slug>/
  .trip/meta.json            metadata (title, slug, aliases, cover)
  .trip/session-log.jsonl    raw conversation log
  wiki/entities/*.md         the compiled knowledge base
  recommendations/{shots,food,itinerary,spots}/*.md
  data/trip.json             aggregated for the SPA

web/                         self-contained explorer SPA (Vite + React)
scripts/                     skill scripts (don't edit unless upgrading)
assets/                      SCHEMA.md + single-file template
references/                  extraction prompts (the agent reads these)
vercel.json                  build + cache config
```

## Upgrading the skill

When the upstream skill ships UI / script improvements:

```bash
bash <skill>/scripts/init_trips_repo.sh "$(pwd)" --upgrade
git add web/ scripts/ assets/ references/ vercel.json
git commit -m "upgrade skill"
git push
```

`--upgrade` re-copies `web/ scripts/ assets/ references/ vercel.json` but
never touches `trips/`, `.workbuddy/`, or `.git/`.

## Onboarding

See `ONBOARDING.md` for the full first-run guide.
EOF

  # Copy ONBOARDING.md from the skill (kept in sync via --upgrade too)
  if [[ -f "$SKILL_DIR/ONBOARDING.md" ]]; then
    cp "$SKILL_DIR/ONBOARDING.md" ONBOARDING.md
  fi

  if [[ ! -d .git ]]; then
    git init -q
    git add -A
    git commit -q -m "init trips repo (travel-companion skill)"
    if [[ -n "$REMOTE" ]]; then
      git remote add origin "$REMOTE"
      echo "==> remote set: $REMOTE"
    fi
  fi
else
  # Upgrade also refreshes ONBOARDING.md.
  if [[ -f "$SKILL_DIR/ONBOARDING.md" ]]; then
    cp "$SKILL_DIR/ONBOARDING.md" ONBOARDING.md
  fi
  echo "==> upgrade complete — review changes with: git status -s"
fi

echo
if [[ $UPGRADE == 0 ]]; then
  echo "✓ done. Next steps:"
  echo "  1. cd $TARGET"
  echo "  2. open an agent session here (codebuddy / claude / etc.)"
  echo "  3. say something like '我下个月想去京都'"
  if [[ -n "$REMOTE" ]]; then
    echo "  4. git push -u origin main         (first push)"
    echo "  5. import this repo on https://vercel.com/new (one-time)"
  else
    echo "  4. (later) git remote add origin <url>; git push -u origin main"
    echo "  5. (later) import on https://vercel.com/new"
  fi
else
  echo "✓ upgrade done. Stage + commit when ready:"
  echo "  cd $TARGET"
  echo "  git diff --stat"
  echo "  git add -A && git commit -m 'upgrade skill' && git push"
fi
