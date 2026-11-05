extends RefCounted

## Core regression checks for this project.
##
## tests/run_tests.gd discovers every res://tests/suites/*.gd script, calls its
## `static func run(t)` and passes the runner as `t`. Report each result with
## `t.check(condition, message)`.

const MAIN_SCRIPT = preload("res://src/main.gd")
const MAIN_SCENE_PATH = "res://scenes/main.tscn"
const CAPTURE_SCRIPT_PATH = "res://addons/studio_capture/capture.gd"


static func _project_name() -> String:
	return str(ProjectSettings.get_setting("application/config/name", ""))


static func run(t) -> void:
	_test_main_helpers(t)
	_test_main_scene(t)
	_test_project_settings(t)


static func _test_main_helpers(t) -> void:
	t.check(MAIN_SCRIPT.title_text() == _project_name(), "main.title_text() returns the project name")
	t.check(MAIN_SCRIPT.status_text(0) == "%s (0 frames)" % _project_name(), "main.status_text(0) formats zero frames")
	t.check(MAIN_SCRIPT.status_text(7) == "%s (7 frames)" % _project_name(), "main.status_text(7) formats seven frames")
	t.check(MAIN_SCRIPT.status_text(-3) == "%s (0 frames)" % _project_name(), "main.status_text() clamps negative frames")


static func _test_main_scene(t) -> void:
	t.check(ResourceLoader.exists(MAIN_SCENE_PATH), "scenes/main.tscn exists")

	var packed := load(MAIN_SCENE_PATH) as PackedScene
	if packed == null:
		t.check(false, "scenes/main.tscn loads as a PackedScene")
		return
	t.check(true, "scenes/main.tscn loads as a PackedScene")

	var root := packed.instantiate()
	if root == null:
		t.check(false, "scenes/main.tscn instantiates")
		return
	t.check(root is Node2D, "main scene root is a Node2D")
	t.check(str(root.name) == "Main", "main scene root is named Main")

	var attached := root.get_script() as Script
	t.check(attached != null and attached.resource_path == "res://src/main.gd", "main scene root runs src/main.gd")

	var label := root.get_node_or_null("Title") as Label
	t.check(label != null, "main scene has a Title label")
	if label != null:
		t.check(label.text == _project_name(), "Title label reads the project name")
	root.free()


static func _test_project_settings(t) -> void:
	t.check(not _project_name().is_empty(), "project name is set")
	t.check(ProjectSettings.get_setting("application/run/main_scene", "") == MAIN_SCENE_PATH, "main scene is registered in project.godot")
	t.check(ProjectSettings.get_setting("autoload/StudioCapture", "") == "*" + CAPTURE_SCRIPT_PATH, "StudioCapture autoload points at the capture addon")
	t.check(int(ProjectSettings.get_setting("display/window/size/viewport_width", 0)) == 1152, "viewport width is 1152")
	t.check(int(ProjectSettings.get_setting("display/window/size/viewport_height", 0)) == 648, "viewport height is 648")
