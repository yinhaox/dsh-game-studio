extends Node2D

## Boot scene for the Game Studio template.
##
## Keeps no gameplay state: it only shows the studio title so that a fresh
## clone can run, and so that `capture_command` has something to screenshot.

## Text rendered by the Title label in scenes/main.tscn.
## The project name is the only source of the title, so a renamed game stays correct.
static func title_text() -> String:
	return str(ProjectSettings.get_setting("application/config/name", "Game Studio"))


## Title text, exposed as a static helper so headless tests can check it
## without instantiating the scene.


## Status line shown under the title. Negative frame counts are clamped to 0.
static func status_text(frames: int) -> String:
	return "%s (%d frames)" % [title_text(), maxi(frames, 0)]


func _ready() -> void:
	var label := get_node_or_null("Title") as Label
	if label != null:
		label.text = title_text()
