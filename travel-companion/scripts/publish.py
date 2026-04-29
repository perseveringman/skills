#!/usr/bin/env python3
"""Commit & push a trip's latest state so Vercel redeploys.

This runs at the end of Track A (after export_data.py). It:

1. `git add` the trip directory and relevant top-level files
2. Builds an informative commit message from the latest session-log turn
3. Commits if there's anything staged
4. Pushes to origin/<current-branch>

Usage:

    python3 scripts/publish.py --trip-root trips/egypt-south
    python3 scripts/publish.py --trip-root trips/egypt-south --no-push
    python3 scripts/publish.py --trip-root trips/egypt-south --message "custom msg"

Safety:
- Never force-pushes.
- Never amends previous commits.
- Bails out cleanly if the working tree has unrelated changes (`--strict`).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, check=check, capture_output=True, text=True)


def repo_root(start: Path) -> Path:
    p = run(["git", "rev-parse", "--show-toplevel"], start).stdout.strip()
    return Path(p)


def current_branch(repo: Path) -> str:
    return run(["git", "branch", "--show-current"], repo).stdout.strip()


def derive_message(trip_dir: Path) -> str:
    slug = trip_dir.name
    # Try meta.json title.
    title = slug
    meta_file = trip_dir / ".trip" / "meta.json"
    if meta_file.exists():
        try:
            title = json.loads(meta_file.read_text(encoding="utf-8")).get("title", slug)
        except Exception:
            pass

    # Take the last user turn from session-log for the commit body.
    log_file = trip_dir / ".trip" / "session-log.jsonl"
    last_user = ""
    if log_file.exists():
        for line in log_file.read_text(encoding="utf-8").splitlines()[::-1]:
            try:
                rec = json.loads(line)
                if rec.get("role") == "user":
                    last_user = rec.get("text", "").strip().replace("\n", " ")
                    break
            except Exception:
                continue
    if len(last_user) > 90:
        last_user = last_user[:87] + "…"

    if last_user:
        return f"trip({slug}): {title} — {last_user}"
    return f"trip({slug}): refresh {title}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trip-root",
                    help="Path to the trip directory, e.g. trips/egypt-south. "
                         "If omitted, reads .workbuddy/active-trip in --cwd.")
    ap.add_argument("--cwd", default=".",
                    help="Working dir for the active-trip pointer (default: cwd)")
    ap.add_argument("--message", help="Override the commit message")
    ap.add_argument("--no-push", action="store_true",
                    help="Stage + commit only; skip git push")
    ap.add_argument("--strict", action="store_true",
                    help="Refuse to commit if there are unrelated staged changes")
    args = ap.parse_args()

    if args.trip_root:
        trip_dir = Path(args.trip_root).resolve()
    else:
        pointer = Path(args.cwd).resolve() / ".workbuddy" / "active-trip"
        if not pointer.exists():
            print(f"! no --trip-root and no active-trip at {pointer}",
                  file=sys.stderr)
            return 2
        try:
            data = json.loads(pointer.read_text(encoding="utf-8"))
            trip_dir = Path(data["dir"]).resolve()
        except Exception as exc:
            print(f"! cannot parse {pointer}: {exc}", file=sys.stderr)
            return 2

    if not trip_dir.exists():
        print(f"! trip dir not found: {trip_dir}", file=sys.stderr)
        return 2

    repo = repo_root(trip_dir)
    rel = trip_dir.relative_to(repo)

    # Stage just this trip dir.
    run(["git", "add", "--", str(rel)], repo)

    # If user passed --strict, ensure nothing else is staged outside the
    # trip dir (avoid accidentally committing an unrelated WIP).
    if args.strict:
        diff = run(["git", "diff", "--cached", "--name-only"], repo).stdout.splitlines()
        outside = [f for f in diff if not f.startswith(str(rel))]
        if outside:
            print("! refusing to commit — unrelated staged files:", file=sys.stderr)
            for f in outside:
                print(f"    {f}", file=sys.stderr)
            return 3

    # Anything staged at all?
    diff = run(["git", "diff", "--cached", "--name-only"], repo).stdout.strip()
    if not diff:
        print(json.dumps({"ok": True, "skipped": "nothing to commit"}))
        return 0

    msg = args.message or derive_message(trip_dir)
    run(["git", "commit", "-m", msg], repo)
    sha = run(["git", "rev-parse", "HEAD"], repo).stdout.strip()

    pushed = False
    push_err: str | None = None
    if not args.no_push:
        branch = current_branch(repo)
        if not branch:
            push_err = "detached HEAD — skipping push"
        else:
            try:
                run(["git", "push", "origin", branch], repo)
                pushed = True
            except subprocess.CalledProcessError as exc:
                push_err = (exc.stderr or exc.stdout or "").strip() or "push failed"

    out = {
        "ok": True,
        "sha": sha,
        "message": msg,
        "pushed": pushed,
        "files": diff.splitlines(),
    }
    if push_err:
        out["push_error"] = push_err
        out["ok"] = False
    print(json.dumps(out, ensure_ascii=False))
    return 0 if out["ok"] else 4


if __name__ == "__main__":
    raise SystemExit(main())
