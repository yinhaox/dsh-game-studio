#!/usr/bin/env python3
"""Check the pinned dsh-superagent checkout against this studio's contract.

``compat.json`` pins the upstream superagent checkout that
``packages/studio/src/shared/superagent.ts`` mirrors. This script fails when
that checkout disappears or when the interfaces the studio depends on drift:

* ``src/sources/host.ts`` declares ``SourceHost`` and ``SourceContext`` with
  ``context``, ``receive``, ``report``, ``threads`` and ``state``;
* ``src/sources/kind.ts`` declares ``SourceKind`` with ``kind``, ``schema``,
  ``fields``, ``health``, ``scope`` and ``policy``;
* ``packages/studio/src/shared/superagent.ts`` declares the same names and
  members.

Usage::

    python scripts/compat-check.py [--root PATH] [--superagent PATH]

Prints one ``PASS``/``FAIL`` line per check and exits 1 on drift.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


HOST_RELATIVE = Path("src") / "sources" / "host.ts"
KIND_RELATIVE = Path("src") / "sources" / "kind.ts"
SHARED_RELATIVE = Path("packages") / "studio" / "src" / "shared" / "superagent.ts"

HOST_MEMBERS = {
    "SourceHost": ("context",),
    "SourceContext": ("receive", "report", "threads", "state"),
}
KIND_MEMBERS = {
    "SourceKind": ("kind", "schema", "fields", "health", "scope", "policy"),
}
SHARED_MEMBERS = {
    "SourceHost": ("context",),
    "SourceContext": ("receive", "report", "threads", "state"),
    "SourceKind": ("kind", "schema", "fields", "health", "scope", "policy"),
}


class Report:
    """Collected ``PASS``/``FAIL`` results for one compatibility run."""

    def __init__(self) -> None:
        self.checks: list[tuple[bool, str]] = []

    def ok(self, message: str) -> None:
        self.checks.append((True, message))

    def fail(self, message: str) -> None:
        self.checks.append((False, message))

    @property
    def failures(self) -> list[str]:
        return [message for passed, message in self.checks if not passed]

    @property
    def passed(self) -> int:
        return sum(1 for passed, _ in self.checks if passed)

    @property
    def exit_code(self) -> int:
        return 0 if not self.failures else 1

    def render(self) -> str:
        lines = [f"{'PASS' if passed else 'FAIL'} {message}" for passed, message in self.checks]
        lines.append("")
        lines.append(f"{self.passed} passed, {len(self.failures)} failed")
        return "\n".join(lines)


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None
    except UnicodeDecodeError:
        return None


def interface_body(text: str, name: str) -> str | None:
    """Return the body of ``interface <name> { ... }``, or ``None`` if absent."""
    match = re.search(rf"(?<![\w$])interface\s+{re.escape(name)}\b[^{{]*\{{", text)
    if match is None:
        return None
    start = match.end()
    depth = 1
    index = start
    while index < len(text) and depth > 0:
        character = text[index]
        if character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
        index += 1
    if depth != 0:
        return None
    return text[start:index - 1]


def has_member(body: str, member: str) -> bool:
    """True when ``body`` declares a property or method named ``member``."""
    return re.search(rf"(?<![\w$]){re.escape(member)}\s*(?:[?:]|\()", body) is not None


def check_interfaces(
    text: str,
    path: Path,
    required: dict[str, tuple[str, ...]],
    report: Report,
    label: str,
) -> None:
    for interface, members in required.items():
        body = interface_body(text, interface)
        if body is None:
            report.fail(f"{label}: {path.as_posix()} no longer declares {interface}")
            continue
        missing = [member for member in members if not has_member(body, member)]
        if missing:
            report.fail(
                f"{label}: {interface} in {path.as_posix()} no longer declares "
                f"{', '.join(missing)}"
            )
        else:
            report.ok(f"{label}: {interface} declares {', '.join(members)}")


def check_file(
    path: Path,
    required: dict[str, tuple[str, ...]],
    report: Report,
    label: str,
) -> None:
    text = read_text(path)
    if text is None:
        report.fail(f"{label}: cannot read {path.as_posix()}")
        return
    check_interfaces(text, path, required, report, label)


def main(argv: list[str] | None = None) -> int:
    default_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Check the pinned superagent contract.")
    parser.add_argument(
        "--root",
        default=str(default_root),
        help="repository root (default: the parent of this script's directory)",
    )
    parser.add_argument(
        "--superagent",
        default=None,
        help="superagent checkout to inspect instead of the path pinned in compat.json",
    )
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"FAIL --root is not a directory: {root}")
        return 1

    report = Report()
    compat_path = root / "compat.json"
    text = read_text(compat_path)
    if text is None:
        report.fail("compat.json: cannot read the file")
        print(report.render())
        return report.exit_code
    try:
        compat: Any = json.loads(text)
    except json.JSONDecodeError as error:
        report.fail(f"compat.json: invalid JSON ({error.msg} at line {error.lineno})")
        print(report.render())
        return report.exit_code

    superagent_pin = compat.get("superagent") if isinstance(compat, dict) else None
    pinned_path = superagent_pin.get("path") if isinstance(superagent_pin, dict) else None
    if not isinstance(pinned_path, str):
        pinned_path = ""
    pinned_path = pinned_path.strip()
    if pinned_path:
        report.ok(f"compat.json: pins superagent at {pinned_path}")
    else:
        report.ok("compat.json: no machine path pinned; pass --superagent")

    choice = args.superagent or os.environ.get("SUPERAGENT_DIR") or pinned_path
    if not choice:
        print("FAIL no superagent checkout named; pass --superagent PATH or set SUPERAGENT_DIR")
        print(report.render())
        return 2
    checkout = Path(choice)
    if not checkout.is_absolute():
        checkout = root / checkout
    checkout = checkout.resolve()

    if not checkout.is_dir():
        report.fail(f"superagent checkout does not exist: {checkout}")
        print(report.render())
        return report.exit_code
    report.ok(f"superagent checkout exists: {checkout}")

    check_file(checkout / HOST_RELATIVE, HOST_MEMBERS, report, "superagent host.ts")
    check_file(checkout / KIND_RELATIVE, KIND_MEMBERS, report, "superagent kind.ts")
    check_file(root / SHARED_RELATIVE, SHARED_MEMBERS, report, "studio shared/superagent.ts")

    print(report.render())
    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
