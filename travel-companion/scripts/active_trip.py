#!/usr/bin/env python3
"""Resolve / switch / create the *active trip* for the current session.

The active trip is the answer to "where do I commit this conversation?".
It is stored in `.workbuddy/active-trip` (a tiny JSON file) at the agent's
current working directory, so each terminal / session can track its own
trip in parallel — and a `cd` is enough to switch context.

Subcommands
-----------

    show
        Print the current active trip (if any).

    resolve <hint>
        Look at the hint (a slug like "kyoto" or a free-form title like
        "京都樱花") and either:
          - resume an existing trip whose slug / title / aliases match
            (fuzzy, case- and space-insensitive), or
          - create a new trips/<slug>/ scaffold and write meta.json.
        Either way, write the resolved slug into .workbuddy/active-trip.

    switch <slug>
        Force switch to an existing trip. Errors if not found.

    new <slug> [--title TITLE] [--subtitle SUBTITLE]
        Create a fresh trips/<slug>/ scaffold and switch to it. Errors if
        the slug already exists.

    rename <new-slug> [--title NEW_TITLE]
        Rename the current active trip — both its directory
        (trips/<old> → trips/<new>) and its meta.json (slug + optionally
        title). Updates .workbuddy/active-trip atomically. Use this when
        the user pushes back on the auto-derived slug right after the
        first turn ("叫它 kyoto-spring 吧").

    clear
        Forget the active trip — next call to resolve will treat it as
        first-touch.

All commands print one JSON line on stdout: {ok, action, slug, dir, ...}.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

SKILL_DIR = Path(__file__).parent.parent
ACTIVE_FILE_REL = Path(".workbuddy") / "active-trip"

# `TRIPS_DIR` is intentionally a module-level mutable global. `main()`
# populates it after CLI/env/heuristic resolution, then every downstream
# helper reads the resolved path. Tests can also assign to it directly.
TRIPS_DIR: Path = SKILL_DIR / "trips"  # placeholder; main() overrides.


def resolve_trips_dir(cli_value: str | None, cwd: Path) -> Path:
    """Decide where 'trips/' lives. Precedence:

    1. --trips-dir CLI flag
    2. TRIPS_DIR environment variable
    3. nearest ancestor of cwd that contains a `trips/` directory
       (so cd-ing into ~/Trips/ — which holds trips/ — Just Works)
    4. cwd / "trips"  (will be created on first `new`/`resolve`)
    """
    if cli_value:
        return Path(cli_value).expanduser().resolve()
    env = os.environ.get("TRIPS_DIR")
    if env:
        return Path(env).expanduser().resolve()
    cur = cwd.resolve()
    for p in [cur, *cur.parents]:
        candidate = p / "trips"
        if candidate.is_dir():
            return candidate
    return cur / "trips"


# ---------------------------------------------------------------------------
# slug + matching helpers
# ---------------------------------------------------------------------------

# A reasonable ASCII slug:
#   "京都" → "kyoto" (transliteration is not attempted — we keep CJK chars)
#   "Kyoto Spring 2026" → "kyoto-spring-2026"
#   "Egypt — South Route!" → "egypt-south-route"
SLUG_BAD_CHARS = re.compile(r"[^a-z0-9\u4e00-\u9fff\-]+")
SLUG_DASHES = re.compile(r"-+")


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).strip().lower()
    s = s.replace(" ", "-").replace("_", "-").replace("／", "-").replace("/", "-")
    s = SLUG_BAD_CHARS.sub("-", s)
    s = SLUG_DASHES.sub("-", s).strip("-")
    return s or "trip"


def _norm(s: str) -> str:
    """Aggressive normalization for fuzzy match — strip whitespace, lower,
    drop punctuation. CJK chars are kept as-is."""
    s = unicodedata.normalize("NFKC", s).lower()
    return re.sub(r"[\s_\-—–·\.,!?！？\(\)（）【】\[\]\"'`]+", "", s)


def list_trips() -> list[dict]:
    if not TRIPS_DIR.exists():
        return []
    out = []
    for p in sorted(d for d in TRIPS_DIR.iterdir() if d.is_dir()):
        if p.name.startswith("."):
            continue
        meta_file = p / ".trip" / "meta.json"
        meta = {"slug": p.name, "title": p.name, "aliases": []}
        if meta_file.exists():
            try:
                meta.update(json.loads(meta_file.read_text(encoding="utf-8")))
            except Exception:
                pass
        meta["slug"] = p.name  # filesystem is the source of truth
        meta["dir"] = str(p)
        out.append(meta)
    return out


def fuzzy_find(hint: str, trips: list[dict]) -> dict | None:
    needle = _norm(hint)
    if not needle:
        return None
    # 1) exact slug
    for t in trips:
        if t["slug"].lower() == hint.lower():
            return t
    # 2) normalized title / aliases / slug equality
    for t in trips:
        candidates = [t.get("title", ""), t["slug"]] + list(t.get("aliases", []))
        for c in candidates:
            if c and _norm(c) == needle:
                return t
    # 3) substring containment, both ways
    best = None
    best_score = 0
    for t in trips:
        candidates = [t.get("title", ""), t["slug"]] + list(t.get("aliases", []))
        for c in candidates:
            n = _norm(c)
            if not n:
                continue
            score = 0
            if needle in n or n in needle:
                # longer overlap = better
                score = min(len(needle), len(n))
            if score > best_score:
                best, best_score = t, score
    return best


# ---------------------------------------------------------------------------
# active-trip pointer (per cwd)
# ---------------------------------------------------------------------------

def active_file(cwd: Path) -> Path:
    return cwd / ACTIVE_FILE_REL


def read_active(cwd: Path) -> dict | None:
    f = active_file(cwd)
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_active(cwd: Path, slug: str) -> Path:
    f = active_file(cwd)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({
        "slug": slug,
        "dir": str(TRIPS_DIR / slug),
        "tripsDir": str(TRIPS_DIR),
        "updatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return f


def clear_active(cwd: Path) -> None:
    f = active_file(cwd)
    if f.exists():
        f.unlink()


# ---------------------------------------------------------------------------
# scaffold a new trip
# ---------------------------------------------------------------------------

def scaffold_trip(slug: str, title: str | None = None,
                  subtitle: str | None = None,
                  destination: str | None = None) -> Path:
    target = TRIPS_DIR / slug
    if target.exists():
        raise FileExistsError(f"trips/{slug} already exists")
    TRIPS_DIR.mkdir(parents=True, exist_ok=True)
    (target / ".trip").mkdir(parents=True)
    (target / "wiki" / "entities").mkdir(parents=True)
    (target / "recommendations" / "shots").mkdir(parents=True)
    (target / "recommendations" / "food").mkdir(parents=True)
    (target / "recommendations" / "itinerary").mkdir(parents=True)
    (target / "recommendations" / "spots").mkdir(parents=True)
    (target / "data").mkdir(parents=True)

    # Copy SCHEMA.md if present.
    schema_src = SKILL_DIR / "assets" / "SCHEMA.md"
    if schema_src.exists():
        (target / ".trip" / "SCHEMA.md").write_text(
            schema_src.read_text(encoding="utf-8"), encoding="utf-8")

    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    meta = {
        "slug": slug,
        "title": title or slug,
        "subtitle": subtitle,
        "destination": destination,
        "countryHint": None,
        "cover": None,
        "createdAt": now,
    }
    (target / ".trip" / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    (target / ".trip" / "state.json").write_text(json.dumps({
        "version": 1,
        "created": now,
        "turns_ingested": 0,
        "last_ingest": None,
        "places_known": 0,
    }, indent=2), encoding="utf-8")
    (target / ".trip" / "session-log.jsonl").touch()

    # Empty trip.json so build_trips_manifest.py doesn't skip it before
    # the first export_data run.
    (target / "data" / "trip.json").write_text(json.dumps({
        "version": 1,
        "destination": destination,
        "countryHint": None,
        "entities": [], "events": [],
        "sessionLog": [], "recommendations": [],
        "generatedAt": now,
    }, ensure_ascii=False), encoding="utf-8")
    return target


# ---------------------------------------------------------------------------
# subcommand handlers
# ---------------------------------------------------------------------------

def cmd_show(args) -> int:
    cwd = Path(args.cwd).resolve()
    cur = read_active(cwd)
    if not cur:
        print(json.dumps({"ok": True, "active": None,
                          "trips": [t["slug"] for t in list_trips()],
                          "cwd": str(cwd)}, ensure_ascii=False))
        return 0
    print(json.dumps({"ok": True, "active": cur,
                      "trips": [t["slug"] for t in list_trips()],
                      "cwd": str(cwd)}, ensure_ascii=False))
    return 0


def cmd_resolve(args) -> int:
    cwd = Path(args.cwd).resolve()
    hint = args.hint.strip()
    if not hint:
        print(json.dumps({"ok": False, "error": "empty hint"}), file=sys.stderr)
        return 2

    trips = list_trips()
    match = fuzzy_find(hint, trips)
    if match:
        write_active(cwd, match["slug"])
        print(json.dumps({"ok": True, "action": "resumed",
                          "slug": match["slug"], "dir": match["dir"],
                          "title": match.get("title"),
                          "matchedOn": hint}, ensure_ascii=False))
        return 0

    # Not found — create.
    slug = slugify(args.slug or hint)
    if (TRIPS_DIR / slug).exists():
        # Slug clash but title didn't match — disambiguate with -2
        i = 2
        while (TRIPS_DIR / f"{slug}-{i}").exists():
            i += 1
        slug = f"{slug}-{i}"
    target = scaffold_trip(slug, title=args.title or hint,
                           subtitle=args.subtitle,
                           destination=args.destination)
    write_active(cwd, slug)
    print(json.dumps({"ok": True, "action": "created",
                      "slug": slug, "dir": str(target),
                      "title": args.title or hint}, ensure_ascii=False))
    return 0


def cmd_switch(args) -> int:
    cwd = Path(args.cwd).resolve()
    trips = list_trips()
    match = fuzzy_find(args.slug, trips) or next(
        (t for t in trips if t["slug"] == args.slug), None)
    if not match:
        print(json.dumps({"ok": False, "error": f"no trip matches {args.slug!r}",
                          "trips": [t["slug"] for t in trips]}, ensure_ascii=False),
              file=sys.stderr)
        return 3
    write_active(cwd, match["slug"])
    print(json.dumps({"ok": True, "action": "switched",
                      "slug": match["slug"], "dir": match["dir"],
                      "title": match.get("title")}, ensure_ascii=False))
    return 0


def cmd_new(args) -> int:
    cwd = Path(args.cwd).resolve()
    slug = slugify(args.slug)
    if (TRIPS_DIR / slug).exists():
        print(json.dumps({"ok": False, "error": f"trips/{slug} already exists"}),
              file=sys.stderr)
        return 4
    target = scaffold_trip(slug, title=args.title or slug,
                           subtitle=args.subtitle,
                           destination=args.destination)
    write_active(cwd, slug)
    print(json.dumps({"ok": True, "action": "created",
                      "slug": slug, "dir": str(target),
                      "title": args.title or slug}, ensure_ascii=False))
    return 0


def cmd_clear(args) -> int:
    cwd = Path(args.cwd).resolve()
    clear_active(cwd)
    print(json.dumps({"ok": True, "action": "cleared"}, ensure_ascii=False))
    return 0


def cmd_rename(args) -> int:
    """Rename the *active* trip's directory + meta.json + active-trip pointer."""
    cwd = Path(args.cwd).resolve()
    cur = read_active(cwd)
    if not cur:
        print(json.dumps({"ok": False,
                          "error": "no active trip — call `resolve` first"}),
              file=sys.stderr)
        return 5
    old_slug = cur["slug"]
    new_slug = slugify(args.new_slug)
    if new_slug == old_slug:
        print(json.dumps({"ok": True, "action": "noop", "slug": old_slug},
                         ensure_ascii=False))
        return 0
    src = TRIPS_DIR / old_slug
    dst = TRIPS_DIR / new_slug
    if not src.exists():
        print(json.dumps({"ok": False,
                          "error": f"source dir trips/{old_slug} missing"}),
              file=sys.stderr)
        return 6
    if dst.exists():
        print(json.dumps({"ok": False,
                          "error": f"target dir trips/{new_slug} already exists"}),
              file=sys.stderr)
        return 7
    src.rename(dst)
    # Update meta.json
    meta_file = dst / ".trip" / "meta.json"
    meta = {}
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception:
            meta = {}
    meta["slug"] = new_slug
    if args.title is not None:
        meta["title"] = args.title
    meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2),
                         encoding="utf-8")
    write_active(cwd, new_slug)
    print(json.dumps({"ok": True, "action": "renamed",
                      "from": old_slug, "to": new_slug,
                      "dir": str(dst),
                      "title": meta.get("title")}, ensure_ascii=False))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cwd", default=".",
                    help="Where to read/write .workbuddy/active-trip (default: cwd)")
    ap.add_argument("--trips-dir", default=None,
                    help="Override trips directory location. "
                         "Falls back to $TRIPS_DIR, then nearest ancestor "
                         "of cwd containing trips/, then cwd/trips.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("show").set_defaults(fn=cmd_show)

    p = sub.add_parser("resolve",
                       help="Resolve a free-form hint to a trip — resume or create.")
    p.add_argument("hint")
    p.add_argument("--slug", help="Override the auto-derived slug")
    p.add_argument("--title", help="Override the title for new trips")
    p.add_argument("--subtitle")
    p.add_argument("--destination")
    p.set_defaults(fn=cmd_resolve)

    p = sub.add_parser("switch",
                       help="Force-switch to an existing trip.")
    p.add_argument("slug")
    p.set_defaults(fn=cmd_switch)

    p = sub.add_parser("new",
                       help="Create a new trip and switch to it.")
    p.add_argument("slug")
    p.add_argument("--title")
    p.add_argument("--subtitle")
    p.add_argument("--destination")
    p.set_defaults(fn=cmd_new)

    sub.add_parser("clear",
                   help="Forget the active trip for this cwd.").set_defaults(fn=cmd_clear)

    p = sub.add_parser("rename",
                       help="Rename the active trip (dir + meta + pointer).")
    p.add_argument("new_slug")
    p.add_argument("--title")
    p.set_defaults(fn=cmd_rename)

    args = ap.parse_args()

    # Resolve trips dir once and pin it on the global so every helper sees it.
    global TRIPS_DIR
    TRIPS_DIR = resolve_trips_dir(args.trips_dir, Path(args.cwd))

    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
