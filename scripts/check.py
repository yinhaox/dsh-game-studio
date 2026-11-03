#!/usr/bin/env python3
"""Validate the dsh-game-studio content layer.

Checks ``seed/`` and ``template/`` against ``docs/content-spec.md`` section 13,
plus the repository wiring that ties the seed to the plugin package:

* ``seed/policy.json`` rule set,
* the three team prompts,
* the six worker skills, eight role briefs, four path rules,
* the four issue templates and ``studio.yaml``,
* the Godot template scripts,
* ``docs/000`` through ``docs/005``,
* ``packages/studio/cordis.patch.yml`` rows against ``package.json`` exports,
* the seven plugin entry files exporting ``name`` and ``apply``,
* local links in ``README.md``.

Standard library only: no PyYAML and no third-party packages. The YAML subset
used by this repository (``key: value`` plus ``- item`` lists) is parsed here.

Usage::

    python scripts/check.py [--root PATH]

Prints one ``PASS``/``FAIL`` line per check and exits 1 when anything failed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------
# Facts from docs/content-spec.md
# --------------------------------------------------------------------------

RULE_IDS = (
    "design-doc",
    "story-implement",
    "code-review",
    "bug-fix",
    "qa-evidence",
    "release-prep",
    "studio-maintenance",
)

PROMPT_FILES = ("communication.md", "scope.md", "delivery.md")

SKILL_NAMES = (
    "studio-design",
    "studio-story",
    "studio-review",
    "studio-bug",
    "studio-evidence",
    "studio-release",
)

ROLE_NAMES = (
    "creative-director",
    "tech-director",
    "producer",
    "game-designer",
    "gameplay-programmer",
    "technical-artist",
    "qa-lead",
    "release-manager",
)

RULE_FILES = ("gdscript.md", "scenes.md", "data.md", "ui.md")

ISSUE_TEMPLATES = ("design.md", "story.md", "bug.md", "review.md")
ISSUE_TYPES = ("design", "story", "bug", "review")

STUDIO_TOP_KEYS = (
    "studio",
    "godot",
    "check_command",
    "test_command",
    "run_command",
    "capture_command",
    "evidence_dir",
    "story_dir",
)
STUDIO_GODOT_KEYS = ("path", "version")

TEMPLATE_FILES = (
    "scripts/studio.py",
    "tests/run_tests.gd",
    "addons/studio_capture/capture.gd",
)

DOC_NUMBERS = ("000", "001", "002", "003", "004", "005")

MAX_INSTRUCTION_CHARS = 2000
KEBAB_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FRONTMATTER_DELIMITER = re.compile(r"^---\s*$")
YAML_KEY_RE = re.compile(r"^([A-Za-z0-9_.-]+):(?:\s+(.*))?$")
ISSUE_TYPE_RE = re.compile(r"^Type:\s*(design|story|bug|review)\s*$")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")


# --------------------------------------------------------------------------
# Small parsing helpers (pure functions, unit tested)
# --------------------------------------------------------------------------

def is_kebab_case(value: str) -> bool:
    """True when ``value`` is lowercase words joined by single hyphens."""
    return isinstance(value, str) and KEBAB_RE.fullmatch(value) is not None


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Parse the leading ``---`` block of ``text``.

    Supports the small YAML subset used by the seed and template: ``key:
    value`` pairs and indented ``- item`` lists. Returns ``(data, body)``;
    when there is no well-formed frontmatter the data is empty and the whole
    text is returned as the body.
    """
    lines = text.splitlines()
    if not lines or not FRONTMATTER_DELIMITER.match(lines[0].strip()):
        return {}, text

    end: int | None = None
    for index in range(1, len(lines)):
        if FRONTMATTER_DELIMITER.match(lines[index].strip()):
            end = index
            break
    if end is None:
        return {}, text

    data: dict[str, Any] = {}
    current: str | None = None
    for raw in lines[1:end]:
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        stripped = line.strip()
        if stripped.startswith("- "):
            if current is None:
                continue
            if not isinstance(data.get(current), list):
                data[current] = []
            data[current].append(_strip_quotes(stripped[2:].strip()))
            continue
        match = YAML_KEY_RE.match(stripped)
        if match is None:
            continue
        key = match.group(1)
        value = (match.group(2) or "").strip()
        current = key
        if value == "":
            data[key] = []
        else:
            data[key] = _strip_quotes(value)

    return data, "\n".join(lines[end + 1:])


