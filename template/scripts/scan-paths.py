#!/usr/bin/env python3
"""Fail when a tracked file contains an absolute filesystem path.

Authored files must use project-relative paths. A drive letter, a UNC share, a
POSIX home or temp path, or a machine-specific directory in a comment, a test,
or a document is a leak: it breaks on another machine and often reveals the
operator's layout.

    python scripts/scan-paths.py
"""

from __future__ import annotations

import io
import re
import subprocess
import sys

PATTERNS = [
    re.compile(r"(^|[^\w])([A-Za-z]:[\\/])"),
    re.compile(r"^\\\\[A-Za-z0-9._-]+\\", re.MULTILINE),
    re.compile(r"(^|[\s\"'`(])/(home|Users|root|mnt|var/folders)/"),
]
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".ttf", ".otf",
    ".zip", ".exe", ".pck", ".wasm", ".glb", ".bin", ".wav", ".ogg",
    ".avi", ".mp4", ".mov", ".mkv", ".mp3", ".flac", ".pdf",
    ".import", ".uid",
}


def tracked_files() -> list[str]:
    output = subprocess.check_output(["git", "ls-files"], text=True)
    return [line for line in output.splitlines() if line]


def main() -> int:
    findings: list[str] = []
    for path in tracked_files():
        if any(path.lower().endswith(ext) for ext in SKIP_EXTENSIONS):
            continue
        try:
            text = io.open(path, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        for pattern in PATTERNS:
            match = pattern.search(text)
            if match:
                line = text.count("\n", 0, match.start()) + 1
                findings.append(f"{path}:{line}: {match.group(0).strip()[:80]}")
                break
    if findings:
        print("Absolute filesystem paths found:", file=sys.stderr)
        for finding in findings[:40]:
            print("  " + finding, file=sys.stderr)
        return 1
    print(f"scanned {len(tracked_files())} tracked files; no absolute paths")
    return 0


if __name__ == "__main__":
    sys.exit(main())
