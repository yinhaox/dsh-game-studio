---
paths:
  - scripts/**/*.gd
  - src/**/*.gd
---

# GDScript rules

Applies to every `.gd` file under `scripts/` and `src/`. These are hard rules; a review may reject a change that breaks one.

- Typed variables everywhere: annotate every variable, parameter, and return value (`var speed: float`, `func run(delta: float) -> void`). No untyped class-level state.
- No magic numbers or magic strings outside exported configuration: use `@export`, a named `const`, or data from `resources/` or `assets/data/*.json`.
- Every frame-rate-dependent update multiplies by `delta`; pass `delta` in as a parameter instead of reading it inside helpers.
- Gameplay code never touches UI nodes directly: emit a signal or write to a model/resource, and let `scenes/ui/**` read it.
- Load gameplay data from resources or JSON with one loader function per data type; never inline tables of content in a script.
- Keep functions under 40 lines and one screen of indentation; split instead of nesting deeper than 3 levels.
- Free every node you `new()` and add to the tree; no orphan instances left after a scene change.
- No `print()` in committed code; use `push_warning` / `push_error` for diagnosable failures.
- Physics runs in `_physics_process`; do not `await` frame signals from physics or movement code.