def parse_paths_frontmatter(text: str) -> list[str]:
    """Return the non-empty glob strings of a rules file's ``paths:`` list."""
    data, _ = parse_frontmatter(text)
    paths = data.get("paths")
    if not isinstance(paths, list):
        return []
    return [item for item in paths if isinstance(item, str) and item.strip()]


def parse_simple_yaml(text: str) -> dict[str, Any]:
    """Parse the flat/two-level YAML subset used by ``studio.yaml``."""
    result: dict[str, Any] = {}
    current: str | None = None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if raw[0] in " \t":
            if current is None:
                continue
            match = re.match(r"^\s+([A-Za-z0-9_.-]+):\s*(.*)$", raw)
            if match is None:
                continue
            nested = result.get(current)
            if not isinstance(nested, dict):
                nested = {}
                result[current] = nested
            nested[match.group(1)] = _strip_quotes(match.group(2).strip())
            continue
        match = YAML_KEY_RE.match(raw)
        if match is None:
            continue
        key = match.group(1)
        value = (match.group(2) or "").strip()
        current = key
        if value == "":
            result[key] = {}
        else:
            result[key] = _strip_quotes(value)
    return result


def parse_cordis_rows(text: str) -> list[tuple[str, str | None]]:
    """Return ``(id, name)`` pairs from a ``cordis.patch.yml`` insert block."""
    rows: list[list[str | None]] = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        id_match = re.match(r"^\s*-\s+id:\s*(\S+)\s*$", raw)
        if id_match is not None:
            rows.append([id_match.group(1), None])
            continue
        name_match = re.match(r"^\s+name:\s*['\"]?([^'\"\s]+)['\"]?\s*$", raw)
        if name_match is not None and rows:
            rows[-1][1] = name_match.group(1)
    return [(str(row[0]), row[1]) for row in rows]


def plugin_entry_path(root: Path, export_subpath: str) -> Path | None:
    """Map a package export subpath (``source-ci``) to its plugin entry file."""
    if export_subpath.startswith("source-"):
        return root / "packages" / "studio" / "src" / "producer" / export_subpath[len("source-"):] / "index.ts"
    if export_subpath.startswith("guard-"):
        return root / "packages" / "studio" / "src" / "guard" / export_subpath[len("guard-"):] / "index.ts"
    return None


def validate_policy(data: Any) -> list[str]:
    """Return every problem found in a parsed ``seed/policy.json`` object."""
    if not isinstance(data, dict):
        return ["policy must be a JSON object"]

    problems: list[str] = []
    rules = data.get("rules")
    if not isinstance(rules, list):
        problems.append("rules must be a list")
        rules = []

    if len(rules) != len(RULE_IDS):
        problems.append(f"expected {len(RULE_IDS)} rules, found {len(rules)}")

    seen: list[str] = []
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            problems.append(f"rule {index} must be an object")
            continue
        rule_id = rule.get("id")
        if not isinstance(rule_id, str) or not rule_id.strip():
            problems.append(f"rule {index} id must be a non-empty string")
            label = f"rule {index}"
        else:
            seen.append(rule_id)
            label = f"rule {rule_id!r}"

        if not isinstance(rule.get("enabled"), bool):
            problems.append(f"{label}: enabled must be a boolean")

        instruction = rule.get("instruction")
        if not isinstance(instruction, str) or not instruction.strip():
            problems.append(f"{label}: instruction must be a non-empty string")
        elif len(instruction) > MAX_INSTRUCTION_CHARS:
            problems.append(
                f"{label}: instruction is {len(instruction)} characters "
                f"(maximum {MAX_INSTRUCTION_CHARS})"
            )

    duplicates = sorted({rule_id for rule_id in seen if seen.count(rule_id) > 1})
    if duplicates:
        problems.append(f"duplicate rule ids: {', '.join(duplicates)}")

    missing = [rule_id for rule_id in RULE_IDS if rule_id not in seen]
    unexpected = sorted({rule_id for rule_id in seen if rule_id not in RULE_IDS})
    if missing:
        problems.append(f"missing rule ids: {', '.join(missing)}")
    if unexpected:
        problems.append(f"unexpected rule ids: {', '.join(unexpected)}")

    if not isinstance(data.get("eval"), dict):
        problems.append("eval must be an object")

    return problems


def read_local_links(text: str) -> list[str]:
    """Return local (non-URL) link targets from a Markdown document."""
    targets: list[str] = []
    for match in LINK_RE.finditer(text):
        raw = match.group(1).strip()
        if raw.startswith("<") and raw.endswith(">"):
            raw = raw[1:-1].strip()
        if not raw:
            continue
        target = raw.split()[0] if raw.split() else ""
        if not target or target.startswith("#"):
            continue
        if SCHEME_RE.match(target):
            continue
        path = urllib.parse.unquote(target.split("#", 1)[0].split("?", 1)[0])
        if path:
            targets.append(path)
    return targets


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

