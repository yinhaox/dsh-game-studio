extends RefCounted

## Empty suite template. Copy this file under a new name to add checks.
##
## How it is loaded: tests/run_tests.gd scans res://tests/suites/*.gd on every
## run, calls this script's `static func run(t)` and passes the runner as `t`.
## Report each result with `t.check(condition, message)`; the runner counts it
## and sets the exit code. No runner change is needed for a new suite file.

static func run(t) -> void:
	pass
