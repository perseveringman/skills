#!/usr/bin/env python3
"""Copy the pre-built SPA `assets/explorer.html` into the trip root and
inline `data/trip.json` between the `__TRIP_DATA_BEGIN__` markers so the
single HTML is fully self-contained (double-click to open, no server).

Run *after* `export_data.py`.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import ensure_tree  # noqa: E402

SKILL_DIR = Path(__file__).parent.parent
TEMPLATE = SKILL_DIR / "assets" / "explorer.html"

BEGIN = "/*__TRIP_DATA_BEGIN__*/"
END = "/*__TRIP_DATA_END__*/"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trip-root", required=True)
    args = parser.parse_args()

    p = ensure_tree(args.trip_root)
    root = p["root"]
    data_file = root / "data" / "trip.json"
    if not data_file.exists():
        print("! data/trip.json missing — run export_data.py first",
              file=sys.stderr)
        return 2

    if not TEMPLATE.exists():
        print(f"! template not found: {TEMPLATE}", file=sys.stderr)
        return 3

    html = TEMPLATE.read_text(encoding="utf-8")
    begin = html.find(BEGIN)
    end = html.find(END)
    if begin == -1 or end == -1 or end < begin:
        print("! template missing data markers", file=sys.stderr)
        return 4

    # Re-read (not json.load) so we pass through exactly the bytes written.
    data = json.loads(data_file.read_text(encoding="utf-8"))
    injected = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    # Guard: escape </script> inside string values so injected JSON can't
    # break the surrounding <script> tag.
    injected = injected.replace("</", "<\\/")

    out = (
        html[:begin + len(BEGIN)]
        + injected
        + html[end:]
    )
    out_path = root / "explorer.html"
    out_path.write_text(out, encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "explorer": str(out_path),
        "bytes": out_path.stat().st_size,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
