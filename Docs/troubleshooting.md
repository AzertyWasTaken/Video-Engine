# Troubleshooting

> Part of the [Anim documentation](../README.md#documentation).

| Symptom | Cause | Fix |
| - | - | - |
| `visual.mp4` not found | Ran `node Engine/record.js` directly | Run an animation script (`anim_template.js` or a `Templates/*.js` demo) instead |
| FFmpeg not found | Path mismatch | Set the `FFMPEG_PATH` environment variable, or update the default in `Engine/utils.js` (both `record()` and `addSounds()` fail fast with the resolved path) |
| Missing audio in output | `renderVideo()` mixes audio only with `{audio: true}`, or `addSounds()` was skipped | Pass `{audio: true}` to `renderVideo()`, or call `addSounds()` after `record()` |
| Audio out of sync | Audio `start` depends on the time cursor (includes all `_.wait()` calls) | Check that `_.wait()` calls before `_.playSound()` match the intended timing |
| Text not wrapping | `maxWidth` is `Infinity` by default | Set `_.setProp({maxWidth: 960}, "text")` before `_.newText()` |
| Style not rendering | `styleSymbol` is `[]` by default | Pass `styleSymbol` entries in `newText()` |
| Segment not splitting | `segmentSymbol` is `null` by default | Set `_.setProp({segmentSymbol: ";"}, "text")` or pass it in `newText()` |
| "Missing audio file" | The resolved sound path does not exist: `_.playSound()` stores the path as written and `addSounds()` resolves it (shorthand map, then script directory) | Register it with `_.setAssets({click: "./Sounds/click.wav"})` and call `_.playSound("click")`, or pass a path relative to the script / an absolute path |
| Last text disappears instantly | No `_.wait()` after the last `_.newText()` | Add `_.wait(sec)` to keep it visible, or give the event a `duration` - `record()` also warns when events are never visible or get cut off |
| `Cannot record: the timeline is 0 seconds long` | The cursor never advanced (no `wait()`, no `duration`, no `hold`) | Add a final `_.wait(sec)`, give the last event a `duration`, or call `_.waitUntilIdle()` |
| `unknown property "maxwidth" - did you mean "maxWidth"?` | Typo in a property name (`setProp()` / `withProp()` / creators) | Fix the key; custom keys belong to the `addon` type |
| `clear()/centerText()/getSize()/getCenter(): no visual events with id ...` (warning) | Usually a typo'd id - nothing matched, nothing changed | Check the id; the warning lists known ids with "did you mean" hints, and `_.getIds()` lists them all |
| `setText` throws "No text found with id" | No stored config for any queried id (`newText` never called with it) | Ensure `_.newText()` was called with that `id` before `_.setText()` |
| `setText` replacement ends early | The stored config included a `duration` | Omit `duration` (or set `null`) on the original `newText()` call |
| `callerPath` errors | Passed `import.meta.filename` instead of `import.meta.url` | Use `import.meta.url` (a `file://` URL) |
| `changeProp` throws "must combine finite numbers" | Passed a non-numeric delta (a numeric string counts as non-numeric) | Pass real numbers; use `setProp()` for non-numeric changes |
| Image not showing | `loadImageAsset` failed (logged as a console warning) | Register the file with `_.setAssets({logo: "./Images/logo.png"})` and pass `src: "logo"`, or use a path relative to the script's directory; rendering skips missing images silently |
| Misaligned vertically | `alignY` not set correctly | Use `alignY: -1` (top), `0` (center), or `1` (bottom); works for text and shapes |
| Misaligned horizontally | `alignX` not set correctly | Use `alignX: -1` (left), `0` (center), or `1` (right); works for text and shapes |
| Text not centered horizontally | `posX` offsets not accounted for | Use `_.centerText()` to reposition a group after positioning |
| `animate()`/`moveTo()` reject the property | Property is not tweenable | Use one of `posX`, `posY`, `rotation`, `fontSize`, `diameter`, `arc`, `width`, `height`, `scaleX`, `scaleY`, `lineWidth`, `strokeWidth`, `opacity` |
| Object not rotated | `rotation` must be a finite number of degrees | Pass e.g. `rotation: 45` (clockwise); a non-number throws "Rotation must be a finite number of degrees" |
| Rotated text segments spin apart | Text rotated per segment | Not possible - text pivots on its layout anchor, so a whole block turns as one; make sure the rotated text is one `newText()` call |
| `moveTo()` throws "Opacity must be a finite number from 0 to 1" | Absolute `opacity` target outside `0`..`1` | Pass a value from `0` to `1`, or use `animate()` with a relative delta |
| `moveTo()` throws "no visual events with id ... define ..." | The targeted id has no such property (e.g. `diameter` on text) | Target only properties the element type defines |
| `animate()`/`moveTo()`/`recolor()` throw "no visual events with id" | Elements not created yet, or wrong id | Create the elements first; the creator's return value works as the id, and the error lists known ids |
| `recolor()` throws "no visual events ... have a color to recolor" | The id matches events without a color (e.g. images) | Target line/rect/circle/shape/text events, which define a color |
| `recolor()` throws "only supports hex colors" | Named CSS colors cannot be interpolated | Use `#RGB` / `#RRGGBB` for the target color and for the events being recolored |
| Tween appears not to animate | No `wait()` after the tween call | Tweens do not advance the time cursor; `wait()` through the tween duration |
| Tween snapped instead of moving smoothly | Easing or duration typo (the duration argument defaults to `0`, i.e. instant) | Check the `duration` argument and the easing name in `opts.easing` |
| Auto ids are negative numbers | Intentional: auto-assigned ids never collide with user ids | Capture the returned ids array, or pre-assign one with `_.getAutoId()` |
| `setProp`/`changeProp` throw "unknown property ... for type global" | The prop helpers use the shared `global` defaults unless a type is passed | Pass the type explicitly: `_.setProp({maxWidth: 960}, "text")` - the error names the type that owns the key |
| `withProp` throws "expects a callback" | The callback is missing, or a non-string was passed where the type goes | Use `withProp(props, fn)`, `withProp(props, type, fn)`, or `withProp({text: {...}}, fn)` |
| `repeat`/`repeatGrid` reject the count | They take **iteration counts**, not seconds | Pass whole numbers; timing comes from `wait()` inside the callback |
| `newTexts` throws "expects an options object" | The second argument was not an object | Pass `{}` / `{posY, textGap}`, or omit it |
| `Render worker N exited with code ...` | A parallel worker process failed (missing module, script throws only in that slice, out of memory) | Re-run with `WORKERS: 1` to see the real error in a single process; parallel rendering only splits the frame range, so a single-process run reproduces it |
| Concat fails or `visual.mp4` is missing after a parallel render | Part files could not be joined (interrupted run, part writes to a different directory) | The parts and `visual_parts.txt` are deleted on failure, so just re-run; keep `WORKERS: 1` if it persists |
| Code after `renderVideo()` runs several times | Parallel workers re-run the whole script | Workers exit right after the render, so post-render code runs once in the parent - still keep side effects idempotent, or set `WORKERS: 1` |
| A log line appears once per worker | Script-level output is muted in workers, but only for `console.log`/`info`/`debug`/`trace`/`warn`/`dir`/`table` | Write logs with those (or `console.error`), or set `WORKERS: 1`; raw `process.stdout.write` / logger libraries writing to stdout directly still repeat |
| Render is slower than expected | Frames read back through `getImageData()`, or the window is too short/small for workers | Ship frames with `renderRawFrame()` (`toBufferSync("raw")`), and check the "Rendering with N workers..." line |
