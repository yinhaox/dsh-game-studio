"""Unit tests for ``scripts/check.py``.

The validator is imported by path because its filename is not a Python module
name. Unit tests use small temporary fixtures only; one integration test runs
the real script against the repository root once the content layer is present.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
CHECK_SCRIPT = REPO_ROOT / "scripts" / "check.py"


def load_check_module() -> Any:
    spec = importlib.util.spec_from_file_location("studio_check", CHECK_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {CHECK_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


check = load_check_module()


def valid_policy() -> dict[str, Any]:
    return {
        "rules": [
            {
                "id": rule_id,
                "name": rule_id.replace("-", " ").title(),
                "enabled": True,
                "instruction": f"Instruction for {rule_id}.",
            }
            for rule_id in check.RULE_IDS
        ],
        "eval": {"mode": "observe", "timeoutSeconds": 120, "model": None},
    }


class KebabCaseTest(unittest.TestCase):
    def test_accepts_kebab_case(self) -> None:
        for value in ("studio-story", "design-doc", "a", "a1-b2", "guard-facts"):
            with self.subTest(value=value):
                self.assertTrue(check.is_kebab_case(value))

    def test_rejects_non_kebab_case(self) -> None:
        for value in ("", "Studio", "studio_story", "studio--story", "-studio", "studio-", "studio story", "café"):
            with self.subTest(value=value):
                self.assertFalse(check.is_kebab_case(value))


class FrontmatterTest(unittest.TestCase):
    SAMPLE = (
        "---\n"
        "name: studio-story\n"
        "description: \"Load when: a story needs work\"\n"
        "enabled: true\n"
        "paths:\n"
        "  - scripts/**/*.gd\n"
        "  - src/**/*.gd\n"
        "---\n"
        "\n"
        "# Body\n"
    )

    def test_parses_scalars_list_and_body(self) -> None:
        data, body = check.parse_frontmatter(self.SAMPLE)
        self.assertEqual(data["name"], "studio-story")
        self.assertEqual(data["description"], "Load when: a story needs work")
        self.assertEqual(data["enabled"], "true")
        self.assertEqual(data["paths"], ["scripts/**/*.gd", "src/**/*.gd"])
        self.assertEqual(body.strip(), "# Body")

    def test_without_frontmatter_returns_same_text(self) -> None:
        data, body = check.parse_frontmatter("# No frontmatter\n")
        self.assertEqual(data, {})
        self.assertEqual(body, "# No frontmatter\n")

    def test_unclosed_frontmatter_is_treated_as_body(self) -> None:
        text = "---\nname: broken\n"
        data, body = check.parse_frontmatter(text)
        self.assertEqual(data, {})
        self.assertEqual(body, text)


class GlobFrontmatterTest(unittest.TestCase):
    SAMPLE = "---\npaths:\n  - scenes/**/*.tscn\n  - scenes/**/*.tres\n---\n\n# Scene rules\n"

    def test_returns_glob_list(self) -> None:
        self.assertEqual(
            check.parse_paths_frontmatter(self.SAMPLE),
            ["scenes/**/*.tscn", "scenes/**/*.tres"],
        )

    def test_missing_paths_returns_empty_list(self) -> None:
        self.assertEqual(check.parse_paths_frontmatter("---\nname: x\n---\n"), [])

    def test_scalar_paths_is_not_a_list(self) -> None:
        self.assertEqual(check.parse_paths_frontmatter("---\npaths: scenes/**/*.tscn\n---\n"), [])


class PolicyValidationTest(unittest.TestCase):
    def test_valid_policy_has_no_problems(self) -> None:
        self.assertEqual(check.validate_policy(valid_policy()), [])

    def test_temp_fixture_passes_the_policy_check(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "seed").mkdir()
            (root / "seed" / "policy.json").write_text(
                json.dumps(valid_policy()), encoding="utf-8"
            )
            report = check.Report()
            check.check_policy(root, report)
            self.assertEqual(report.failures, [])
            self.assertEqual(report.exit_code, 0)

    def test_wrong_rule_count(self) -> None:
        policy = valid_policy()
        policy["rules"] = policy["rules"][:-1]
        problems = check.validate_policy(policy)
        self.assertTrue(any("expected 7 rules" in problem for problem in problems), problems)

    def test_duplicate_rule_id(self) -> None:
        policy = valid_policy()
        policy["rules"][-1]["id"] = policy["rules"][0]["id"]
        problems = check.validate_policy(policy)
        self.assertTrue(any("duplicate rule ids" in problem for problem in problems), problems)
        self.assertTrue(any("missing rule ids" in problem for problem in problems), problems)

    def test_enabled_must_be_boolean(self) -> None:
        policy = valid_policy()
        policy["rules"][0]["enabled"] = "true"
        problems = check.validate_policy(policy)
        self.assertTrue(any("enabled must be a boolean" in problem for problem in problems), problems)

    def test_instruction_must_be_non_empty(self) -> None:
        policy = valid_policy()
        policy["rules"][0]["instruction"] = "   "
        problems = check.validate_policy(policy)
        self.assertTrue(any("instruction must be a non-empty string" in problem for problem in problems), problems)

    def test_instruction_length_limit(self) -> None:
        policy = valid_policy()
        policy["rules"][0]["instruction"] = "x" * 2001
        problems = check.validate_policy(policy)
        self.assertTrue(any("maximum 2000" in problem for problem in problems), problems)

    def test_instruction_at_limit_is_allowed(self) -> None:
        policy = valid_policy()
        policy["rules"][0]["instruction"] = "x" * 2000
        self.assertEqual(check.validate_policy(policy), [])

    def test_eval_must_be_an_object(self) -> None:
        policy = valid_policy()
        policy.pop("eval")
        problems = check.validate_policy(policy)
        self.assertTrue(any("eval must be an object" in problem for problem in problems), problems)


class MissingFileTest(unittest.TestCase):
    def test_empty_root_fails_instead_of_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            report = check.validate(Path(temporary))
        self.assertEqual(report.exit_code, 1)
        self.assertTrue(any("seed/policy.json" in failure for failure in report.failures), report.failures)
        self.assertTrue(any("template" in failure for failure in report.failures), report.failures)
        self.assertIn("FAIL ", report.render())

    def test_missing_skill_file_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            skills = root / "template" / ".dsh" / "skills"
            skills.mkdir(parents=True)
            for name in check.SKILL_NAMES:
                (skills / name).mkdir()
            report = check.Report()
            check.check_skills(root, report)
        self.assertTrue(any("SKILL.md is missing" in failure for failure in report.failures), report.failures)


def content_layer_complete() -> bool:
    """True when other agents' content files the integration test depends on exist."""
    docs = REPO_ROOT / "docs"
    if not docs.is_dir():
        return False
    for number in check.DOC_NUMBERS:
        if not any(entry.is_file() and entry.suffix == ".md" and entry.name.startswith(number) for entry in docs.iterdir()):
            return False
    return (REPO_ROOT / "setup" / "studio-setup.md").is_file()


class RealRootIntegrationTest(unittest.TestCase):
    @unittest.skipUnless(
        content_layer_complete(),
        "content layer (docs/000-005 and setup/studio-setup.md) is not complete in this checkout",
    )
    def test_check_script_exits_zero_on_real_root(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(CHECK_SCRIPT)],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        self.assertEqual(
            completed.returncode,
            0,
            msg=f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}",
        )
        self.assertIn("PASS ", completed.stdout)


if __name__ == "__main__":
    unittest.main()
