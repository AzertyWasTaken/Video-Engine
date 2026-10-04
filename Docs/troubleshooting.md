# Troubleshooting

> Part of the [Anim documentation](../README.md#documentation).

| Symptom | Cause | Fix |
| - | - | - |
| `visual.mp4` not found | Ran `node Engine/record.js` directly | Run an `anim_*.js` script instead |
| FFmpeg not found | Path mismatch | Set the `FFMPEG_PATH` environment variable, or update the default in `Engine/utils.js` |
| Missing audio in output | `addSounds()` commented out | Uncomment `addSounds()` to enable it |
| Audio out of sync | Audio `start` depends on the time cursor (includes all `_.wait()` calls) | Check that `_.wait()` calls before `_.playSound()` match the intended timing |
| Text not wrapping | `maxWidth` is `Infinity` by default | Set `_.setProp({maxWidth: 960})` before `_.newText()` |
| Style not rendering | `styleSymbol` is `[]` by default | Pass `styleSymbol` entries in `newText()` |
| Segment not splitting | `segmentSymbol` is `null` by default | Set `_.setProp({segmentSymbol: ";"})` or pass it in `newText()` |
| "Missing audio file" | The resolved sound path does not exist: `_.playSound()` stores the path as written and `addSounds()` resolves it (shorthand map, then script directory) | Register it with `_.setAssets({click: "./Sounds/click.wav"})` and call `_.playSound("click")`, or pass a path relative to the script / an absolute path |
| Last text disappears instantly | No `_.wait()` after the last `_.newText()` | Add `_.wait(sec)` to keep it visible, or give the event a `duration` |
| `setText` throws "No text found with id" | No stored config for any queried id (`newText` never called with it) | Ensure `_.newText()` was called with that `id` before `_.setText()` |
| `setText` replacement ends early | The stored config included a `duration` | Omit `duration` (or set `null`) on the original `newText()` call |
| `callerPath` errors | Passed `import.meta.filename` instead of `import.meta.url` | Use `import.meta.url` (a `file://` URL) |
| `changeProp` throws "Nonnumber values" | Passed a non-numeric delta, or the property value is not finite | Use numeric properties only; use `setProp()` for non-numeric changes |
| Image not showing | `loadImageAsset` failed (logged as a console warning) | Register the file with `_.setAssets({logo: "./Images/logo.png"})` and pass `src: "logo"`, or use a path relative to the script's directory; rendering skips missing images silently |
| Misaligned vertically | `alignY` not set correctly | Use `alignY: -1` (top), `0` (center), or `1` (bottom); works for text and shapes |
| Misaligned horizontally | `alignX` not set correctly | Use `alignX: -1` (left), `0` (center), or `1` (right); works for text and shapes |
| Text not centered horizontally | `posX` offsets not accounted for | Use `_.centerText()` to reposition a group after positioning |
| Circle is larger/smaller than expected | `diameter` is passed as the canvas arc **radius** | Halve or double the value as needed (see [visuals.md](./visuals.md)) |
| `undoParam` throws "No saved checkpoint" | Checkpoint stacks are per type and `undoParam` pops only that type's stack | Call `_.saveParam(type)` before `_.undoParam(type)` with the same type |
| `animate()`/`moveTo()` reject the property | Property is not tweenable | Use one of `posX`, `posY`, `fontSize`, `diameter`, `width`, `height`, `scaleX`, `scaleY`, `lineWidth`, `strokeWidth`, `opacity` |
| `moveTo()` throws "Opacity must be a finite number from 0 to 1" | Absolute `opacity` target outside `0`..`1` | Pass a value from `0` to `1`, or use `animate()` with a relative delta |
| `moveTo()` throws "no visual events with id ... define ..." | The targeted id has no such property (e.g. `diameter` on text) | Target only properties the element type defines |
| `animate()`/`moveTo()`/`recolor()` throw "no visual events with id" | Elements not created yet, or wrong id | Create the elements first; capture the id returned by the creator |
| `recolor()` throws "only supports hex colors" | Named CSS colors cannot be interpolated | Use `#RGB` / `#RRGGBB` for the target color and for the events being recolored |
| Tween appears not to animate | No `wait()` after the tween call | Tweens do not advance the time cursor; `wait()` through the tween duration |
| Tween snapped instead of moving smoothly | Easing or duration typo | Check the `duration` argument and the easing name in `opts.easing` |
| Auto ids are negative numbers | Intentional: auto-assigned ids never collide with user ids | Capture the returned ids array, or pass your own `id` |
