#!/usr/bin/env python3
"""Scan `trips/*/` and emit a manifest + per-trip data into the SPA's public/.

This is run automatically by `web/`'s build (vercel build) so the deployed
site always reflects the live state of the `trips/` directory in git.

Output (relative to --out-dir, default = web/public/trips/):

    web/public/trips/manifest.json     — list of all trips with metadata
    web/public/trips/<slug>.json        — that trip's data/trip.json copied 1:1

Usage:

    python3 scripts/build_trips_manifest.py
    python3 scripts/build_trips_manifest.py --out-dir web/public/trips
    python3 scripts/build_trips_manifest.py --trips-dir trips
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).parent.parent


def load_meta(trip_dir: Path) -> dict:
    meta_file = trip_dir / ".trip" / "meta.json"
    if meta_file.exists():
        try:
            return json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"! bad meta.json in {trip_dir.name}: {exc}", file=sys.stderr)
    # Fallback: derive from directory name.
    return {
        "slug": trip_dir.name,
        "title": trip_dir.name,
        "subtitle": None,
        "destination": None,
        "countryHint": None,
        "cover": None,
        "createdAt": None,
    }


def trip_summary(trip_dir: Path, data_file: Path) -> dict:
    """Quick stats for the manifest. Reads trip.json once."""
    try:
        data = json.loads(data_file.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    entities = data.get("entities", []) or []
    events = data.get("events", []) or []
    recs = data.get("recommendations", []) or []
    turns = data.get("sessionLog", []) or []
    return {
        "entityCount": len(entities),
        "eventCount": len(events),
        "recommendationCount": len(recs),
        "turnCount": len(turns),
        "generatedAt": data.get("generatedAt"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trips-dir", default=str(SKILL_DIR / "trips"),
                    help="Directory containing trip folders (default: trips/)")
    ap.add_argument("--out-dir", default=str(SKILL_DIR / "web" / "public" / "trips"),
                    help="Directory to write manifest + per-trip JSON")
    args = ap.parse_args()

    trips_dir = Path(args.trips_dir).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if not trips_dir.exists():
        print(json.dumps({"ok": True, "trips": [], "note": "no trips dir"}))
        # Still write an empty manifest so the build doesn't 404.
        (out_dir / "manifest.json").write_text("[]", encoding="utf-8")
        return 0

    entries = []
    for trip_dir in sorted(p for p in trips_dir.iterdir() if p.is_dir()):
        slug = trip_dir.name
        if slug.startswith("."):
            continue
        data_file = trip_dir / "data" / "trip.json"
        if not data_file.exists():
            print(f"! skipping {slug}: missing data/trip.json (run export_data.py)",
                  file=sys.stderr)
            continue
        meta = load_meta(trip_dir)
        meta["slug"] = slug  # always trust the directory name
        meta.update(trip_summary(trip_dir, data_file))

        # Copy data file as <slug>.json.
        shutil.copyfile(data_file, out_dir / f"{slug}.json")
        entries.append(meta)

    (out_dir / "manifest.json").write_text(
        json.dumps(entries, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps({"ok": True, "trips": [e["slug"] for e in entries],
                      "out": str(out_dir)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