class Report:
    """Collected ``PASS``/``FAIL`` results for one validation run."""

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


def _read_text(path: Path, report: Report, label: str) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        report.fail(f"{label}: cannot read {path.name} ({error.strerror or error})")
    except UnicodeDecodeError as error:
        report.fail(f"{label}: not valid UTF-8 ({error.reason})")
    return None


def _read_json(path: Path, report: Report, label: str) -> Any | None:
    text = _read_text(path, report, label)
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        report.fail(f"{label}: invalid JSON ({error.msg} at line {error.lineno})")
        return None


# --------------------------------------------------------------------------
# Content checks
# --------------------------------------------------------------------------

def check_policy(root: Path, report: Report) -> None:
    label = "seed/policy.json"
    data = _read_json(root / "seed" / "policy.json", report, label)
    if data is None:
        return
    report.ok(f"{label}: parses as JSON")

    rules = data.get("rules") if isinstance(data, dict) else None
    if not isinstance(rules, list):
        report.fail(f"{label}: rules must be a list")
        rules = []

    rule_ids = [rule.get("id") for rule in rules if isinstance(rule, dict)]
    if (
        len(rules) == len(RULE_IDS)
        and len(rule_ids) == len(set(rule_ids))
        and set(rule_ids) == set(RULE_IDS)
    ):
        report.ok(f"{label}: exactly the seven expected rule ids, all unique")
    else:
        report.fail(
            f"{label}: expected exactly {len(RULE_IDS)} rules with unique ids "
            f"{', '.join(RULE_IDS)}"
        )

    field_problems: list[str] = []
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            field_problems.append(f"rule {index} is not an object")
            continue
        rule_id = rule.get("id")
        if not isinstance(rule.get("enabled"), bool):
            field_problems.append(f"rule {rule_id or index}: enabled is not a boolean")
        instruction = rule.get("instruction")
        if not isinstance(instruction, str) or not instruction.strip():
            field_problems.append(f"rule {rule_id or index}: instruction is empty")
        elif len(instruction) > MAX_INSTRUCTION_CHARS:
            field_problems.append(
                f"rule {rule_id or index}: instruction is {len(instruction)} characters "
                f"(maximum {MAX_INSTRUCTION_CHARS})"
            )
    if field_problems:
        for problem in field_problems:
            report.fail(f"{label}: {problem}")
    else:
        report.ok(
            f"{label}: every rule has a boolean enabled and a non-empty instruction "
            f"<= {MAX_INSTRUCTION_CHARS} characters"
        )

    if isinstance(data, dict) and isinstance(data.get("eval"), dict):
        report.ok(f"{label}: has an eval object")
    else:
        report.fail(f"{label}: missing an eval object")


def check_prompts(root: Path, report: Report) -> None:
    missing: list[str] = []
    empty: list[str] = []
    for name in PROMPT_FILES:
        path = root / "seed" / "prompts" / name
        if not path.is_file():
            missing.append(name)
            continue
        text = _read_text(path, report, f"seed/prompts/{name}")
        if text is not None and not text.strip():
            empty.append(name)
    if missing or empty:
        if missing:
            report.fail(f"seed/prompts: missing {', '.join(missing)}")
        if empty:
            report.fail(f"seed/prompts: empty {', '.join(empty)}")
    else:
        report.ok(f"seed/prompts: the three prompt files exist and are non-empty")


def check_skills(root: Path, report: Report) -> None:
    label = "template/.dsh/skills"
    failures: list[str] = []
    checked = 0
    unreadable = False
    for name in SKILL_NAMES:
        path = root / "template" / ".dsh" / "skills" / name / "SKILL.md"
        if not path.is_file():
            failures.append(f"{name}/SKILL.md is missing")
            continue
        text = _read_text(path, report, f"{label}/{name}/SKILL.md")
        if text is None:
            unreadable = True
            continue
        data, _ = parse_frontmatter(text)
        fm_name = data.get("name")
        description = data.get("description")
        if not isinstance(fm_name, str) or not fm_name.strip():
            failures.append(f"{name}/SKILL.md has no frontmatter name")
        elif fm_name != name:
            failures.append(f"{name}/SKILL.md name {fm_name!r} does not match its directory")
        elif not is_kebab_case(fm_name):
            failures.append(f"{name}/SKILL.md name {fm_name!r} is not kebab-case")
        if not isinstance(description, str) or not description.strip():
            failures.append(f"{name}/SKILL.md has no frontmatter description")
        checked += 1
    if failures:
        for failure in failures:
            report.fail(f"{label}: {failure}")
    elif not unreadable:
        report.ok(
            f"{label}: {checked} skills have a frontmatter name matching a kebab-case "
            f"directory and a description"
        )


