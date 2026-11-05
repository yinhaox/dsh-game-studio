#!/usr/bin/env python3
"""Check that every translation key used in code exists in each language table.

Scans `tr("key")` and `text("key")` calls in scripts and `tr("key")`-style keys in
scenes, then compares them with `assets/data/i18n/<lang>.json`. A key used but
missing from a language fails the check; an unused key is reported as a warning.

    python scripts/i18n-check.py
"""

from __future__ import annotations

import glob
import io
import json
import os
import re
import sys

# Both Godot's `tr("key")` and the project's `Localization.text("key")` name a
# table entry; a scan that only saw `tr()` would miss half the UI.
TR = re.compile(r"""(?:\btr|\btext)\(\s*["']([A-Za-z0-9_.%-]+)["']""")
I18N_DIR = os.path.join("assets", "data", "i18n")


def language_tables() -> dict[str, dict]:
    tables: dict[str, dict] = {}
    for path in glob.glob(os.path.join(I18N_DIR, "*.json")):
        language = os.path.splitext(os.path.basename(path))[0]
        if language == "schema":
            continue
        try:
            tables[language] = json.load(io.open(path, encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            print(f"cannot read {path}: {error}", file=sys.stderr)
    return tables


def used_keys() -> set[str]:
    keys: set[str] = set()
    for pattern in ("src/**/*.gd", "scenes/**/*.tscn"):
        for path in glob.glob(pattern, recursive=True):
            try:
                text = io.open(path, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            keys.update(TR.findall(text))
    return keys


def main() -> int:
    tables = language_tables()
    if not tables:
        print("no language tables found under assets/data/i18n", file=sys.stderr)
        return 1
    keys = used_keys()
    missing: list[str] = []
    for language, table in sorted(tables.items()):
        for key in sorted(keys - set(table)):
            missing.append(f"{language}: {key}")
    for language, table in sorted(tables.items()):
        unused = sorted(set(table) - keys)
        if unused:
            print(f"warning: {language} has {len(unused)} unused key(s), first: {unused[:5]}")
    if missing:
        print("Translation keys used but missing:", file=sys.stderr)
        for item in missing[:40]:
            print("  " + item, file=sys.stderr)
        return 1
    print(f"i18n check passed: {len(keys)} keys across {len(tables)} language(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
