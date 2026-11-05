#!/usr/bin/env python3
"""Reject placeholder text and hard-coded player-facing strings.

Commercial quality means no TODO in a player screen, no "placeholder" label, and
no UI text that bypasses the translation table. This scan reads tracked source and
UI files and fails on the first category it finds.

A literal that carries no words, such as the "%d" in a volume read-out, has
nothing to translate and is allowed.

    python scripts/quality-check.py
"""

from __future__ import annotations

import io
import re
import subprocess
import sys

PLACEHOLDER = re.compile(r"\b(TODO|FIXME|Lorem ipsum|placeholder|Placeholder|PLACEHOLDER)\b")
# A literal assignment to text in a UI script or scene that is not a translation
# call. Block comments and empty strings are allowed.
LITERAL_TEXT_GD = re.compile(r"\.text\s*=\s*\"([^\"\\]{1,80})\"")
LITERAL_TEXT_TSCN = re.compile(r"^text\s*=\s*\"([^\"\\]{1,80})\"", re.MULTILINE)
SKIP = (".import", ".uid")

# A printf-style placeholder such as "%d" or "%.1f" is formatting, not words.
FORMAT_SPECIFIER = re.compile(r"%[-+ 0#]*[0-9]*(?:\.[0-9]+)?[sdifxeEgcXoO%]")


def tracked(prefix: str) -> list[str]:
    output = subprocess.check_output(["git", "ls-files", prefix], text=True)
    return [line for line in output.splitlines() if line and not line.endswith(SKIP)]


def carries_words(literal: str) -> bool:
    """True when a translator would have something to rewrite."""
    return bool(re.search(r"[^\W\d_]", FORMAT_SPECIFIER.sub("", literal), re.UNICODE))


def findings_in(path: str, text: str) -> list[str]:
    """Every violation in one file, formatted as ``path:line: reason``."""
    findings: list[str] = []
    for match in PLACEHOLDER.finditer(text):
        line = text.count("\n", 0, match.start()) + 1
        findings.append(f"{path}:{line}: placeholder text '{match.group(0)}'")
    if path.endswith(".gd") and ("/ui/" in path or path.endswith("_ui.gd")):
        for match in LITERAL_TEXT_GD.finditer(text):
            if carries_words(match.group(1)):
                line = text.count("\n", 0, match.start()) + 1
                findings.append(
                    f"{path}:{line}: literal UI text '{match.group(1)}' - use the translation table"
                )
    if path.endswith(".tscn") and "/ui/" in path:
        for match in LITERAL_TEXT_TSCN.finditer(text):
            if carries_words(match.group(1)):
                findings.append(
                    f"{path}: literal UI text '{match.group(1)}' - use the translation table"
                )
    return findings


def main() -> int:
    findings: list[str] = []
    for path in tracked("src") + tracked("scenes"):
        try:
            text = io.open(path, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        findings.extend(findings_in(path, text))
    if findings:
        print("Quality check failed:", file=sys.stderr)
        for finding in findings[:40]:
            print("  " + finding, file=sys.stderr)
        return 1
    print("quality check passed: no placeholders, no literal UI text")
    return 0


if __name__ == "__main__":
    sys.exit(main())
