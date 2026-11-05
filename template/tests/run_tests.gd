extends SceneTree

## Headless regression runner for the Game Studio template project.
##
## Run with:
##   godot --headless --path . -s res://tests/run_tests.gd
##
## Discovers every script in res://tests/suites/*.gd, calls its
## `static func run(t)` and passes this runner as `t`, so a suite reports a
## result with `t.check(condition, message)`. Add a suite by dropping a file in
## tests/suites/; this runner never changes.

const SUITES_DIR := "res://tests/suites"

var _passed := 0
var _failed := 0


func _init() -> void:
	_run_all.call_deferred()


func _run_all() -> void:
	var paths := _discover_suites()
	if paths.is_empty():
		printerr("FAIL: no suites found in %s" % SUITES_DIR)
		quit(1)
		return
	for path in paths:
		_run_suite(path)
	if _failed == 0:
		print("PASS: %d checks passed" % _passed)
		quit(0)
		return
	printerr("FAIL: %d of %d checks failed" % [_failed, _passed + _failed])
	quit(1)


func check(condition: bool, message: String) -> void:
	if condition:
		_passed += 1
		print("PASS: %s" % message)
	else:
		_failed += 1
		printerr("FAIL: %s" % message)


func _discover_suites() -> PackedStringArray:
	var paths := PackedStringArray()
	var directory := DirAccess.open(SUITES_DIR)
	if directory == null:
		return paths
	for name in directory.get_files():
		if name.ends_with(".gd"):
			paths.append(SUITES_DIR.path_join(name))
	paths.sort()
	return paths


func _run_suite(path: String) -> void:
	var script := load(path) as Script
	if script == null:
		printerr("FAIL: cannot load suite %s" % path)
		_failed += 1
		return
	print("SUITE: %s" % path)
	var instance = script.new()
	if instance == null or not instance.has_method("run"):
		printerr("FAIL: suite %s has no run(t)" % path)
		_failed += 1
		return
	instance.run(self)
	instance.free()
