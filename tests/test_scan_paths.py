"""Unit tests for ``template/scripts/scan-paths.py``.

The scanner reads authored files strictly and captured evidence leniently: a
synthetic drive letter in a record of an invalid-path test is fine, the
operator's home directory or host name is not, anywhere.

The script is imported by path because its filename is not a Python module name.
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
SCAN_SCRIPT = REPO_ROOT / "template" / "scripts" / "scan-paths.py"

AUTHORED = "src/main.gd"
EVIDENCE = "production/qa/evidence/story/run.log"


def load_scan_module() -> Any:
    spec = importlib.util.spec_from_file_location("studio_scan_paths", SCAN_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCAN_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


scan = load_scan_module()


class AuthoredFileTest(unittest.TestCase):
    def test_a_drive_letter_is_refused(self) -> None:
        self.assertIsNotNone(scan.finding_in(AUTHORED, 'var path = "C:/Tools/Godot/godot.exe"\n'))

    def test_a_synthetic_drive_letter_is_refused(self) -> None:
        self.assertIsNotNone(scan.finding_in(AUTHORED, "# see Z:/no/such/directory\n"))

    def test_a_home_path_is_refused(self) -> None:
        self.assertIsNotNone(scan.finding_in(AUTHORED, "path = /home/me/src/widgets\n"))

    def test_a_project_relative_path_is_allowed(self) -> None:
        self.assertIsNone(scan.finding_in(AUTHORED, "path = production/qa/evidence/story/x.png\n"))


class EvidenceFileTest(unittest.TestCase):
    def test_a_synthetic_drive_letter_is_allowed(self) -> None:
        text = "[run] user arguments: --fps-log=Z:/no/such/directory/fps.log\n"
        self.assertIsNone(scan.finding_in(EVIDENCE, text))

    def test_the_operator_home_directory_is_refused(self) -> None:
        text = "$ godot --path . -- --studio-capture=C:\\Users\\someone\\.dsh\\state\\work\\run.png\n"
        self.assertIsNotNone(scan.finding_in(EVIDENCE, text))

    def test_the_operator_home_directory_with_forward_slashes_is_refused(self) -> None:
        self.assertIsNotNone(scan.finding_in(EVIDENCE, "--out=C:/Users/someone/shot.png\n"))

    def test_a_posix_home_path_is_refused(self) -> None:
        self.assertIsNotNone(scan.finding_in(EVIDENCE, "$ godot -s /home/someone/x.gd\n"))

    def test_a_desktop_host_name_is_refused(self) -> None:
        self.assertIsNotNone(scan.finding_in(EVIDENCE, "2026-08-16 03.09.12 DESKTOP-L9DE2JG B97579 Crash\n"))

    def test_the_home_placeholder_is_allowed(self) -> None:
        self.assertIsNone(scan.finding_in(EVIDENCE, "[check] project: <home>/.dsh/state/superagent/work\n"))


class PatternSelectionTest(unittest.TestCase):
    def test_evidence_paths_get_the_identity_rules(self) -> None:
        self.assertIs(scan.patterns_for(EVIDENCE), scan.MACHINE_PATTERNS)

    def test_a_backslash_separator_still_marks_evidence(self) -> None:
        self.assertIs(scan.patterns_for("production\\qa\\evidence\\story\\run.log"), scan.MACHINE_PATTERNS)

    def test_authored_paths_get_the_full_rules(self) -> None:
        self.assertIs(scan.patterns_for(AUTHORED), scan.PATTERNS)


if __name__ == "__main__":
    unittest.main()
