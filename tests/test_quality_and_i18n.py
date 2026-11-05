"""Unit tests for ``template/scripts/quality-check.py`` and ``i18n-check.py``.

The quality scan separates a translatable literal from a format-only one, and the
translation scan reads both ``tr()`` and the project's ``Localization.text()``.

Both scripts are imported by path because their filenames are not module names.
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_SCRIPTS = REPO_ROOT / "template" / "scripts"

UI_SCRIPT = "src/ui/settings.gd"
UI_SCENE = "scenes/ui/menu.tscn"
GAME_SCRIPT = "src/game/hud.gd"


def load(name: str, filename: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, TEMPLATE_SCRIPTS / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


quality = load("studio_quality_check", "quality-check.py")
i18n = load("studio_i18n_check", "i18n-check.py")


class PlaceholderTest(unittest.TestCase):
    def test_a_todo_is_refused(self) -> None:
        self.assertTrue(quality.findings_in(GAME_SCRIPT, "# TODO: tune this\n"))

    def test_the_word_placeholder_is_refused(self) -> None:
        self.assertTrue(quality.findings_in(GAME_SCRIPT, "## a placeholder tower\n"))

    def test_clean_source_passes(self) -> None:
        self.assertEqual(quality.findings_in(GAME_SCRIPT, "func step() -> void:\n\tpass\n"), [])


class LiteralUiTextTest(unittest.TestCase):
    def test_words_assigned_to_text_are_refused(self) -> None:
        findings = quality.findings_in(UI_SCRIPT, '\tlabel.text = "Score: %d" % score\n')
        self.assertEqual(len(findings), 1)
        self.assertIn("use the translation table", findings[0])

    def test_a_format_only_literal_is_allowed(self) -> None:
        findings = quality.findings_in(UI_SCRIPT, '\tvalue.text = "%d" % roundi(slider.value)\n')
        self.assertEqual(findings, [])

    def test_a_translated_assignment_is_allowed(self) -> None:
        findings = quality.findings_in(UI_SCRIPT, '\tlabel.text = localization.text("menu.play")\n')
        self.assertEqual(findings, [])

    def test_non_ui_scripts_are_not_scanned_for_literals(self) -> None:
        findings = quality.findings_in(GAME_SCRIPT, '\tvar label := "Score: %d"\n')
        self.assertEqual(findings, [])

    def test_scene_text_is_refused(self) -> None:
        findings = quality.findings_in(UI_SCENE, 'text = "Play"\n')
        self.assertEqual(len(findings), 1)


class TranslationKeyScanTest(unittest.TestCase):
    def test_tr_keys_are_collected(self) -> None:
        self.assertEqual(i18n.TR.findall('tr("menu.play")'), ["menu.play"])

    def test_text_keys_are_collected(self) -> None:
        self.assertEqual(i18n.TR.findall('localization.text("settings.back")'), ["settings.back"])

    def test_other_calls_are_ignored(self) -> None:
        self.assertEqual(i18n.TR.findall('_set_text("not.a.key")\nsubstr(2)'), [])


if __name__ == "__main__":
    unittest.main()
