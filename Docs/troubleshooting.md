# Troubleshooting

> Part of the [Anim documentation](../README.md#documentation).

| Symptom | Cause | Fix |
| - | - | - |
| `visual.mp4` not found | Ran `node Engine/record.js` directly | Run an `anim_*.js` script instead |
| FFmpeg not found | Path mismatch | Set the `FFMPEG_PATH` environment variable, or update the default in `Engine/utils.js` |
| Missing audio in output | `addSounds()` commented out | Uncomment `addSounds()` to enable it |
| Audio out of sync | Audio `start` depends on the time cursor (includes all `_.wait()` calls) | Check that `_.wait()` calls before `_.playSound()` match the intended timing |
| Text not wrapping | `maxWidth` is `Infinity` by default | Set `_.setProp({maxWidth: 960})` before `_.newText()` |
| Bold not rendering | `boldSymbol` is `null` by default | Set `_.setProp({boldSymbol: "*"})` or pass it in `newText()` |
| Segment not splitting | `segmentSymbol` is `null` by default | Set `_.setProp({segmentSymbol: ";"})` or pass it in `newText()` |
| "Missing audio file" | Sound path does not exist: `_.playSound()` joins the path against the base set by `_.setAudioFile()` (by default the `engine.js` module path), and `addSounds()` checks it from the CWD | Call `_.setAudioFile(path.dirname(fileURLToPath(import.meta.url)))` and use paths relative to the script (e.g. `"Sounds/click.wav"`), or pass an absolute path |
| Last text disappears instantly | No `_.wait()` after the last `_.newText()` | Add `_.wait(sec)` to keep it visible, or give the event a `duration` |
| `setText` throws "No text found with id" | `textProp[id]` not set (e.g. `newText` never called for that id) | Ensure `_.newText()` was called with the same `id` before `_.setText()` |
| `setText` replacement ends early | The stored config included a `duration` | Omit `duration` (or set `null`) on the original `newText()` call |
| `callerPath` errors | Passed `import.meta.filename` instead of `import.meta.url` | Use `import.meta.url` (a `file://` URL) |
| `changeProp` throws "Nonnumber values" | Passed a non-numeric delta, or the property value is not finite | Use numeric properties only; use `setProp()` for non-numeric changes |
| Image not showing | `loadImageAsset` failed (logged as a console warning) | Ensure the image path resolves relative to the script's directory and the file exists; rendering skips missing images silently |
| Text misaligned vertically | `alignY` not set correctly | Use `alignY: -1` (top), `0` (center), or `1` (bottom) |
| Text not centered horizontally | `posX` offsets not accounted for | Use `_.centerText()` to reposition a group after positioning |
| Circle is larger/smaller than expected | `diameter` is passed as the canvas arc **radius** | Halve or double the value as needed (see [visuals.md](./visuals.md)) |
| `undoParam` throws "No saved checkpoint" | Checkpoint stacks are per type and `undoParam` pops only that type's stack | Call `_.saveParam(type)` before `_.undoParam(type)` with the same type |
| `animate()`/`moveTo()` reject the property | Property is not tweenable | Use one of `posX`, `posY`, `fontSize`, `diameter`, `width`, `height`, `lengthX`, `lengthY`, `lineWidth` |
| `moveTo()` throws "no visual events with id ... define ..." | The targeted id has no such property (e.g. `diameter` on text) | Target only properties the element type defines |
| `animate()`/`moveTo()`/`recolor()` throw "no visual events with id" | Elements not created yet, or wrong id | Create the elements first; capture the id returned by the creator |
| `recolor()` throws "only supports hex colors" | Named CSS colors cannot be interpolated | Use `#RGB` / `#RRGGBB` for the target color and for the events being recolored |
| Tween appears not to animate | No `wait()` after the tween call | Tweens do not advance the time cursor; `wait()` through the tween duration |
| Tween snapped instead of moving smoothly | Easing or duration typo | Check the `duration` argument and the easing name in `opts.easing` |
| Auto ids are negative numbers | Intentional: auto-assigned ids never collide with user ids | Capture the returned id, or pass your own `id` |
