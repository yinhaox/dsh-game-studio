---
paths:
  - assets/data/**/*.json
  - resources/**/*.tres
---

# Data rules

Applies to every `.json` file under `assets/data/` and every `.tres` file under `resources/`.

- JSON must parse: no comments, no trailing commas, UTF-8 without BOM. Run `python -c "import json; json.load(open('<file>'))"` before committing.
- All keys are snake_case (`move_speed`, `max_health`); ids are lowercase (`kebab-case` or `snake_case`) and never change once referenced by code or other data.
- No duplicate ids inside a file or across files of the same type; the loader rejects duplicates instead of silently overwriting.
- Every number states its unit in the key or a documented convention (`duration_seconds`, `distance_pixels`, `damage_flat`, ratios in `0..1`); no bare `speed` or `time`.
- The shape is documented next to the file: `<name>.schema.md` (or `resources/<name>.md`) lists every key with type, unit, and allowed range, updated in the same change as the data.
- `.tres` files are data containers: no scripts, no scene references, no absolute paths; reference other resources by `res://` path.
- Store values in canonical units (seconds, pixels, 0..1 ratios) and convert only at the edge that displays them.
- Keep files human-diffable: stable key order, one record per line for record arrays, no generated timestamps.
