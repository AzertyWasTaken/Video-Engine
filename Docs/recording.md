# Recording & Audio

> Part of the [Anim documentation](../README.md#documentation).

Animation scripts end by encoding the timeline:

```js
const visual = _.getVisualTimeline();
const audio = _.getAudioTimeline();
const duration = _.getDuration();

await record(CONFIG, visual, duration, import.meta.url);
addSounds(audio, duration, import.meta.url);
```

This produces `visual.mp4` (video-only) and `audio.mp4` (video + mixed audio) next to the calling script.

## `record(CONFIG, visual, duration, callerPath)` — async

`Engine/record.js` — spawns FFmpeg, writes consecutive RGBA frames to stdin, and produces `visual.mp4`.

- `CONFIG` — `{WIDTH, HEIGHT, FPS}`
- `visual` — visual events array (from `_.getVisualTimeline()`)
- `duration` — total seconds (from `_.getDuration()`)
- `callerPath` — `import.meta.url` of the calling script (defaults to the current working directory); the output file is written to that directory
- Returns the output file path

Details:

- Samples `Math.ceil(FPS * duration)` frames at `t = f / FPS`, encoding with libx264 (`-preset ultrafast`, `yuv420p`).
- Handles FFmpeg stdin backpressure (waits for `drain`).
- Preloads all `"image"` events via `loadImageAsset()` before the first frame, resolving relative paths against the calling script's directory. Failed loads log a warning; rendering then skips those images.
- Resolves `file://` URLs and plain paths (via `resolveCallerPath()`).

## `addSounds(audio, duration, callerFilePath)` — synchronous

`Engine/addSounds.js` — mixes the audio timeline over `visual.mp4` and produces `audio.mp4`.

- `audio` — audio events array (from `_.getAudioTimeline()`)
- `duration` — total seconds (used to trim the final mix)
- `callerFilePath` — `import.meta.url` of the calling script (defaults to the current working directory)

Details:

- Filters for events with a `sound` property; other events are skipped.
- With **no** audio events it remuxes `visual.mp4` into `audio.mp4` with the video stream copied (no audio track) and exits the process.
- Per event: `adelay` (milliseconds from the event's `start`) + `volume`, then a single `amix` (`duration=longest`, `normalize=0`) trimmed to the video duration.
- Uses `execFileSync` — it blocks and **exits the process** on FFmpeg failure. Call `await record(...)` first, then `addSounds(...)`.
- Sound paths are used as-is and checked with `fs.existsSync()` (relative paths resolve against the process CWD — usually they are already absolute because `_.playSound()` joins them against the base set by `_.setAudioFile()`). Missing files throw `Missing audio file for event`.

## FFmpeg configuration

Both modules resolve the executable as:

```txt
process.env.FFMPEG_PATH ?? "C:/ffmpeg/bin/ffmpeg.exe"
```

The `FFMPEG_PATH` environment variable takes precedence. Alternatively, edit the constant at the top of `Engine/record.js` and `Engine/addSounds.js`.

## Creating a new animation

1. **Copy** `anim_template.js` (keep it at the project root).
2. **Import** the Engine and helpers:

   ```js
   import {Engine as _} from "./Engine/engine.js";
   import {record} from "./Engine/record.js";
   import {addSounds} from "./Engine/addSounds.js";
   ```

3. **Set CONFIG** (`WIDTH`, `HEIGHT`, `FPS`).
4. **Set defaults** with `_.setProp({...})`, `_.setBackgroundColor(...)`, and `_.setAudioFile(...)` for script-relative sounds.
5. **Build the timeline** with `_.newText()`, `_.wait()`, `_.playSound()`, etc.
6. **Encode**: `await record(CONFIG, visual, duration, import.meta.url);` then `addSounds(audio, duration, import.meta.url);`

**Always pass `import.meta.url`** (a `file://` URL, not `import.meta.filename`) so outputs are written next to your animation script regardless of the working directory.

> Note: `anim_template.js` currently imports `record`/`addSounds` via `../Anim/Engine/...` paths and stores `import.meta.url` in a `filename` variable. This works, but new animations should use `./Engine/...`.
