extends Node

## Screenshot autoload for the Game Studio template.
##
## Usage:
##   godot --path . -- --studio-capture=<path>
##
## The flag is read from OS.get_cmdline_user_args(), i.e. the arguments after
## the engine's own ones. Without the flag the autoload stays inert.

const CAPTURE_FLAG = "--studio-capture="

## How long to wait after the first frames before grabbing the viewport.
const SETTLE_SECONDS = 0.2


func _ready() -> void:
	var path := _capture_path()
	if path.is_empty():
		return

	# Give the renderer two full frames plus a short pause so that fonts and
	# the first draw pass are on screen before the texture is read.
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(SETTLE_SECONDS).timeout

	var image := get_viewport().get_texture().get_image()
	if image == null:
		printerr("studio_capture: viewport texture has no image")
		get_tree().quit(1)
		return

	var error := image.save_png(path)
	if error != OK:
		printerr("studio_capture: could not save PNG to '%s' (error %d)" % [path, error])
		get_tree().quit(1)
		return

	print("studio_capture: wrote %s" % path)
	get_tree().quit(0)


## Returns the value after --studio-capture=, or an empty string when absent.
func _capture_path() -> String:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with(CAPTURE_FLAG):
			return argument.substr(CAPTURE_FLAG.length())
	return ""
