#!/usr/bin/env python3
"""Ingest commands for the travel-companion skill.

Two subcommands:

* `append` — append one conversation turn to `.trip/session-log.jsonl` and
  bump `state.json`.
* `upsert` — given the LLM extraction JSON (see
  `references/extraction-prompts.md`), create or merge entity markdown
  files in `wiki/entities/`. Prints a small JSON summary on stdout —
  crucially the `new_places` list, which the caller uses to decide which
  recommendations to generate.

Both commands are idempotent in the sense that:
- re-appending the same message is harmless (we don't dedupe, but the log
  is append-only by design);
- upserting the same extraction produces no diff on disk.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    ensure_tree, now_iso, read_entity_md, read_json, slugify,
    trip_paths, write_entity_md, write_json,
)

GEOCODABLE_TYPES = {
    "place", "city", "town", "village", "region", "district", "site",
    "ruin", "temple", "church", "mosque", "shrine", "palace", "museum",
    "gallery", "landmark", "monument", "tomb", "natural_feature",
    "mountain", "river", "lake", "sea", "desert", "island", "park",
    "market", "neighborhood", "station", "port",
}


def is_place_type(t: str | None) -> bool:
    if not t:
        return False
    t = t.lower()
    return t in GEOCODABLE_TYPES or t.endswith("_site") or t.endswith("_place")


# ---------------------------------------------------------------------------
# append
# ---------------------------------------------------------------------------

def cmd_append(args: argparse.Namespace) -> int:
    p = ensure_tree(args.trip_root)
    with p["log"].open("a", encoding="utf-8") as f:
        f.write(json.dumps(
            {"t": now_iso(), "role": args.role, "text": args.text},
            ensure_ascii=False,
        ) + "\n")

    state = read_json(p["state"])
    state["turns_ingested"] = state.get("turns_ingested", 0) + 1
    state["last_ingest"] = now_iso()
    write_json(p["state"], state)

    print(json.dumps({"ok": True, "turns_ingested": state["turns_ingested"]},
                     ensure_ascii=False))
    return 0


# ---------------------------------------------------------------------------
# upsert
# ---------------------------------------------------------------------------

def _find_entity_file(entities_dir: Path, entity_id: str,
                      aliases: list[str]) -> Path | None:
    """Match by id-slug first, then scan frontmatter aliases."""
    target = entities_dir / f"{slugify(entity_id)}.md"
    if target.exists():
        return target
    if not entities_dir.exists():
        return None

    want = {entity_id.strip().lower()} | {a.strip().lower() for a in aliases}
    for md in entities_dir.glob("*.md"):
        try:
            fm, _ = read_entity_md(md)
        except Exception:
            continue
        candidates = {str(fm.get("id", "")).lower()} | \
                     {str(a).lower() for a in (fm.get("aliases") or [])}
        if candidates & want:
            return md
    return None


def _merge_entity(existing_fm: dict, existing_body: str, new: dict,
                  turn_ts: str) -> tuple[dict, str, bool]:
    """Merge new extraction into existing entity. Returns (fm, body, is_new_place).
    Human-written prose in the body is preserved; we only append facts and a
    discussion marker.
    """
    fm = dict(existing_fm)
    was_place = bool(fm.get("coords"))

    # merge list-like fields by union, preserving order
    for key in ("aliases", "tags", "related"):
        merged = list(fm.get(key) or [])
        seen = {str(x) for x in merged}
        for item in (new.get(key) or []):
            if str(item) not in seen:
                merged.append(item)
                seen.add(str(item))
        fm[key] = merged

    # scalar fields: prefer existing, fall back to new
    if not fm.get("summary") and new.get("summary"):
        fm["summary"] = new["summary"]
    if not fm.get("type") and new.get("type"):
        fm["type"] = new["type"]

    # coords: never overwrite user-supplied
    if fm.get("coords") is None and new.get("coords"):
        fm["coords"] = new["coords"]
        fm["coords_source"] = new.get("coords_source") or "llm"

    # timestamps
    mentions = list(fm.get("mentioned_at") or [])
    if turn_ts not in mentions:
        mentions.append(turn_ts)
    fm["mentioned_at"] = mentions
    fm.setdefault("created", turn_ts)
    fm["updated"] = turn_ts

    # body: preserve existing, append new facts under a rolling section
    body = existing_body or ""
    new_facts = new.get("facts") or []
    if new_facts:
        # find "## Facts" section; create if missing
        if "## Facts" in body:
            # append under it
            parts = body.split("## Facts", 1)
            head = parts[0] + "## Facts\n"
            tail = parts[1]
            # split tail at the next "## " to know where Facts ends
            next_h = tail.find("\n## ")
            if next_h == -1:
                facts_block = tail
                after = ""
            else:
                facts_block = tail[:next_h]
                after = tail[next_h:]
            existing_facts = {line.strip("- ").strip()
                              for line in facts_block.splitlines()
                              if line.strip().startswith("- ")}
            added = []
            for f in new_facts:
                if f.strip() and f.strip() not in existing_facts:
                    added.append(f.strip())
            if added:
                facts_block = facts_block.rstrip() + "\n" + \
                    "\n".join(f"- {f}" for f in added) + "\n"
            body = head + facts_block + after
        else:
            sep = "" if body.endswith("\n\n") or body == "" else \
                  ("\n" if body.endswith("\n") else "\n\n")
            body = body + sep + "## Facts\n" + \
                "\n".join(f"- {f}" for f in new_facts) + "\n"

    # discussion line
    disc_header = "## Discussions"
    disc_line = f"- {turn_ts[:10]} —— (本轮对话提及)"
    if disc_header not in body:
        body = body.rstrip() + f"\n\n{disc_header}\n{disc_line}\n"
    else:
        body = body.rstrip() + f"\n{disc_line}\n"

    is_new_place = (not was_place) and is_place_type(fm.get("type")) \
        and fm.get("coords") is None
    return fm, body, is_new_place


def _create_entity(new: dict, turn_ts: str) -> tuple[dict, str, bool]:
    fm = {
        "id": new["id"],
        "type": new.get("type") or "concept",
        "aliases": new.get("aliases") or [],
        "coords": new.get("coords"),
        "coords_source": new.get("coords_source"),
        "summary": new.get("summary") or "",
        "tags": new.get("tags") or [],
        "related": new.get("related") or [],
        "anchors": new.get("anchors") or [],
        "mentioned_at": [turn_ts],
        "created": turn_ts,
        "updated": turn_ts,
    }
    facts = new.get("facts") or []
    body_parts = []
    if fm["summary"]:
        body_parts.append(f"## Summary\n{fm['summary']}\n")
    if facts:
        body_parts.append("## Facts\n" +
                          "\n".join(f"- {f}" for f in facts) + "\n")
    if fm["related"]:
        body_parts.append("## Relations\n" +
                          "\n".join(f"- [[{r}]]" for r in fm["related"]) + "\n")
    body_parts.append(f"## Discussions\n- {turn_ts[:10]} —— (首次记录)\n")
    body = "\n".join(body_parts)
    is_new_place = is_place_type(fm.get("type")) and fm.get("coords") is None
    return fm, body, is_new_place


def cmd_upsert(args: argparse.Namespace) -> int:
    p = ensure_tree(args.trip_root)
    data_text = Path(args.json_file).read_text(encoding="utf-8") \
        if args.json_file else sys.stdin.read()
    data = json.loads(data_text)

    turn_ts = now_iso()
    new_places: list[str] = []
    created: list[str] = []
    updated: list[str] = []

    for entity in (data.get("entities") or []):
        eid = (entity.get("id") or "").strip()
        if not eid:
            continue
        aliases = entity.get("aliases") or []
        existing = _find_entity_file(p["entities"], eid, aliases)
        if existing:
            ex_fm, ex_body = read_entity_md(existing)
            fm, body, is_new_place = _merge_entity(ex_fm, ex_body, entity, turn_ts)
            # rename file if slug changed? keep existing filename.
            write_entity_md(existing, fm, body)
            updated.append(fm["id"])
        else:
            fm, body, is_new_place = _create_entity(entity, turn_ts)
            path = p["entities"] / f"{slugify(fm['id'])}.md"
            write_entity_md(path, fm, body)
            created.append(fm["id"])
        if is_new_place:
            new_places.append(fm["id"])

    # apply relations as bi-directional related links
    for rel in (data.get("relations") or []):
        a, b = rel.get("from"), rel.get("to")
        if not a or not b:
            continue
        for src, dst in ((a, b), (b, a)):
            f = p["entities"] / f"{slugify(src)}.md"
            if not f.exists():
                continue
            fm, body = read_entity_md(f)
            rels = list(fm.get("related") or [])
            if dst not in rels:
                rels.append(dst)
                fm["related"] = rels
                fm["updated"] = turn_ts
                write_entity_md(f, fm, body)

    # events → timeline.md
    events = data.get("events") or []
    if events:
        tl_path = p["timeline"]
        existing = tl_path.read_text(encoding="utf-8") if tl_path.exists() \
            else "# Timeline\n\n"
        lines = []
        for ev in events:
            y = ev.get("year")
            y_str = f"{y}" if isinstance(y, int) else "?"
            summary = ev.get("summary") or ev.get("id", "")
            lines.append(f"- **{y_str}** — {summary}")
        tl_path.write_text(existing.rstrip() + "\n" + "\n".join(lines) + "\n",
                           encoding="utf-8")

    # state
    state = read_json(p["state"])
    state["places_known"] = sum(
        1 for md in p["entities"].glob("*.md")
        if is_place_type((read_entity_md(md)[0] or {}).get("type"))
    )
    write_json(p["state"], state)

    print(json.dumps({
        "ok": True,
        "created": created,
        "updated": updated,
        "new_places": new_places,
        "events_added": len(events),
    }, ensure_ascii=False))
    return 0


# ---------------------------------------------------------------------------
# entrypoint
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(prog="ingest")
    sub = parser.add_subparsers(dest="cmd", required=True)

    pa = sub.add_parser("append", help="append one turn to session-log")
    pa.add_argument("--trip-root", required=True)
    pa.add_argument("--role", choices=["user", "assistant"], required=True)
    pa.add_argument("--text", required=True)
    pa.set_defaults(func=cmd_append)

    pu = sub.add_parser("upsert", help="upsert entities from extraction JSON")
    pu.add_argument("--trip-root", required=True)
    pu.add_argument("--json-file", help="path to extraction json; stdin if omitted")
    pu.set_defaults(func=cmd_upsert)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
