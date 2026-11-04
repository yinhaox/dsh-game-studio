#!/usr/bin/env python3
"""Report wall time, steps, tool calls and tokens for studio tickets.

Reads the orchestrator SQLite store (including ended tickets) and the worker
session logs. Standard library only; Python 3.14+ for zstd.

    python scripts/studio-metrics.py --state-dir ~/.dsh/state/superagent-coil
    python scripts/studio-metrics.py --limit 20 --json
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

try:
    from compression import zstd  # Python 3.14+
except ImportError:  # pragma: no cover
    zstd = None

MAGIC = b"\x28\xb5\x2f\xfd"
SESSIONS_DIR = os.path.join(os.path.expanduser("~"), ".dsh", "sessions")
MAX_STEP_GAP_S = 600


def parse_time(value) -> datetime | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def frames(data: bytes) -> list[bytes]:
    starts = [index for index in range(len(data) - 3) if data[index:index + 4] == MAGIC]
    return [data[starts[index]:starts[index + 1] if index + 1 < len(starts) else len(data)]
            for index in range(len(starts))]


def read_events(path: str) -> list[dict]:
    if zstd is None:
        return []
    with io.open(path, "rb") as handle:
        data = handle.read()
    text_parts = []
    for frame in frames(data):
        try:
            text_parts.append(zstd.decompress(frame).decode("utf-8", "replace"))
        except Exception:
            continue
    events = []
    for line in "".join(text_parts).splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def event_time(event: dict) -> datetime | None:
    return parse_time(event.get("time"))


def usage_of(event: dict) -> dict:
    data = event.get("data") or {}
    message = data.get("message") or {}
    return message.get("usage") or data.get("usage") or {}


def analyze(events: list[dict], start: datetime | None, end: datetime | None) -> dict:
    steps = [event_time(event) for event in events if event.get("type") == "step/start"]
    steps = [moment for moment in steps if moment and (start is None or moment >= start) and (end is None or moment <= end)]
    calls = 0
    tokens_in = tokens_out = cache_read = 0
    for event in events:
        moment = event_time(event)
        if moment and start and moment < start:
            continue
        if moment and end and moment > end:
            continue
        if event.get("type") == "tool/call":
            calls += 1
        elif event.get("type") == "assistant/message":
            usage = usage_of(event)
            tokens_in += int(usage.get("inputTokens", 0) or 0)
            tokens_out += int(usage.get("outputTokens", 0) or 0)
            cache_read += int(usage.get("cacheReadTokens", 0) or 0)
    gaps = [(steps[index + 1] - steps[index]).total_seconds()
            for index in range(len(steps) - 1)
            if (steps[index + 1] - steps[index]).total_seconds() <= MAX_STEP_GAP_S]
    return {"steps": len(steps), "tool_calls": calls, "tokens_in": tokens_in, "tokens_out": tokens_out,
            "cache_read": cache_read, "max_step_s": round(max(gaps), 1) if gaps else 0}


def find_session(ticket_id: str) -> str | None:
    """The session root name embeds the ticket's short id; the newest run wins."""
    prefix = ticket_id[:8]
    newest = None
    newest_at = 0.0
    try:
        names = os.listdir(SESSIONS_DIR)
    except OSError:
        return None
    for name in names:
        if prefix not in name:
            continue
        root = os.path.join(SESSIONS_DIR, name)
        if not os.path.isdir(root):
            continue
        for child in os.listdir(root):
            candidate = os.path.join(root, child, "session.v4.jsonl.zstd")
            if os.path.isfile(candidate):
                modified = os.path.getmtime(candidate)
                if modified > newest_at:
                    newest, newest_at = candidate, modified
    return newest


def load_tickets(db_path: str) -> list[dict]:
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return [json.loads(row[0]) for row in connection.execute("select value from ticket")]
    finally:
        connection.close()


def metrics(ticket: dict) -> dict:
    assignments = ticket.get("assignments") or []
    durations = []
    for item in assignments:
        start = parse_time(item.get("startedAt") or item.get("createdAt"))
        end = parse_time(item.get("endedAt")) or parse_time((item.get("report") or {}).get("at"))
        if end is None and item.get("state") == "running":
            end = datetime.now(timezone.utc)
        if start and end:
            durations.append((end - start).total_seconds())
    # The longest assignment is the one that did the work; a short resume after a
    # comment must not make a large ticket look small.
    work_min = round(max(durations) / 60, 1) if durations else 0
    span_start = parse_time(assignments[0].get("createdAt")) if assignments else parse_time(ticket.get("createdAt"))
    span_end = parse_time(ticket.get("updatedAt"))
    span_min = round((span_end - span_start).total_seconds() / 60, 1) if span_start and span_end else 0
    last = assignments[-1] if assignments else {}
    stage = "closed" if ticket.get("ended") else "working" if last.get("state") == "running" else "idle"
    session = find_session(ticket["id"])
    events = read_events(session) if session else []
    return {"id": ticket["id"][:8], "title": (ticket.get("title") or "")[:52], "stage": stage,
            "assignments": len(assignments), "work_min": work_min, "span_min": span_min,
            **analyze(events, None, None)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", default=os.path.expanduser(os.path.join("~", ".dsh", "state", "superagent-coil")))
    parser.add_argument("--db", help="override the orchestrator.sqlite path")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    db_path = args.db or os.path.join(os.path.expanduser(args.state_dir), "orchestrator.sqlite")
    rows = [metrics(ticket) for ticket in load_tickets(db_path)]
    rows.sort(key=lambda row: row.get("work_min") or 0, reverse=True)
    rows = rows[:args.limit]
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    print(f"{'id':9} {'stage':7} {'work':>6} {'span':>6} {'steps':>6} {'calls':>6} {'tok_in':>8} {'tok_out':>8} {'max_step':>8}  title")
    for row in rows:
        print(f"{row['id']:9} {row['stage']:7} {row.get('work_min') or 0:>6} {row.get('span_min') or 0:>6} "
              f"{row.get('steps') or 0:>6} {row.get('tool_calls') or 0:>6} {row.get('tokens_in') or 0:>8} "
              f"{row.get('tokens_out') or 0:>8} {row.get('max_step_s') or 0:>7.1f}s  {row['title']}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
