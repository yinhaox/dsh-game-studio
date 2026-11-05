"""Unit tests for the path handling in ``template/scripts/studio.py``.

Evidence logs are committed, so the helper must never print a machine path: a
checkout that sits under the operator's home directory would otherwise record
the account name, and a log is a file someone reads and greps later.

The script is imported by path because its filename is not a Python module name.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
STUDIO_SCRIPT = REPO_ROOT / "template" / "scripts" / "studio.py"

DRIVE_LETTER = tuple(f"{letter}:\\" for letter in "CDEFGHIJ")


def load_studio_module() -> Any:
    spec = importlib.util.spec_from_file_location("studio_template", STUDIO_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {STUDIO_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


studio = load_studio_module()


class ProjectRelativeTest(unittest.TestCase):
    def test_a_path_inside_the_project_becomes_relative(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            inside = os.path.join(root, "production", "qa", "evidence", "shot.png")
            self.assertEqual(studio._project_relative(inside, root), "production/qa/evidence/shot.png")

    def test_separators_are_forward_slashes(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            inside = os.path.join(root, "production", "shot.png")
            self.assertNotIn("\\", studio._project_relative(inside, root))

    def test_a_sibling_directory_is_outside_the_project(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            sibling = os.path.join(os.path.dirname(root), "elsewhere", "shot.png")
            self.assertIsNone(studio._project_relative(sibling, root))

    def test_the_project_root_itself_is_dot(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(studio._project_relative(root, root), ".")


class DisplayPathTest(unittest.TestCase):
    def test_an_inside_path_is_displayed_relative(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            inside = os.path.join(root, "production", "qa", "evidence", "shot.png")
            self.assertEqual(studio._display_path(inside, root), "production/qa/evidence/shot.png")


class ProjectArgumentTest(unittest.TestCase):
    def test_an_inside_path_is_handed_to_godot_relative(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            inside = os.path.join(root, "production", "qa", "evidence", "shot.png")
            argument = studio._project_argument(inside, root, "capture")
            self.assertEqual(argument, "production/qa/evidence/shot.png")

    def test_an_outside_path_is_refused_without_echoing_it(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            outside = os.path.join(os.path.dirname(root), "elsewhere", "shot.png")
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                argument = studio._project_argument(outside, root, "capture")
            self.assertIsNone(argument)
            message = stderr.getvalue()
            self.assertIn("inside the project", message)
            self.assertFalse(
                any(drive in message for drive in DRIVE_LETTER),
                f"the refusal echoed a machine path: {message!r}",
            )


class FormatCommandTest(unittest.TestCase):
    def test_the_engine_path_never_reaches_the_log(self) -> None:
        engine = os.path.join(os.path.dirname(os.path.abspath(__file__)), "godot-engine")
        line = studio._format_command(
            [engine, "--path", ".", "--", "--studio-capture=production/qa/evidence/shot.png"]
        )
        self.assertTrue(line.startswith("godot "), line)
        self.assertNotIn(engine, line)


if __name__ == "__main__":
    unittest.main()
