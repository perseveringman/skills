#!/usr/bin/env python3
"""Fetch representative images for entities via the Unsplash API.

Scans `wiki/entities/*.md`, finds entities without an `image` field in their
frontmatter, searches Unsplash for a matching photo, and writes the image URL
and credit back into the entity file.

Requires the environment variable `UNSPLASH_ACCESS_KEY` (free tier works).
Respects a 1 req/s rate limit. Results are cached in `.trip/imagecache.json`
so repeated runs don't re-fetch the same entity.

Usage:
    python scripts/fetch_images.py --trip-root .
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    ensure_tree,
    read_entity_md,
    read_json,
    write_entity_md,
    write_json,
)

UNSPLASH_SEARCH = "https://api.unsplash.com/search/photos"
RATE_LIMIT_S = 1.1  # slightly over 1 s to be safe


def _english_alias(aliases: list) -> str | None:
    """Return the first alias that looks English/romanized."""
    for a in aliases:
        if a and all(ord(c) < 0x3000 for c in str(a)):
            return str(a)
    return None


def _build_query(entity_id: str, entity_type: str, aliases: list) -> str:
    """Build a good Unsplash search query for an entity."""
    eng = _english_alias(aliases)
    if eng:
        # For places, append type for better results
        if entity_type and entity_type not in eng.lower():
            return f"{eng} {entity_type}"
        return eng
    # Fall back to Chinese id + type
    return f"{entity_id} {entity_type}" if entity_type else entity_id


def _search_unsplash(query: str, access_key: str) -> dict | None:
    """Query Unsplash and return the first result, or None."""
    params = urllib.parse.urlencode({
        "query": query,
        "per_page": 1,
        "orientation": "landscape",
        "content_filter": "high",
    })
    url = f"{UNSPLASH_SEARCH}?{params}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Client-ID {access_key}",
        "Accept": "application/json",
        "User-Agent": "travel-companion-skill/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
        print(f"  ! Unsplash error for '{query}': {e}", file=sys.stderr)
        return None

    results = data.get("results") or []
    if not results:
        return None
    return results[0]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch images for entities from Unsplash")
    parser.add_argument("--trip-root", required=True)
    parser.add_argument("--force", action="store_true",
                        help="Re-fetch even if image already set")
    args = parser.parse_args()

    access_key = os.environ.get("UNSPLASH_ACCESS_KEY", "").strip()
    if not access_key:
        print(json.dumps({
            "ok": False,
            "error": "UNSPLASH_ACCESS_KEY not set",
        }, ensure_ascii=False))
        return 1

    p = ensure_tree(args.trip_root)
    cache_path = p["imagecache"]
    cache: dict = read_json(cache_path, {})

    fetched = 0
    skipped = 0
    failed = 0
    entities_dir = p["entities"]

    if not entities_dir.exists():
        print(json.dumps({"ok": True, "fetched": 0, "skipped": 0}))
        return 0

    for md_file in sorted(entities_dir.glob("*.md")):
        try:
            fm, body = read_entity_md(md_file)
        except Exception:
            continue

        eid = fm.get("id") or md_file.stem
        etype = str(fm.get("type") or "")
        aliases = list(fm.get("aliases") or [])

        # Skip if already has image (unless --force)
        if fm.get("image") and not args.force:
            skipped += 1
            continue

        # Check cache
        if eid in cache and not args.force:
            cached = cache[eid]
            if cached.get("image"):
                fm["image"] = cached["image"]
                fm["image_credit"] = cached.get("image_credit")
                fm["image_source"] = "unsplash"
                write_entity_md(md_file, fm, body)
                skipped += 1
                continue
            elif cached.get("not_found"):
                skipped += 1
                continue

        query = _build_query(eid, etype, aliases)
        print(f"  → {eid}: searching '{query}'...", file=sys.stderr)

        result = _search_unsplash(query, access_key)
        time.sleep(RATE_LIMIT_S)

        if not result:
            cache[eid] = {"not_found": True, "query": query}
            write_json(cache_path, cache)
            failed += 1
            continue

        image_url = result.get("urls", {}).get("regular") or \
                    result.get("urls", {}).get("small")
        user = result.get("user", {})
        user_name = user.get("name") or "Unknown"
        user_link = user.get("links", {}).get("html") or ""
        credit = f"{user_name} / Unsplash"

        # Write into frontmatter
        fm["image"] = image_url
        fm["image_credit"] = credit
        fm["image_source"] = "unsplash"
        write_entity_md(md_file, fm, body)

        # Update cache
        cache[eid] = {
            "image": image_url,
            "image_credit": credit,
            "query": query,
            "photo_id": result.get("id"),
            "user_link": user_link,
        }
        write_json(cache_path, cache)
        fetched += 1

    print(json.dumps({
        "ok": True,
        "fetched": fetched,
        "skipped": skipped,
        "failed": failed,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
