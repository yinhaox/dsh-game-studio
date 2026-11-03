extends SceneTree

## Headless regression checks for the Game Studio template project.
##
## Run with:
##   godot --headless --path . -s res://tests/run_tests.gd
##
## Prints one PASS line per successful check and exits 0 only when every
## check passes; any failure exits 1.

const MAIN_SCRIPT = preload("res://src/main.gd")
const MAIN_SCENE_PATH = "res://scenes/main.tscn"
const CAPTURE_SCRIPT_PATH = "res://addons/studio_capture/capture.gd"

var _passed := 0
var _failed := 0


func _init() -> void:
	_test_main_helpers()
	_test_main_scene()
	_test_project_settings()

	if _failed == 0:
		print("PASS: %d checks passed" % _passed)
		quit(0)
		return

	printerr("FAIL: %d of %d checks failed" % [_failed, _passed + _failed])
	quit(1)


func _check(condition: bool, label: String) -> void:
	if condition:
		_passed += 1
		print("PASS: %s" % label)
	else:
		_failed += 1
		printerr("FAIL: %s" % label)


func _test_main_helpers() -> void:
	_check(MAIN_SCRIPT.title_text() == "Game Studio", "main.title_text() returns the studio title")
	_check(MAIN_SCRIPT.status_text(0) == "Game Studio (0 frames)", "main.status_text(0) formats zero frames")
	_check(MAIN_SCRIPT.status_text(7) == "Game Studio (7 frames)", "main.status_text(7) formats seven frames")
	_check(MAIN_SCRIPT.status_text(-3) == "Game Studio (0 frames)", "main.status_text() clamps negative frames")


func _test_main_scene() -> void:
	_check(ResourceLoader.exists(MAIN_SCENE_PATH), "scenes/main.tscn exists")

	var packed := load(MAIN_SCENE_PATH) as PackedScene
	if packed == null:
		_check(false, "scenes/main.tscn loads as a PackedScene")
		return
	_check(true, "scenes/main.tscn loads as a PackedScene")

	var root := packed.instantiate()
	if root == null:
		_check(false, "scenes/main.tscn instantiates")
		return
	_check(root is Node2D, "main scene root is a Node2D")
	_check(str(root.name) == "Main", "main scene root is named Main")

	var attached := root.get_script() as Script
	_check(attached != null and attached.resource_path == "res://src/main.gd", "main scene root runs src/main.gd")

	var label := root.get_node_or_null("Title") as Label
	_check(label != null, "main scene has a Title label")
	if label != null:
		_check(label.text == "Game Studio", "Title label reads Game Studio")
	root.free()


func _test_project_settings() -> void:
	_check(ProjectSettings.get_setting("application/config/name", "") == "Game Studio", "project name is Game Studio")
	_check(ProjectSettings.get_setting("application/run/main_scene", "") == MAIN_SCENE_PATH, "main scene is registered in project.godot")
	_check(ProjectSettings.get_setting("autoload/StudioCapture", "") == "*" + CAPTURE_SCRIPT_PATH, "StudioCapture autoload points at the capture addon")
	_check(int(ProjectSettings.get_setting("display/window/size/viewport_width", 0)) == 1152, "viewport width is 1152")
	_check(int(ProjectSettings.get_setting("display/window/size/viewport_height", 0)) == 648, "viewport height is 648")
