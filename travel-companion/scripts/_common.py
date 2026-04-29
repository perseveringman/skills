"""Shared helpers. Standard library only — no third-party deps so the skill
runs in any agent environment.

Includes a minimal YAML frontmatter parser tuned for the fields this skill
actually writes. We don't use PyYAML because (a) we want zero install,
(b) we fully control the writer, so the reader only needs to handle the
subset we produce.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Paths & bootstrap
# ---------------------------------------------------------------------------

def trip_paths(trip_root: str | os.PathLike) -> dict[str, Path]:
    root = Path(trip_root).resolve()
    return {
        "root": root,
        "trip": root / ".trip",
        "schema": root / ".trip" / "SCHEMA.md",
        "log": root / ".trip" / "session-log.jsonl",
        "state": root / ".trip" / "state.json",
        "geocache": root / ".trip" / "geocache.json",
        "wiki": root / "wiki",
        "entities": root / "wiki" / "entities",
        "index": root / "wiki" / "index.md",
        "timeline": root / "wiki" / "timeline.md",
        "rec": root / "recommendations",
        "shots": root / "recommendations" / "shots",
        "food": root / "recommendations" / "food",
        "itinerary": root / "recommendations" / "itinerary",
        "spots": root / "recommendations" / "spots",
        "graph_dir": root / "graph",
        "graph_json": root / "graph" / "graph.json",
        "graph_html": root / "graph" / "graph.html",
        "map_dir": root / "map",
        "map_html": root / "map" / "map.html",
    }


def ensure_tree(trip_root: str | os.PathLike) -> dict[str, Path]:
    p = trip_paths(trip_root)
    for key in ("trip", "wiki", "entities", "rec", "shots", "food",
                "itinerary", "spots", "graph_dir", "map_dir"):
        p[key].mkdir(parents=True, exist_ok=True)

    if not p["schema"].exists():
        skill_schema = Path(__file__).parent.parent / "assets" / "SCHEMA.md"
        if skill_schema.exists():
            p["schema"].write_text(skill_schema.read_text(encoding="utf-8"),
                                   encoding="utf-8")

    if not p["state"].exists():
        write_json(p["state"], {
            "version": 1,
            "created": now_iso(),
            "turns_ingested": 0,
            "last_ingest": None,
            "places_known": 0,
        })
    if not p["geocache"].exists():
        write_json(p["geocache"], {})
    return p


# ---------------------------------------------------------------------------
# Time / slug / misc
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


_SLUG_BAD = re.compile(r'[\\/:*?"<>|]+')
_SLUG_WS  = re.compile(r'[\s\-]+')

def slugify(text: str) -> str:
    s = _SLUG_BAD.sub("-", text)
    s = _SLUG_WS.sub("-", s).strip("-")
    return s or "untitled"


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default if default is not None else {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2),
                    encoding="utf-8")


# ---------------------------------------------------------------------------
# Minimal YAML frontmatter (tailored to what we emit)
# ---------------------------------------------------------------------------

_FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def split_frontmatter(text: str) -> tuple[dict, str]:
    m = _FM_RE.match(text)
    if not m:
        return {}, text
    fm = parse_simple_yaml(m.group(1))
    body = text[m.end():]
    return fm, body


def parse_simple_yaml(text: str) -> dict:
    """Parse the tiny YAML subset we emit: scalar, null, list of scalars,
    inline list [a, b]. Keys are unquoted. Values may be unquoted, single-
    or double-quoted.
    """
    out: dict[str, Any] = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        if not raw.strip() or raw.lstrip().startswith("#"):
            i += 1
            continue
        if ":" not in raw:
            i += 1
            continue
        key, _, rest = raw.partition(":")
        key = key.strip()
        rest = rest.strip()

        if rest == "":
            # block list
            items: list[Any] = []
            j = i + 1
            while j < len(lines) and lines[j].lstrip().startswith("- "):
                items.append(_parse_scalar(lines[j].lstrip()[2:].strip()))
                j += 1
            if items:
                out[key] = items
                i = j
                continue
            out[key] = None
            i += 1
            continue

        if rest.startswith("[") and rest.endswith("]"):
            inner = rest[1:-1].strip()
            if not inner:
                out[key] = []
            else:
                out[key] = [_parse_scalar(x.strip()) for x in _split_inline(inner)]
            i += 1
            continue

        out[key] = _parse_scalar(rest)
        i += 1
    return out


def _split_inline(s: str) -> list[str]:
    parts, buf, depth, quote = [], [], 0, None
    for ch in s:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in ('"', "'"):
            quote = ch; buf.append(ch); continue
        if ch == "[":
            depth += 1; buf.append(ch); continue
        if ch == "]":
            depth -= 1; buf.append(ch); continue
        if ch == "," and depth == 0:
            parts.append("".join(buf)); buf = []; continue
        buf.append(ch)
    if buf:
        parts.append("".join(buf))
    return parts


def _parse_scalar(v: str) -> Any:
    v = v.strip()
    if v == "" or v.lower() == "null" or v == "~":
        return None
    if v.lower() == "true":
        return True
    if v.lower() == "false":
        return False
    if (v.startswith('"') and v.endswith('"')) or \
       (v.startswith("'") and v.endswith("'")):
        return v[1:-1]
    if v.startswith("[") and v.endswith("]"):
        inner = v[1:-1].strip()
        if not inner:
            return []
        return [_parse_scalar(x.strip()) for x in _split_inline(inner)]
    # number
    try:
        if "." in v:
            return float(v)
        return int(v)
    except ValueError:
        pass
    return v


def dump_simple_yaml(fm: dict) -> str:
    lines: list[str] = []
    for k, v in fm.items():
        lines.append(f"{k}: {_emit_scalar(v)}")
    return "\n".join(lines)


def _emit_scalar(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        if not v:
            return "[]"
        return "[" + ", ".join(_emit_item(x) for x in v) + "]"
    s = str(v)
    if any(ch in s for ch in (":", "#", "\n")) or s.strip() != s:
        return json.dumps(s, ensure_ascii=False)
    return s


def _emit_item(v: Any) -> str:
    if isinstance(v, list):
        return "[" + ", ".join(_emit_item(x) for x in v) + "]"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return str(v)
    if v is None:
        return "null"
    s = str(v)
    if "," in s or s.strip() != s or ":" in s:
        return json.dumps(s, ensure_ascii=False)
    return s


def write_entity_md(path: Path, fm: dict, body: str) -> None:
    fm_str = dump_simple_yaml(fm)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{fm_str}\n---\n\n{body.lstrip()}",
                    encoding="utf-8")


def read_entity_md(path: Path) -> tuple[dict, str]:
    return split_frontmatter(path.read_text(encoding="utf-8"))
