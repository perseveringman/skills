#!/usr/bin/env python3
"""Export the wiki to a single JSON structure the explorer SPA consumes.

Writes `<trip>/data/trip.json`. The structure mirrors the `TripData` type in
web/src/lib/types.ts. Everything the front-end needs is bundled into one
file — entities (with full markdown body), events, session log and
recommendations (with bodies).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    ensure_tree, now_iso, read_entity_md, read_json, split_frontmatter,
    trip_paths,
)

REC_KINDS = ("shots", "food", "itinerary", "spots")


def _camel(entity_fm: dict, body: str, file: str) -> dict:
    """Convert snake-ish frontmatter + body to the camelCase shape used by
    the front-end."""
    return {
        "id": entity_fm.get("id") or Path(file).stem,
        "type": entity_fm.get("type") or "concept",
        "aliases": list(entity_fm.get("aliases") or []),
        "coords": entity_fm.get("coords"),
        "coordsSource": entity_fm.get("coords_source"),
        "summary": entity_fm.get("summary") or "",
        "tags": list(entity_fm.get("tags") or []),
        "related": list(entity_fm.get("related") or []),
        "anchors": list(entity_fm.get("anchors") or []),
        "mentionedAt": list(entity_fm.get("mentioned_at") or []),
        "body": body or "",
        "file": file,
    }


def _read_session_log(log_path: Path) -> list[dict]:
    if not log_path.exists():
        return []
    out = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        out.append({"t": obj.get("t") or "",
                    "role": obj.get("role") or "",
                    "text": obj.get("text") or ""})
    return out


def _read_recommendations(root: Path) -> list[dict]:
    out = []
    rec_root = root / "recommendations"
    if not rec_root.exists():
        return out
    for kind in REC_KINDS:
        d = rec_root / kind
        if not d.exists():
            continue
        for f in sorted(d.glob("*.md")):
            try:
                fm, body = split_frontmatter(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            out.append({
                "kind": kind,
                "place": fm.get("place") or f.stem,
                "file": str(f.relative_to(root)),
                "body": body,
            })
    return out


def _parse_events(timeline_path: Path) -> list[dict]:
    """Timeline is maintained by ingest.py as `- **YEAR** — summary` lines.
    We also pick up structured events when a JSON sidecar exists.
    """
    events_json = timeline_path.with_suffix(".json")
    if events_json.exists():
        try:
            return json.loads(events_json.read_text(encoding="utf-8"))
        except Exception:
            pass

    if not timeline_path.exists():
        return []

    out = []
    line_re = re.compile(r"^\s*-\s+\*\*([^*]+)\*\*\s*[—-]\s*(.+)$")
    for line in timeline_path.read_text(encoding="utf-8").splitlines():
        m = line_re.match(line)
        if not m:
            continue
        year_str = m.group(1).strip()
        summary = m.group(2).strip()
        try:
            year = int(year_str)
        except ValueError:
            year = None
        out.append({
            "id": summary[:40],
            "year": year,
            "summary": summary,
            "places": [],
            "actors": [],
        })
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trip-root", required=True)
    args = parser.parse_args()

    p = ensure_tree(args.trip_root)
    root = p["root"]

    entities = []
    for f in sorted(p["entities"].glob("*.md")):
        try:
            fm, body = read_entity_md(f)
        except Exception as e:
            print(f"  ! skip {f.name}: {e}", file=sys.stderr)
            continue
        entities.append(_camel(fm, body, str(f.relative_to(root))))

    # Auto-populate `anchors` for geocoded entities (they anchor themselves).
    # And for non-geo entities that forgot to supply anchors, derive from
    # `related` entries that are themselves places.
    by_id = {e["id"]: e for e in entities}
    for e in entities:
        if e["coords"] and not e["anchors"]:
            e["anchors"] = [e["id"]]
        elif not e["coords"] and not e["anchors"]:
            derived = []
            for rid in e["related"]:
                r = by_id.get(rid)
                if r and r["coords"]:
                    derived.append(rid)
            e["anchors"] = derived[:4]

    # Try to pick a destination label: the biggest region/country in the trip.
    dest = None
    for preferred_type in ("country", "region"):
        candidates = [e for e in entities if e["type"] == preferred_type]
        if candidates:
            dest = candidates[0]["id"]
            break
    if not dest:
        # fall back: look at .trip/SCHEMA.md's sibling for a `destination.txt`
        d = root / ".trip" / "destination.txt"
        if d.exists():
            dest = d.read_text(encoding="utf-8").strip() or None

    trip_data = {
        "version": 1,
        "destination": dest,
        "countryHint": (read_json(p["state"]) or {}).get("country_hint"),
        "entities": entities,
        "events": _parse_events(p["timeline"]),
        "sessionLog": _read_session_log(p["log"]),
        "recommendations": _read_recommendations(root),
        "generatedAt": now_iso(),
    }

    out_dir = root / "data"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / "trip.json"
    out_file.write_text(json.dumps(trip_data, ensure_ascii=False),
                        encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "entities": len(entities),
        "events": len(trip_data["events"]),
        "turns": len(trip_data["sessionLog"]),
        "recs": len(trip_data["recommendations"]),
        "bytes": out_file.stat().st_size,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
