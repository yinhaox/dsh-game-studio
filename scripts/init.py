#!/usr/bin/env python3
"""Create a game repository from this studio's template/.

Copies ``template/`` into a destination directory (skipping ``__pycache__`` and
``.godot``), sets the studio name in the new ``studio.yaml``, and prints the
remaining setup steps. Python 3 standard library only.

The template lives in the dsh-game-studio checkout this script belongs to, so
the script works from any working directory: the repository root is derived
from the script's own location, never from ``cwd``.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

# repository layout, resolved from this file (scripts/init.py) and never from cwd
REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = REPO_ROOT / "template"
BUNDLE_DIR = REPO_ROOT / "packages" / "studio"
SETUP_DOC = REPO_ROOT / "setup" / "studio-setup.md"

# build artifacts and caches that must never be copied out of the template
EXCLUDED_DIR_NAMES = ("__pycache__", ".godot")

STUDIO_KEY = "studio"
DEFAULT_STUDIO = "My Game"
STUDIO_CONFIG = "studio.yaml"

# a plain YAML scalar cannot start with these, and cannot contain a comment or
# a key separator; such names are written as a double-quoted scalar instead
PLAIN_SCALAR_FIRST = set("-?:,[]{}#&*!|>'\"%@`")


class InitError(Exception):
    """A refusal or an unusable template; reported on stderr with exit code 1."""


def yaml_scalar(value: str) -> str:
    """Render ``value`` as a YAML scalar, quoting only when a plain one is unsafe."""
    plain = (
        bool(value)
        and value == value.strip()
        and value[0] not in PLAIN_SCALAR_FIRST
        and not any(char in value for char in "\r\n\t")
        and re.search(r":(\s|$)", value) is None
        and " #" not in value
    )
    if plain:
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def collect_template_entries() -> tuple[list[Path], list[Path]]:
    """Return the files and directories under template/, relative and sorted."""
    files: list[Path] = []
    dirs: list[Path] = []
    for path in sorted(TEMPLATE_DIR.rglob("*")):
        relative = path.relative_to(TEMPLATE_DIR)
        if any(part in EXCLUDED_DIR_NAMES for part in relative.parts):
            continue
        (dirs if path.is_dir() else files).append(relative)
    return files, dirs


def resolve_destination(raw: str) -> Path:
    """Resolve the destination argument against cwd, and refuse impossible targets."""
    destination = Path(raw).expanduser()
    if not destination.is_absolute():
        destination = Path.cwd() / destination
    destination = destination.resolve()
    if destination == REPO_ROOT or destination == TEMPLATE_DIR:
        raise InitError(f"{destination} is part of the studio repository; pick a new directory")
    if TEMPLATE_DIR in destination.parents:
        raise InitError(f"{destination} is inside template/; pick a directory outside it")
    return destination


def check_destination(destination: Path, force: bool) -> bool:
    """Refuse a non-empty destination without --force; return whether it already exists."""
    if not destination.exists():
        return False
    if not destination.is_dir():
        raise InitError(f"{destination} exists and is not a directory")
    if any(destination.iterdir()) and not force:
        raise InitError(
            f"{destination} is not empty; pass --force to copy into it (files from "
            f"template/ are overwritten, nothing else is deleted)"
        )
    return True


def copy_template(destination: Path, exists: bool) -> None:
    """Copy template/ into the destination, merging only when --force allowed it."""
    ignore = shutil.ignore_patterns(*EXCLUDED_DIR_NAMES)
    try:
        if exists:
            shutil.copytree(TEMPLATE_DIR, destination, ignore=ignore, dirs_exist_ok=True)
        else:
            shutil.copytree(TEMPLATE_DIR, destination, ignore=ignore)
    except OSError as error:
        raise InitError(f"could not copy the template into {destination}: {error}") from error


def write_studio_name(config_path: Path, studio: str) -> str:
    """Replace only the top-level ``studio:`` value; every other line stays byte-identical.

    Both files are opened with ``newline=""`` so the template's line endings survive
    the rewrite unchanged on every platform.
    """
    try:
        with open(config_path, "r", encoding="utf-8", newline="") as handle:
            text = handle.read()
    except OSError as error:
        raise InitError(f"could not read {config_path}: {error}") from error
    lines = text.splitlines(keepends=True)
    replacement = f"{STUDIO_KEY}: {yaml_scalar(studio)}"
    for index, line in enumerate(lines):
        if re.match(rf"{STUDIO_KEY}[ \t]*:", line):
            ending = line[len(line.rstrip("\r\n")):]
            lines[index] = replacement + ending
            break
    else:
        raise InitError(f"{config_path} has no top-level '{STUDIO_KEY}:' line; the template changed")
    try:
        with open(config_path, "w", encoding="utf-8", newline="") as handle:
            handle.write("".join(lines))
    except OSError as error:
        raise InitError(f"could not write {config_path}: {error}") from error
    return replacement


def write_godot_path(config_path: Path, godot: str) -> str:
    """Replace the ``godot.path`` value with a quoted, forward-slash path.

    Only the first ``path:`` line inside the ``godot:`` block is rewritten; the
    rest of ``studio.yaml`` stays byte-identical, line endings included.
    """
    normalized = godot.replace("\\", "/")
    replacement = f"  path: {yaml_scalar(normalized)}"
    try:
        with open(config_path, "r", encoding="utf-8", newline="") as handle:
            lines = handle.read().splitlines(keepends=True)
    except OSError as error:
        raise InitError(f"could not read {config_path}: {error}") from error
    in_godot = False
    for index, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r"godot[ \t]*:", line):
            in_godot = True
            continue
        if in_godot and stripped and not line[:1].isspace():
            break
        if in_godot and re.match(r"[ \t]+path[ \t]*:", line):
            ending = line[len(line.rstrip("\r\n")):]
            lines[index] = replacement + ending
            try:
                with open(config_path, "w", encoding="utf-8", newline="") as handle:
                    handle.write("".join(lines))
            except OSError as error:
                raise InitError(f"could not write {config_path}: {error}") from error
            return replacement
    raise InitError(f"{config_path} has no godot.path line; the template changed")


def print_next_steps(destination: Path) -> None:
    """Print what the operator still has to do by hand; nothing here is executed."""
    shown = str(destination)
    print()
    print("Next steps")
    print("  1. Push the new repository to GitHub (run these yourself; init.py ran no git command):")
    print(f'       git -C "{shown}" init -b main')
    print(f'       git -C "{shown}" add .')
    print(f'       git -C "{shown}" commit -m "chore: initialize the game repository"')
    print(f'       git -C "{shown}" remote add origin git@github.com:<owner>/<repo>.git')
    print(f'       git -C "{shown}" push -u origin main')
    print("     Point the superagent GitHub Source at that repository, not at a fork.")
    print("  2. Install the studio bundle into the superagent profile:")
    print(f'       dsh plugin --profile superagent add "link:{BUNDLE_DIR}"')
    print("     Then enable the three Sources and four Guards you want in the profile patch.")
    print("  3. Apply the setup document so the main Session writes the rules and prompt sections:")
    print(f"       {SETUP_DOC}")
    print("     Paste the operator message from its section 1, review the diff, then let it save.")
    print("  4. Start in observe: keep eval.mode on 'observe', read at least ten real tickets,")
    print("     and only then consider 'auto' (one rule at a time).")
    print("  5. Walk the panel checklist in section 7 of the setup document before the first work item.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="init.py",
        description=(
            "Create a Godot 4 game repository from this studio's template/ and set its studio name. "
            "Copies template/ (skipping __pycache__ and .godot), writes studio: into studio.yaml, "
            "and prints the next setup steps. Writes nothing outside the destination."
        ),
        epilog=(
            "examples:\n"
            "  python scripts/init.py ../my-game --studio \"My Game\"\n"
            "  python scripts/init.py ../my-game --studio \"My Game\" --godot \"<godot executable>\"\n"
            "  python scripts/init.py ../my-game --studio \"Demo Game\" --dry-run\n"
            "  python scripts/init.py ../my-game --force\n"
            "\n"
            "exit codes: 0 done, 1 refused or failed, 2 bad arguments"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "destination",
        metavar="DEST",
        help="directory to create the game repository in; a relative path resolves against the current directory",
    )
    parser.add_argument(
        "--studio",
        default=DEFAULT_STUDIO,
        metavar="NAME",
        help=f"studio name written to studio.yaml (default: {DEFAULT_STUDIO!r})",
    )
    parser.add_argument(
        "--godot",
        metavar="PATH",
        help="absolute path to the Godot executable, written to studio.yaml godot.path; use this when godot is not on PATH",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="copy into a non-empty destination, overwriting files that come from template/ (nothing else is deleted)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would be written and write nothing",
    )
    return parser


def run(args: argparse.Namespace, parser: argparse.ArgumentParser) -> int:
    studio = args.studio
    if not studio.strip():
        parser.error("--studio must not be empty")
    if any(ord(char) < 0x20 or ord(char) == 0x7F for char in studio):
        parser.error("--studio must be a single line without control characters")

    if not TEMPLATE_DIR.is_dir():
        raise InitError(f"template directory not found at {TEMPLATE_DIR}")
    if not (TEMPLATE_DIR / STUDIO_CONFIG).is_file():
        raise InitError(f"{TEMPLATE_DIR / STUDIO_CONFIG} is missing; the template is incomplete")

    destination = resolve_destination(args.destination)
    exists = check_destination(destination, args.force)
    files, dirs = collect_template_entries()
    config_path = destination / STUDIO_CONFIG
    planned_line = f"{STUDIO_KEY}: {yaml_scalar(studio)}"

    if args.dry_run:
        print("Dry run: nothing was written.")
        print(f"  template:     {TEMPLATE_DIR}")
        print(f"  destination:  {destination}" + (" (already exists)" if exists else " (would be created)"))
        print(f"  would copy:   {len(files)} files in {len(dirs)} directories")
        print(f"  excluded:     {', '.join(EXCLUDED_DIR_NAMES)}")
        print(f"  {STUDIO_CONFIG}: {planned_line}")
        if args.godot:
            print(f"  godot.path:   {args.godot.replace(chr(92), '/')}")
        print_next_steps(destination)
        return 0

    copy_template(destination, exists)
    write_studio_name(config_path, studio)
    if args.godot:
        write_godot_path(config_path, args.godot)

    print(f"Created {destination}")
    print(f"  copied {len(files)} files in {len(dirs)} directories from template/")
    print(f"  excluded {', '.join(EXCLUDED_DIR_NAMES)}")
    print(f"  {config_path}: {planned_line}")
    if args.godot:
        print(f"  godot.path: {args.godot.replace(chr(92), '/')}")
    print_next_steps(destination)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return run(args, parser)
    except InitError as error:
        print(f"init.py: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
