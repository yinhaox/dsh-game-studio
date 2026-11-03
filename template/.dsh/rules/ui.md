---
paths:
  - scenes/ui/**/*.tscn
  - scripts/ui/**/*.gd
---

# UI rules

Applies to every `.tscn` and `.gd` file under `scenes/ui/` and `scripts/ui/`.

- UI owns no game state: it reads a model/resource or receives signals, and never mutates gameplay state itself.
- Layout is driven by containers and anchors (`VBoxContainer`, `HBoxContainer`, `MarginContainer`, `GridContainer`, `Control` anchors); no absolute `position` or `size` for children of a container.
- Every user-visible string is externalized for localization (translation key, `tr()`, or a text resource); no inline strings in the scene or the script.
- Keyboard and controller navigation are required: every interactive control sets `focus_mode`, defines `focus_neighbor_*` order, and shows a visible focus state.
- Interactive targets are at least 44x44 px (`custom_minimum_size = Vector2(44, 44)`).
- Colors, font sizes, and spacing come from the `Theme` or theme constants; no per-node style overrides.
- Connect signals in `_ready()` or in the scene, and disconnect on exit; do not poll in `_process` for state that has a signal.
- Text wraps (`autowrap_mode`) instead of assuming a fixed width; verify at the project default 1152x648.
- UI scripts never instantiate gameplay scenes or call gameplay methods that change state; they emit intent signals.
