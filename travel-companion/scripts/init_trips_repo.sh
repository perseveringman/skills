#!/usr/bin/env bash
# Initialize a brand-new "trips repo" directory ready for the
# travel-companion skill. After this:
#
#   cd <repo>          → start a codebuddy / agent session here
#   chat about trips   → skill writes into trips/<slug>/ + commits + pushes
#
# This script ONLY initializes the data side. Deploying the explorer
# website is a separate one-time step (see SKILL.md "Deployment").
#
# Usage:
#   bash scripts/init_trips_repo.sh ~/Trips
#   bash scripts/init_trips_repo.sh ~/Trips --remote git@github.com:me/trips.git
#   bash scripts/init_trips_repo.sh ~/Trips --seed egypt-south
#
# Flags:
#   --remote URL    git remote add origin URL
#   --seed NAME     copy fixtures/<NAME>/ into trips/<NAME>/ as a starter
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=""
REMOTE=""
SEED=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote) REMOTE="$2"; shift 2 ;;
    --seed)   SEED="$2";   shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      if [[ -z "$TARGET" ]]; then TARGET="$1"; shift
      else echo "! unexpected arg: $1" >&2; exit 1; fi ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "! usage: $0 <target-dir> [--remote URL] [--seed NAME]" >&2
  exit 1
fi

# Expand ~/...
TARGET="${TARGET/#~/$HOME}"

if [[ -e "$TARGET" && ! -d "$TARGET" ]]; then
  echo "! $TARGET exists and is not a directory" >&2; exit 1
fi
mkdir -p "$TARGET"
cd "$TARGET"

echo "==> initializing trips repo at $TARGET"
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
    cp -R "$src" "trips/$SEED"
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

# .gitignore — keep the per-cwd active-trip pointer local
cat > .gitignore <<'EOF'
# personal pointer (per-cwd active trip)
.workbuddy/

# OS junk
.DS_Store
**/.DS_Store

# transient
*.log
EOF

# README
cat > README.md <<EOF
# Trips

Travel knowledge base for the [\`travel-companion\`](https://github.com/perseveringman/skills/tree/main/travel-companion)
skill. Each \`trips/<slug>/\` directory is one journey, fully documented
through conversation.

## How it works

1. \`cd\` into this repo from any agent session.
2. Just chat about a trip. The agent (with the skill loaded) extracts
   entities, geocodes places, writes markdown into \`trips/<slug>/wiki/\`
   and \`trips/<slug>/recommendations/\`.
3. After every turn, the agent runs \`scripts/publish.py\` to commit + push.
4. (Optional) Set up Vercel deployment — see SKILL.md.

## Layout

\`\`\`
trips/
  <slug>/
    .trip/meta.json
    .trip/session-log.jsonl
    wiki/entities/*.md
    recommendations/{shots,food,itinerary,spots}/*.md
    data/trip.json
\`\`\`
EOF

# git init
if [[ ! -d .git ]]; then
  git init -q
  git add -A
  git commit -q -m "init trips repo (travel-companion skill)"
  if [[ -n "$REMOTE" ]]; then
    git remote add origin "$REMOTE"
    echo "==> remote set: $REMOTE"
  fi
fi

echo
echo "✓ done. Next steps:"
echo "  1. cd $TARGET"
echo "  2. open an agent session (codebuddy / claude / etc.) here"
echo "  3. just chat — say something like '我下个月想去京都'"
if [[ -n "$REMOTE" ]]; then
  echo "  4. git push -u origin main  (first push)"
  echo "  5. import this repo on https://vercel.com/new (one-time)"
fi