def check_roles(root: Path, report: Report) -> None:
    label = "template/.dsh/agents"
    missing = [name for name in ROLE_NAMES if not (root / "template" / ".dsh" / "agents" / f"{name}.md").is_file()]
    if missing:
        report.fail(f"{label}: missing {', '.join(missing)}")
    else:
        report.ok(f"{label}: all eight role briefs exist")


def check_rules(root: Path, report: Report) -> None:
    label = "template/.dsh/rules"
    failures: list[str] = []
    checked = 0
    unreadable = False
    for name in RULE_FILES:
        path = root / "template" / ".dsh" / "rules" / name
        if not path.is_file():
            failures.append(f"{name} is missing")
            continue
        text = _read_text(path, report, f"{label}/{name}")
        if text is None:
            unreadable = True
            continue
        globs = parse_paths_frontmatter(text)
        if not globs:
            failures.append(f"{name} has no non-empty paths frontmatter list")
        checked += 1
    if failures:
        for failure in failures:
            report.fail(f"{label}: {failure}")
    elif not unreadable:
        report.ok(f"{label}: {checked} rule files declare a paths glob list")


def check_issue_templates(root: Path, report: Report) -> None:
    label = "template/.github/ISSUE_TEMPLATE"
    failures: list[str] = []
    checked = 0
    unreadable = False
    for name in ISSUE_TEMPLATES:
        path = root / "template" / ".github" / "ISSUE_TEMPLATE" / name
        if not path.is_file():
            failures.append(f"{name} is missing")
            continue
        text = _read_text(path, report, f"{label}/{name}")
        if text is None:
            unreadable = True
            continue
        first_line = text.splitlines()[0].strip() if text.splitlines() else ""
        match = ISSUE_TYPE_RE.match(first_line)
        if match is None:
            failures.append(f"{name} first line is not 'Type: design|story|bug|review' ({first_line!r})")
        checked += 1
    if failures:
        for failure in failures:
            report.fail(f"{label}: {failure}")
    elif not unreadable:
        report.ok(f"{label}: {checked} issue templates start with a valid Type line")


def check_studio_yaml(root: Path, report: Report) -> None:
    label = "template/studio.yaml"
    path = root / "template" / "studio.yaml"
    text = _read_text(path, report, label)
    if text is None:
        return
    data = parse_simple_yaml(text)
    missing = [key for key in STUDIO_TOP_KEYS if key not in data]
    if missing:
        report.fail(f"{label}: missing keys {', '.join(missing)}")
    else:
        empty = []
        for key in STUDIO_TOP_KEYS:
            value = data[key]
            if key == "godot":
                continue
            if not isinstance(value, str) or not value.strip():
                empty.append(key)
        godot = data.get("godot")
        if not isinstance(godot, dict):
            empty.append("godot")
        else:
            for key in STUDIO_GODOT_KEYS:
                value = godot.get(key)
                if not isinstance(value, str) or not value.strip():
                    empty.append(f"godot.{key}")
        if empty:
            report.fail(f"{label}: empty required values {', '.join(empty)}")
        else:
            report.ok(f"{label}: has the required studio keys and godot path/version")


def check_template_files(root: Path, report: Report) -> None:
    missing = [rel for rel in TEMPLATE_FILES if not (root / "template" / rel).is_file()]
    if missing:
        report.fail(f"template: missing {', '.join(missing)}")
    else:
        report.ok(f"template: studio.py, run_tests.gd and capture.gd exist")


def _docs_present(root: Path) -> dict[str, bool]:
    docs_dir = root / "docs"
    present: dict[str, bool] = {number: False for number in DOC_NUMBERS}
    if not docs_dir.is_dir():
        return present
    for entry in docs_dir.iterdir():
        if not entry.is_file() or entry.suffix != ".md":
            continue
        for number in DOC_NUMBERS:
            if re.match(rf"^{number}(?!\d)", entry.name):
                present[number] = True
    return present


