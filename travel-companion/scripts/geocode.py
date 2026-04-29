#!/usr/bin/env python3
"""Geocode place entities that have no coords yet.

Uses OpenStreetMap Nominatim (free, no API key). Respects the 1 req/s
policy and sends a descriptive User-Agent as required by Nominatim's usage
rules. Results are cached in `.trip/geocache.json` so repeated runs don't
hit the network.

Disambiguation: because names like "尼罗河" or "埃及博物馆" collide with
homonymous towns or sister museums abroad, we infer a single dominant
country for the trip (from country-like entities in the wiki) and restrict
the Nominatim query with ``countrycodes``. We fall back to an unrestricted
query only if the constrained one returns nothing.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    ensure_tree, now_iso, read_entity_md, read_json, slugify,
    trip_paths, write_entity_md, write_json,
)
from ingest import is_place_type  # noqa: E402

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "travel-companion-skill/1.0 (+https://box.ai; contact: user)"
RETRY_COOLDOWN_HOURS = 24


def _nominatim_lookup(query: str, country_hint: str | None = None
                      ) -> tuple[float, float] | None:
    params = {"q": query, "format": "json", "limit": 1}
    if country_hint:
        params["countrycodes"] = country_hint.lower()
    url = f"{NOMINATIM_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Accept-Language": "zh,en;q=0.8",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  ! nominatim error for {query!r}: {e}", file=sys.stderr)
        return None
    if not data:
        return None
    try:
        return float(data[0]["lat"]), float(data[0]["lon"])
    except (KeyError, ValueError, IndexError):
        return None


# Country-name → ISO 3166-1 alpha-2, only for common travel destinations.
_COUNTRY_ISO = {
    "埃及": "eg", "egypt": "eg",
    "日本": "jp", "japan": "jp",
    "中国": "cn", "china": "cn",
    "法国": "fr", "france": "fr",
    "意大利": "it", "italy": "it",
    "希腊": "gr", "greece": "gr",
    "土耳其": "tr", "turkey": "tr",
    "泰国": "th", "thailand": "th",
    "越南": "vn", "vietnam": "vn",
    "印度": "in", "india": "in",
    "西班牙": "es", "spain": "es",
    "英国": "gb", "united kingdom": "gb", "uk": "gb",
    "美国": "us", "united states": "us", "usa": "us",
    "德国": "de", "germany": "de",
    "摩洛哥": "ma", "morocco": "ma",
    "墨西哥": "mx", "mexico": "mx",
    "秘鲁": "pe", "peru": "pe",
    "澳大利亚": "au", "australia": "au",
    "新西兰": "nz", "new zealand": "nz",
    "韩国": "kr", "south korea": "kr",
    "俄罗斯": "ru", "russia": "ru",
    "葡萄牙": "pt", "portugal": "pt",
    "荷兰": "nl", "netherlands": "nl",
    "瑞士": "ch", "switzerland": "ch",
    "冰岛": "is", "iceland": "is",
    "阿根廷": "ar", "argentina": "ar",
    "巴西": "br", "brazil": "br",
    "尼泊尔": "np", "nepal": "np",
    "柬埔寨": "kh", "cambodia": "kh",
    "印尼": "id", "indonesia": "id",
    "马来西亚": "my", "malaysia": "my",
    "新加坡": "sg", "singapore": "sg",
    "阿联酋": "ae", "uae": "ae",
    "约旦": "jo", "jordan": "jo",
    "以色列": "il", "israel": "il",
    "肯尼亚": "ke", "kenya": "ke",
    "南非": "za", "south africa": "za",
    "加拿大": "ca", "canada": "ca",
    "菲律宾": "ph", "philippines": "ph",
}


def _infer_country_hint(entities_dir: Path) -> str | None:
    counts: dict[str, int] = {}
    for f in entities_dir.glob("*.md"):
        try:
            fm, _ = read_entity_md(f)
        except Exception:
            continue
        candidates = [str(fm.get("id", "")).strip().lower()] + \
                     [str(a).strip().lower() for a in (fm.get("aliases") or [])]
        for c in candidates:
            iso = _COUNTRY_ISO.get(c)
            if iso:
                counts[iso] = counts.get(iso, 0) + 1
                break
    if not counts:
        return None
    ordered = sorted(counts.items(), key=lambda x: -x[1])
    if len(ordered) == 1 or ordered[0][1] > ordered[1][1]:
        return ordered[0][0]
    return None


def _should_retry(cached: dict) -> bool:
    if cached.get("lat") is not None:
        return False
    ts = cached.get("queried_at")
    if not ts:
        return True
    try:
        qt = datetime.fromisoformat(ts)
    except ValueError:
        return True
    return datetime.now(qt.tzinfo or timezone.utc) - qt > \
        timedelta(hours=RETRY_COOLDOWN_HOURS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trip-root", required=True)
    parser.add_argument("--dry-run", action="store_true",
                        help="show what would be geocoded, don't fetch")
    parser.add_argument("--offline", action="store_true",
                        help="never hit the network; only use cache")
    args = parser.parse_args()

    p = ensure_tree(args.trip_root)
    cache = read_json(p["geocache"], default={})
    updated = 0
    country_hint = _infer_country_hint(p["entities"])
    if country_hint:
        print(f"  (country hint: {country_hint})", file=sys.stderr)

    files = sorted(p["entities"].glob("*.md"))
    todo: list[tuple[Path, dict, str, str]] = []
    for f in files:
        fm, body = read_entity_md(f)
        if fm.get("coords") is not None:
            continue
        if fm.get("coords_source") == "user":
            continue
        if not is_place_type(fm.get("type")):
            continue
        eid = fm.get("id") or f.stem
        aliases = fm.get("aliases") or []
        query = next((a for a in aliases if a.isascii()), None) or eid
        todo.append((f, fm, eid, query))

    if not todo:
        print(json.dumps({"ok": True, "updated": 0, "total_candidates": 0}))
        return 0

    print(f"geocoding {len(todo)} candidates...", file=sys.stderr)

    for i, (f, fm, eid, query) in enumerate(todo):
        cached = cache.get(eid)
        if cached and not _should_retry(cached):
            coords = (cached.get("lat"), cached.get("lon")) \
                if cached.get("lat") is not None else None
        elif args.offline:
            coords = None
        elif args.dry_run:
            print(f"  - would geocode: {eid!r} (query={query!r}, country={country_hint})",
                  file=sys.stderr)
            coords = None
        else:
            if i > 0:
                time.sleep(1.1)  # Nominatim 1 req/s
            # For the country-level entity itself, don't constrain.
            hint = None if fm.get("type") in ("region", "country") else country_hint
            coords = _nominatim_lookup(query, hint)
            if coords is None and hint:
                time.sleep(1.1)
                coords = _nominatim_lookup(query, None)
            cache[eid] = {
                "lat": coords[0] if coords else None,
                "lon": coords[1] if coords else None,
                "source": "nominatim",
                "queried_at": now_iso(),
            }
            write_json(p["geocache"], cache)

        if coords:
            fm["coords"] = [coords[0], coords[1]]
            fm["coords_source"] = "nominatim"
            fm["updated"] = now_iso()
            _, body = read_entity_md(f)
            write_entity_md(f, fm, body)
            updated += 1
            print(f"  + {eid} → {coords[0]:.4f},{coords[1]:.4f}",
                  file=sys.stderr)

    state = read_json(p["state"])
    state["places_known"] = sum(
        1 for md in p["entities"].glob("*.md")
        if is_place_type((read_entity_md(md)[0] or {}).get("type"))
    )
    write_json(p["state"], state)

    print(json.dumps({
        "ok": True, "updated": updated, "total_candidates": len(todo),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
