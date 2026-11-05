#!/usr/bin/env python3
"""Fail when a tracked file contains an absolute filesystem path.

Authored files must use project-relative paths. A drive letter, a UNC share, a
POSIX home or temp path, or a machine-specific directory in a comment, a test,
or a document is a leak: it breaks on another machine and often reveals the
operator's layout.

Evidence under ``production/qa/evidence/`` is captured command output, not text
an author chose, so a synthetic drive letter from an invalid-path test is
legitimate there. What must never land in one is the operator's machine: a home
directory path or a desktop host name.

    python scripts/scan-paths.py
"""

from __future__ import annotations

import io
import re
import subprocess
import sys

EVIDENCE_PREFIX = "production/qa/evidence/"

PATTERNS = [
    re.compile(r"(^|[^\w])([A-Za-z]:[\\/])"),
    re.compile(r"^\\\\[A-Za-z0-9._-]+\\", re.MULTILINE),
    re.compile(r"(^|[\s\"'`(])/(home|Users|root|mnt|var/folders)/"),
]

MACHINE_PATTERNS = [
    re.compile(r"[A-Za-z]:[\\/]Users[\\/]"),
    re.compile(r"(^|[\s\"'`(])/(home|Users)/[A-Za-z0-9._-]+/"),
    re.compile(r"\bDESKTOP-[A-Z0-9]{4,}"),
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


def patterns_for(path: str) -> list[re.Pattern]:
    """The rules that apply to this path: captured evidence is identity-only."""
    if path.replace("\\", "/").startswith(EVIDENCE_PREFIX):
        return MACHINE_PATTERNS
    return PATTERNS


def finding_in(path: str, text: str) -> str | None:
    """The first violation in the text, formatted as ``path:line: match``."""
    for pattern in patterns_for(path):
        match = pattern.search(text)
        if match:
            line = text.count("\n", 0, match.start()) + 1
            return f"{path}:{line}: {match.group(0).strip()[:80]}"
    return None


def main() -> int:
    findings: list[str] = []
    for path in tracked_files():
        if any(path.lower().endswith(ext) for ext in SKIP_EXTENSIONS):
            continue
        try:
            text = io.open(path, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        finding = finding_in(path, text)
        if finding:
            findings.append(finding)
    if findings:
        print("Absolute filesystem paths found:", file=sys.stderr)
        for finding in findings[:40]:
            print("  " + finding, file=sys.stderr)
        return 1
    print(f"scanned {len(tracked_files())} tracked files; no absolute paths")
    return 0


if __name__ == "__main__":
    sys.exit(main())