def check_docs(root: Path, report: Report) -> None:
    present = _docs_present(root)
    missing = [f"docs/{number}" for number, found in present.items() if not found]
    if missing:
        report.fail(f"docs: missing {', '.join(missing)}")
    else:
        report.ok("docs: 000 through 005 exist")


def check_cordis_and_entries(root: Path, report: Report) -> None:
    label = "packages/studio/cordis.patch.yml"
    cordis = _read_text(path=root / "packages" / "studio" / "cordis.patch.yml", report=report, label=label)
    package = _read_json(root / "packages" / "studio" / "package.json", report, "packages/studio/package.json")
    if cordis is None or not isinstance(package, dict):
        return

    rows = parse_cordis_rows(cordis)
    if len(rows) != 7:
        report.fail(f"{label}: expected 7 plugin rows, found {len(rows)}")
    else:
        report.ok(f"{label}: declares 7 plugin rows")

    if len({row_id for row_id, _ in rows}) != len(rows):
        report.fail(f"{label}: row ids are not unique")

    package_name = package.get("name")
    exports = package.get("exports")
    if not isinstance(package_name, str) or not package_name:
        report.fail("packages/studio/package.json: missing package name")
        return
    if not isinstance(exports, dict):
        report.fail("packages/studio/package.json: exports must be an object")
        return

    unresolved: list[str] = []
    entry_failures: list[str] = []
    unreadable_entry = False
    for row_id, row_name in rows:
        if row_name is None:
            unresolved.append(f"{row_id} (no name)")
            continue
        prefix = package_name + "/"
        if not row_name.startswith(prefix):
            unresolved.append(f"{row_name} (not under {package_name})")
            continue
        export_subpath = row_name[len(prefix):]
        export_key = "./" + export_subpath
        if export_key not in exports:
            unresolved.append(f"{row_name} ({export_key} not in exports)")
            continue

        entry = plugin_entry_path(root, export_subpath)
        if entry is None:
            entry_failures.append(f"{export_subpath}: cannot derive a plugin entry path")
            continue
        if not entry.is_file():
            entry_failures.append(f"{row_id}: entry {entry.relative_to(root).as_posix()} is missing")
            continue
        text = _read_text(entry, report, f"{row_id} entry")
        if text is None:
            unreadable_entry = True
            continue
        expected_name = f"dsh-game-studio/{export_subpath}"
        if not re.search(r"export\s+const\s+name\s*=", text):
            entry_failures.append(f"{row_id}: entry does not export a name constant")
        elif f"'{expected_name}'" not in text and f'"{expected_name}"' not in text:
            entry_failures.append(f"{row_id}: entry name is not {expected_name!r}")
        if not re.search(r"export\s+(?:async\s+)?function\s+apply\s*\(", text):
            entry_failures.append(f"{row_id}: entry does not export an apply function")

    if unresolved:
        for problem in unresolved:
            report.fail(f"{label}: row name {problem} does not resolve to a package.json export")
    else:
        report.ok(f"{label}: every row name resolves to a package.json export")

    if entry_failures:
        for problem in entry_failures:
            report.fail(f"{label}: {problem}")
    elif not unreadable_entry:
        report.ok(f"{label}: all seven source/guard entry files export name and apply")


def check_readme_links(root: Path, report: Report) -> None:
    label = "README.md"
    readme = root / "README.md"
    text = _read_text(readme, report, label)
    if text is None:
        return
    missing: list[str] = []
    checked = 0
    for target in read_local_links(text):
        checked += 1
        resolved = Path(target)
        if not resolved.is_absolute():
            resolved = readme.parent / target
        if not resolved.exists():
            missing.append(target)
    if missing:
        for target in missing:
            report.fail(f"{label}: link target does not exist: {target}")
    else:
        report.ok(f"{label}: {checked} local links point at existing files")


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def validate(root: Path) -> Report:
    """Run every content check against ``root`` and return the report."""
    root = Path(root)
    report = Report()
    check_policy(root, report)
    check_prompts(root, report)
    check_skills(root, report)
    check_roles(root, report)
    check_rules(root, report)
    check_issue_templates(root, report)
    check_studio_yaml(root, report)
    check_template_files(root, report)
    check_docs(root, report)
    check_cordis_and_entries(root, report)
    check_readme_links(root, report)
    return report


def main(argv: list[str] | None = None) -> int:
    default_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Validate the dsh-game-studio seed and template.")
    parser.add_argument(
        "--root",
        default=str(default_root),
        help="repository root to validate (default: the parent of this script's directory)",
    )
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"FAIL --root is not a directory: {root}")
        return 1
    report = validate(root)
    print(report.render())
    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
