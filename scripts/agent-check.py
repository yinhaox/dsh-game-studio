#!/usr/bin/env python3
"""Verify the agent GitHub account and its CLI wrapper before a superagent deployment.

Checks, in order:

1. the CLI runs and prints a version;
2. it is authenticated, and as which account;
3. it can read the target repository, and with which permission;
4. it can read the account's notifications (superagent's GitHub Source depends on them).

The CLI is usually a wrapper such as ``gh-agent`` that sets ``GH_CONFIG_DIR`` so
the process acts as the agent account, not as the person running it. Nothing is
written and no prompt is answered; every check is read-only.

Exit codes: 0 all checks passed, 1 a check failed, 2 bad arguments.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys


def run(cli: str, args: list[str]) -> tuple[int, str, str]:
    """Run one read-only CLI command and return its exit code, stdout and stderr."""
    try:
        result = subprocess.run(
            [cli, *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            check=False,
        )
    except FileNotFoundError:
        return 127, "", f"command not found: {cli}"
    except (OSError, subprocess.SubprocessError) as error:
        return 1, "", str(error)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def check(name: str, cli: str, args: list[str], expect_json: bool = False) -> tuple[bool, str]:
    code, out, err = run(cli, args)
    if code != 0:
        detail = err or out or f"exit code {code}"
        return False, f"{name}: FAIL - {detail.splitlines()[0] if detail else 'no output'}"
    if expect_json:
        try:
            data = json.loads(out)
        except json.JSONDecodeError:
            return False, f"{name}: FAIL - output is not JSON: {out[:120]}"
        if name == "repository":
            permission = str(data.get("viewerPermission", "?"))
            branch = str((data.get("defaultBranchRef") or {}).get("name", "?"))
            return True, f"{name}: {args[2]} ({permission}, default branch {branch})"
    return True, f"{name}: {out.splitlines()[0] if out else 'ok'}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agent-check.py",
        description=(
            "Check that an agent GitHub CLI wrapper is authenticated as the agent, can read "
            "the game repository, and can read notifications. Read-only; writes nothing."
        ),
        epilog=(
            "examples:\n"
            '  python scripts/agent-check.py --cli <path-to-gh-agent> --repo <owner>/<name>\n'
            '  python scripts/agent-check.py --repo <owner>/<name>\n'
            "\n"
            "exit codes: 0 all checks passed, 1 a check failed, 2 bad arguments"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--cli", default="gh", metavar="PATH", help="the agent's gh wrapper (default: gh)")
    parser.add_argument("--repo", required=True, metavar="OWNER/NAME", help="the game repository the agent will work in")
    args = parser.parse_args(argv)

    if "/" not in args.repo or args.repo.startswith("/") or args.repo.endswith("/"):
        parser.error("--repo must be OWNER/NAME")

    results: list[tuple[bool, str]] = []
    results.append(check("cli", args.cli, ["--version"]))
    results.append(check("login", args.cli, ["api", "user", "--jq", ".login"]))
    results.append(check("repository", args.cli, ["repo", "view", args.repo, "--json", "name,viewerPermission,defaultBranchRef"], expect_json=True))
    results.append(check("notifications", args.cli, ["api", "notifications?per_page=1"]))

    for ok, line in results:
        print(("PASS  " if ok else "FAIL  ") + line)
    failed = sum(1 for ok, _ in results if not ok)
    print()
    if failed == 0:
        print("All checks passed. Use this CLI path in the GitHub Source settings.")
        return 0
    print(f"{failed} check(s) failed. Fix them before starting superagent.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
