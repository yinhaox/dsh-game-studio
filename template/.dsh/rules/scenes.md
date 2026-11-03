---
paths:
  - scenes/**/*.tscn
  - scenes/**/*.tres
---

# Scene rules

Applies to every `.tscn` and `.tres` file under `scenes/`.

- Node paths are the public interface: renaming or reparenting a node that scripts reach with `$Path` or `get_node()` requires updating every caller in the same change.
- Root node name matches the file name in PascalCase (`Player.tscn` -> `Player`); do not rename the root without renaming the file.
- Do not hand-edit `uid://` values or the `[gd_scene]` / `[gd_resource]` header. Touch them only when a load error forces it, and say so in the PR.
- Connect signals explicitly, either in the scene's `[connection]` blocks or in `_ready()` of the scene's own script; no cross-scene implicit connections.
- Keep scenes small: one responsibility, roughly under 150 nodes. Extract repeated subtrees into their own scene and instance them.
- Scenes carry wiring only (node references, connections, exported defaults); gameplay logic lives in scripts.
- Per-instance placement and tuning come from exported values or data, not from duplicated inline overrides.
- `.tres` files hold data only: no scripts, no scene-node references, no absolute paths, and `duplicate()` a resource before mutating it at runtime.
- Never reference another scene's internal nodes; communicate through signals, callbacks, or an autoload.
