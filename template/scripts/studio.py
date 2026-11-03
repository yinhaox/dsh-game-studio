#!/usr/bin/env python3
"""Godot studio helper: check, test, run, and capture.

Configuration is read from studio.yaml at the project root. Only the keys this
helper needs are parsed (studio, godot.path, godot.version, check_command,
test_command, run_command, capture_command, evidence_dir, story_dir). A small
line parser is used, so PyYAML is not required.

Every subcommand runs Godot with cwd set to the project root, which is the
directory that contains studio.yaml.

Exit codes:

  0    success
  1    the command ran but the check failed
  2    configuration problem, or the Godot executable could not be found
  124  a timeout elapsed
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time

# Godot prints UTF-8, including localized progress lines. Pin the helper's own
# streams to UTF-8 so redirected logs and captured tool output stay readable on
# a Windows console whose code page is something else.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

CONFIG_NAME = "studio.yaml"
DEFAULT_GODOT = "godot"
DEFAULT_EVIDENCE_DIR = "production/qa/evidence"
DEFAULT_STORY_DIR = "production/stories"
DEFAULT_CAPTURE_TIMEOUT = 60.0
DEFAULT_COMMAND_TIMEOUT = 300.0
MIN_PNG_BYTES = 1024
TEST_SCRIPT = "res://tests/run_tests.gd"


class StudioError(Exception):
    """A configuration problem that the user can fix."""

    def __init__(self, message: str, code: int = 2) -> None:
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------------------
# studio.yaml parsing (line based, no third-party YAML)
# ---------------------------------------------------------------------------


def _strip_comment(value: str) -> str:
    """Drop a trailing '#' comment, leaving quoted text alone."""
    out = []
    quote = ""
    for char in value:
        if quote:
            out.append(char)
            if char == quote:
                quote = ""
            continue
        if char in ('"', "'"):
            quote = char
            out.append(char)
            continue
        if char == "#":
            break
        out.append(char)
    return "".join(out)


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        return value[1:-1]
    return value


def parse_studio_yaml(text: str) -> dict:
    """Parse the small subset of YAML used by studio.yaml.

    Top-level scalars become plain keys; one level of nesting becomes dicts
    (for example godot.path). Quotes and trailing comments are stripped.
    """
    tree: dict = {}
    section = None
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        content = line.strip()
        if not content or content.startswith("#"):
            continue
        if content.startswith("---"):
            continue
        indent = len(line) - len(line.lstrip(" \t"))
        key, separator, value = content.partition(":")
        if not separator:
            continue
        key = _unquote(key.strip())
        value = _unquote(_strip_comment(value).strip())
        if indent == 0:
            if value:
                tree[key] = value
                section = None
            else:
                tree[key] = {}
                section = key
        elif section is not None and isinstance(tree.get(section), dict):
            tree[section][key] = value
    return tree


def flatten_config(tree: dict) -> dict:
    """Flatten nested sections into dotted keys: godot.path, godot.version."""
    flat: dict = {}
    for key, value in tree.items():
        if isinstance(value, dict):
            for child_key, child_value in value.items():
                flat[f"{key}.{child_key}"] = child_value
        else:
            flat[key] = value
    return flat


def find_upwards(start: str, filename: str):
    """Return the nearest directory at or above start that contains filename."""
    current = os.path.abspath(start)
    while True:
        if os.path.isfile(os.path.join(current, filename)):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def locate_root(explicit: str | None) -> str:
    """Resolve the project root (the directory holding studio.yaml)."""
    if explicit:
        root = os.path.abspath(os.path.expanduser(explicit))
        if not os.path.isdir(root):
            raise StudioError(f"--root is not a directory: {root}")
        return root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [script_dir]
    cwd = os.path.abspath(os.getcwd())
    if cwd != script_dir:
        candidates.append(cwd)
    for start in candidates:
        found = find_upwards(start, CONFIG_NAME)
        if found:
            return found
    return script_dir


def load_config(root: str) -> dict:
    path = os.path.join(root, CONFIG_NAME)
    if not os.path.isfile(path):
        raise StudioError(
            f"studio.yaml not found: {path}\n"
            "Run this helper from inside a Godot studio project, or pass --root DIR\n"
            "pointing at the directory that contains studio.yaml."
        )
    try:
        with open(path, "r", encoding="utf-8-sig") as handle:
            text = handle.read()
    except OSError as exc:
        raise StudioError(f"cannot read {path}: {exc}") from exc
    flat = flatten_config(parse_studio_yaml(text))
    if not flat:
        raise StudioError(f"studio.yaml has no readable keys: {path}")
    return flat


def config_str(config: dict, key: str, default: str = "") -> str:
    value = config.get(key)
    if value is None:
        return default
    value = str(value).strip()
    return value if value else default


# ---------------------------------------------------------------------------
# Godot discovery
# ---------------------------------------------------------------------------


def resolve_godot(raw_path: str, root: str):
    """Find the Godot executable: absolute, project-relative, then PATH."""
    raw_path = raw_path.strip()
    if not raw_path:
        return None
    if os.path.isabs(raw_path):
        return raw_path if os.path.isfile(raw_path) else None
    local = os.path.join(root, raw_path)
    if os.path.isfile(local):
        return os.path.abspath(local)
    found = shutil.which(raw_path)
    return found


def require_godot(config: dict, root: str) -> str:
    # A shared studio.yaml names `godot` from PATH; a machine that keeps the
    # engine elsewhere sets STUDIO_GODOT, which CI also uses.
    raw_path = os.environ.get("STUDIO_GODOT") or config_str(config, "godot.path", DEFAULT_GODOT)
    resolved = resolve_godot(raw_path, root)
    if resolved is not None:
        return resolved
    version = config_str(config, "godot.version", "4.7")
    raise StudioError(
        f"Godot executable not found: {raw_path!r}\n"
        f"This project expects Godot {version} at godot.path = {raw_path!r} in {CONFIG_NAME}.\n"
        "Fix one of these, then run the command again:\n"
        f"  1. Install Godot {version} and make sure the {DEFAULT_GODOT!r} command works in a shell.\n"
        "  2. Set godot.path in studio.yaml to an absolute path, for example C:/Tools/Godot/godot.exe.\n"
        "  3. Set godot.path to a path relative to the project root, for example tools/godot/godot.exe.\n"
        f"Project root: {root}"
    )


# ---------------------------------------------------------------------------
# Process helpers
# ---------------------------------------------------------------------------


def _terminate(process: subprocess.Popen) -> None:
    try:
        process.kill()
    except OSError:
        pass


def _format_command(argv) -> str:
    return " ".join(argv)


def _print_tail(output: str, limit: int = 40) -> None:
    lines = output.splitlines()
    if not lines:
        return
    shown = lines[-limit:] if limit > 0 else lines
    print(f"--- output (last {len(shown)} line(s)) ---")
    for line in shown:
        print(line)


def run_process(argv, cwd: str, timeout=None, echo: bool = False, tail: int = 0):
    """Run argv with cwd, optionally echoing output.

    Returns (exit_code, combined_output, timed_out).
    """
    print("$ " + _format_command(argv), flush=True)
    process = subprocess.Popen(
        argv,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    timed_out = False

    def _on_timeout() -> None:
        nonlocal timed_out
        timed_out = True
        _terminate(process)

    timer = threading.Timer(timeout, _on_timeout) if timeout else None
    if timer is not None:
        timer.daemon = True
        timer.start()

    chunks = []
    try:
        assert process.stdout is not None
        for line in process.stdout:
            chunks.append(line)
            if echo:
                sys.stdout.write(line)
                sys.stdout.flush()
    except KeyboardInterrupt:
        _terminate(process)
        process.wait()
        raise
    finally:
        if timer is not None:
            timer.cancel()

    code = process.wait()
    output = "".join(chunks)
    if tail > 0:
        _print_tail(output, tail)
    return code, output, timed_out


def _clamp_exit_code(code: int) -> int:
    if code == 0:
        return 0
    if 0 < code < 256:
        return code
    return 1


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------


def changed_gd_scripts(root: str) -> list:
    """Return changed or untracked .gd paths (forward slashes) that exist."""
    git = shutil.which("git")
    if git is None:
        print("[check] git not found on PATH; skipping changed-script parse checks")
        return []
    commands = [
        [git, "diff", "--name-only", "HEAD"],
        [git, "ls-files", "--others", "--exclude-standard"],
        [git, "diff", "--name-only"],
    ]
    names = []
    for command in commands:
        try:
            result = subprocess.run(
                command,
                cwd=root,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if result.returncode != 0:
            continue
        for line in result.stdout.splitlines():
            name = line.strip()
            if name:
                names.append(name)
    ordered = []
    seen = set()
    for name in names:
        relative = name.replace("\\", "/")
        if relative.startswith("./"):
            relative = relative[2:]
        if not relative.endswith(".gd") or relative in seen:
            continue
        seen.add(relative)
        if os.path.isfile(os.path.join(root, relative)):
            ordered.append(relative)
    return ordered


def cmd_check(args, config: dict, root: str) -> int:
    godot = require_godot(config, root)
    print(f"[check] project: {root}")
    code, output, timed_out = run_process(
        [godot, "--headless", "--path", ".", "--import"],
        cwd=root,
        timeout=args.timeout,
        tail=args.tail,
    )
    if timed_out:
        print(f"[check] timed out after {args.timeout:g}s", file=sys.stderr)
        return 124
    if code != 0:
        print(f"[check] import failed with exit code {code}", file=sys.stderr)
        return _clamp_exit_code(code)
    print("[check] import OK")

    if args.no_scripts:
        print("[check] --no-scripts given; skipping parse checks")
        return 0

    scripts = changed_gd_scripts(root)
    if not scripts:
        print("[check] no changed .gd files to parse-check")
        return 0

    failures = []
    for relative in scripts:
        resource = "res://" + relative
        script_code, script_output, script_timeout = run_process(
            [godot, "--headless", "--path", ".", "--check-only", "--script", resource],
            cwd=root,
            timeout=min(args.timeout, 120.0),
        )
        if script_timeout:
            print(f"[check] FAIL {resource}: timed out", file=sys.stderr)
            failures.append(relative)
        elif script_code != 0:
            print(f"[check] FAIL {resource}: exit code {script_code}", file=sys.stderr)
            _print_tail(script_output, 20)
            failures.append(relative)
        else:
            print(f"[check] ok {resource}")

    if failures:
        print(f"[check] {len(failures)} script(s) failed to parse", file=sys.stderr)
        return 1
    print(f"[check] parsed {len(scripts)} changed script(s)")
    return 0


def cmd_test(args, config: dict, root: str) -> int:
    godot = require_godot(config, root)
    # A script added with `class_name` is only visible after an import; running
    # the import first keeps `test` usable on a fresh checkout or a merge.
    import_code, _, import_timed_out = run_process([godot, "--headless", "--path", ".", "--import"], cwd=root)
    if import_timed_out:
        print("[test] import timed out", file=sys.stderr)
        return 124
    if import_code != 0:
        print(f"[test] import failed with exit code {import_code}", file=sys.stderr)
        return _clamp_exit_code(import_code)
    print(f"[test] project: {root}")
    code, _, timed_out = run_process(
        [godot, "--headless", "--path", ".", "-s", TEST_SCRIPT],
        cwd=root,
        timeout=args.timeout,
        echo=True,
    )
    if timed_out:
        print(f"[test] timed out after {args.timeout:g}s", file=sys.stderr)
        return 124
    if code == 0:
        print("[test] PASS")
    else:
        print(f"[test] FAIL (exit code {code})", file=sys.stderr)
    return _clamp_exit_code(code)


def _resolve_path(value: str, root: str) -> str:
    expanded = os.path.expanduser(value)
    if os.path.isabs(expanded):
        return os.path.abspath(expanded)
    return os.path.abspath(os.path.join(root, expanded))


def cmd_run(args, config: dict, root: str) -> int:
    godot = require_godot(config, root)
    argv = [godot, "--path", "."]
    extra = list(getattr(args, "extra", []) or [])
    if args.capture:
        out_path = _resolve_path(args.capture, root)
        parent = os.path.dirname(out_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        argv.extend(["--", f"--studio-capture={out_path}", *extra])
        print(f"[run] capture argument: --studio-capture={out_path}")
    elif extra:
        argv.extend(["--", *extra])
    if extra:
        print(f"[run] user arguments: {' '.join(extra)}")
    print("[run] launching the game window; close it to return control")
    code, _, timed_out = run_process(argv, cwd=root, echo=True)
    if timed_out:
        print("[run] the game did not exit before the timeout", file=sys.stderr)
        return 124
    print(f"[run] Godot exited with code {code}")
    return _clamp_exit_code(code)


def _file_size(path: str):
    try:
        return os.path.getsize(path)
    except OSError:
        return None


def _shutdown(process: subprocess.Popen, grace: float = 10.0) -> None:
    try:
        process.wait(timeout=grace)
        return
    except subprocess.TimeoutExpired:
        pass
    _terminate(process)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


def _log_tail(handle, limit: int = 2000) -> str:
    try:
        handle.seek(0)
        return handle.read()[-limit:]
    except (OSError, ValueError):
        return ""


def cmd_capture(args, config: dict, root: str) -> int:
    godot = require_godot(config, root)

    if args.out:
        out_path = _resolve_path(args.out, root)
    else:
        evidence_dir = config_str(config, "evidence_dir", DEFAULT_EVIDENCE_DIR)
        out_path = _resolve_path(os.path.join(evidence_dir, "latest.png"), root)

    parent = os.path.dirname(out_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    if os.path.isfile(out_path):
        try:
            os.remove(out_path)
            print(f"[capture] removed stale file: {out_path}")
        except OSError as exc:
            print(f"[capture] warning: cannot remove stale file: {exc}", file=sys.stderr)

    extra = list(getattr(args, "extra", []) or [])
    argv = [godot, "--path", ".", "--", f"--studio-capture={out_path}", *extra]
    print(f"[capture] target: {out_path}")
    if extra:
        print(f"[capture] user arguments: {' '.join(extra)}")
    print(f"[capture] waiting up to {args.timeout:g}s for the PNG")

    log = tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace")
    try:
        process = subprocess.Popen(
            argv,
            cwd=root,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        print("$ " + _format_command(argv), flush=True)

        deadline = time.monotonic() + max(args.timeout, 1.0)
        exit_code = None
        while True:
            size = _file_size(out_path)
            if size is not None and size > MIN_PNG_BYTES:
                break
            code = process.poll()
            if code is not None:
                exit_code = code
                break
            if time.monotonic() >= deadline:
                break
            time.sleep(0.25)

        size = _file_size(out_path)
        if size is not None and size > MIN_PNG_BYTES:
            _shutdown(process)
            final_size = _file_size(out_path) or size
            print(f"[capture] OK: {out_path} ({final_size} bytes)")
            return 0

        _terminate(process)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        tail = _log_tail(log)
        if size is not None and size <= MIN_PNG_BYTES:
            print(
                f"[capture] FAILED: {out_path} is only {size} byte(s); "
                f"a real capture is larger than {MIN_PNG_BYTES} bytes.",
                file=sys.stderr,
            )
            print(
                "[capture] The window may have been too small, or the capture ran "
                "before the first frame was drawn.",
                file=sys.stderr,
            )
        elif exit_code is not None:
            print(
                f"[capture] FAILED: Godot exited with code {exit_code} "
                f"before writing {out_path}.",
                file=sys.stderr,
            )
            print(
                "[capture] Check that addons/studio_capture/capture.gd is registered "
                "as the StudioCapture autoload and reads --studio-capture=<path> from "
                "OS.get_cmdline_user_args().",
                file=sys.stderr,
            )
        else:
            print(
                f"[capture] FAILED: no PNG at {out_path} after {args.timeout:g}s.",
                file=sys.stderr,
            )
            print(
                "[capture] The game may still be loading or the window never opened. "
                "Run the run command once to confirm the project starts.",
                file=sys.stderr,
            )
        if tail.strip():
            print("--- Godot output (tail) ---", file=sys.stderr)
            for line in tail.splitlines()[-20:]:
                print(line, file=sys.stderr)
        return 1
    finally:
        log.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="studio.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Godot studio helper. Reads studio.yaml (godot.path, godot.version, "
            "check_command, test_command, run_command, capture_command, "
            "evidence_dir, story_dir) and runs Godot with the project root as the "
            "working directory."
        ),
        epilog=(
            "examples:\n"
            "  python scripts/studio.py check\n"
            "  python scripts/studio.py test\n"
            "  python scripts/studio.py run\n"
            "  python scripts/studio.py run --capture production/qa/evidence/story-000/try.png\n"
            "  python scripts/studio.py capture --out production/qa/evidence/story-000/after.png\n"
            "  python scripts/studio.py --root . check\n"
            "\n"
            "exit codes: 0 success, 1 check failed, 2 configuration or Godot missing, "
            "124 timeout"
        ),
    )
    parser.add_argument(
        "--root",
        default=None,
        metavar="DIR",
        help="project root containing studio.yaml (default: nearest studio.yaml "
        "above this script, then above the current directory)",
    )

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--root",
        default=argparse.SUPPRESS,
        metavar="DIR",
        help="project root containing studio.yaml",
    )

    subparsers = parser.add_subparsers(
        title="subcommands", dest="command", metavar="{check,test,run,capture}"
    )

    check = subparsers.add_parser(
        "check",
        parents=[common],
        help="import the project headlessly and parse-check changed .gd files",
        description=(
            "Run 'godot --headless --path . --import'. Then, when git is available, "
            "parse-check each changed .gd file with --check-only --script res://<file>."
        ),
    )
    check.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_COMMAND_TIMEOUT,
        help=f"seconds allowed for each Godot run (default: {DEFAULT_COMMAND_TIMEOUT:g})",
    )
    check.add_argument(
        "--tail",
        type=int,
        default=40,
        help="output lines to print from the import run (default: 40)",
    )
    check.add_argument(
        "--no-scripts",
        action="store_true",
        help="skip the changed-script parse checks",
    )
    check.set_defaults(func=cmd_check)

    test = subparsers.add_parser(
        "test",
        parents=[common],
        help="run res://tests/run_tests.gd headlessly",
        description="Run 'godot --headless --path . -s res://tests/run_tests.gd' and pass through its exit code.",
    )
    test.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_COMMAND_TIMEOUT,
        help=f"seconds allowed for the test run (default: {DEFAULT_COMMAND_TIMEOUT:g})",
    )
    test.set_defaults(func=cmd_test)

    run = subparsers.add_parser(
        "run",
        parents=[common],
        help="launch the game window and wait for it to exit",
        description=(
            "Run 'godot --path .'. With --capture PATH the capture argument is passed "
            "as a user argument after --, so the StudioCapture autoload writes that PNG."
        ),
    )
    run.add_argument(
        "--capture",
        default=None,
        metavar="PATH",
        help="write one screenshot to PATH (relative paths resolve against the project root)",
    )
    run.add_argument(
        "extra",
        nargs="*",
        metavar="ARG",
        help="user arguments for the game, placed after the engine's --",
    )
    run.set_defaults(func=cmd_run)

    capture = subparsers.add_parser(
        "capture",
        parents=[common],
        help="launch the game, save one screenshot, verify it, and exit",
        description=(
            "Launch Godot with -- --studio-capture=<absolute path>, wait up to 60s for "
            "the PNG, and require it to be larger than 1024 bytes. The default target is "
            "<evidence_dir>/latest.png."
        ),
    )
    capture.add_argument(
        "--out",
        default=None,
        metavar="PATH",
        help=f"screenshot path (default: <evidence_dir>/latest.png, evidence_dir defaults to {DEFAULT_EVIDENCE_DIR})",
    )
    capture.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_CAPTURE_TIMEOUT,
        help=f"seconds to wait for the PNG (default: {DEFAULT_CAPTURE_TIMEOUT:g})",
    )
    capture.add_argument(
        "extra",
        nargs="*",
        metavar="ARG",
        help="user arguments for the game, placed after --studio-capture (for example --level=3)",
    )
    capture.set_defaults(func=cmd_capture)

    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        parser.print_help()
        return 0
    try:
        root = locate_root(args.root)
        config = load_config(root)
        return args.func(args, config, root)
    except StudioError as exc:
        print(str(exc), file=sys.stderr)
        return exc.code
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
