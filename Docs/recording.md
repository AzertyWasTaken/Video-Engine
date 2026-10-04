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

## `record(CONFIG, visual, duration, callerPath, opts)` — async

`Engine/record.js` — spawns FFmpeg, writes consecutive RGBA frames to stdin, and produces `visual.mp4`.

- `CONFIG` — `{WIDTH, HEIGHT, FPS}`, plus an optional `SCALE` (default `1`) that changes the encoded resolution (see "Resolution")
- `visual` — visual events array (from `_.getVisualTimeline()`)
- `duration` — total seconds (from `_.getDuration()`)
- `callerPath` — `import.meta.url` of the calling script (defaults to the current working directory); the output file is written to that directory
- `opts` - `{chapter}` records only one chapter (see "Recording a single chapter")
- Returns the output file path

Details:

- Samples `Math.ceil(FPS * (end - start))` frames at `t = start + f / FPS` (full video: `start = 0`, `end = duration`), encoding with libx264 (`-preset ultrafast`, `yuv420p`).
- Handles FFmpeg stdin backpressure (waits for `drain`).
- Preloads `"image"` events overlapping the recorded window (all of them for a full video) via `loadImageAsset()`, resolving each `src` through `resolveAsset()` - a shorthand registered by `_.setAssets()`, else an absolute path, else relative to the calling script's directory. Failed loads log a warning; rendering then skips those images.
- Resolves `file://` URLs and plain paths (via `resolveCallerPath()`).

## `addSounds(audio, duration, callerFilePath, opts)` — synchronous

`Engine/addSounds.js` — mixes the audio timeline over `visual.mp4` and produces `audio.mp4`.

- `audio` — audio events array (from `_.getAudioTimeline()`)
- `duration` — total seconds (used to trim the final mix)
- `callerFilePath` — `import.meta.url` of the calling script (defaults to the current working directory)
- `opts` - `{chapter}` mixes audio for one chapter (see "Recording a single chapter")

Details:

- Filters for events with a `sound` property; other events are skipped.
- With **no** audio events it remuxes `visual.mp4` into `audio.mp4` with the video stream copied (no audio track) and exits the process.
- Per event: `adelay` (milliseconds from the event's `start`) + `volume`, then a single `amix` (`duration=longest`, `normalize=0`) trimmed to the video duration.
- Uses `execFileSync` — it blocks and **exits the process** on FFmpeg failure. Call `await record(...)` first, then `addSounds(...)`.
- Sound paths are resolved through `resolveAsset()` - a shorthand registered by `_.setAssets()`, else an absolute path, else relative to the calling script's directory, so execution CWD never matters. Missing files throw `Missing audio file for event`.

## Resolution

`WIDTH` / `HEIGHT` define both the **design space** (every `posX`, `fontSize`, `diameter`, `maxWidth`... is in those units) **and** the encoded resolution. `CONFIG.SCALE` separates them:

```js
const CONFIG = {WIDTH: 1920, HEIGHT: 1080, FPS: 30, SCALE: 2};  // records 3840x2160
```

- The animation is still composed in `WIDTH x HEIGHT`; only the pixel count changes, so **the framing is identical** at any `SCALE`.
- The output is genuinely sharper (more pixels per glyph/stroke), not upscaled — and a `SCALE` below `1` renders a smaller video.
- Fractional values work (`SCALE: 1.5` with 1920x1080 records 2880x1620); the pixel size is rounded and the render transform is derived from that rounded size, so nothing is cropped or stretched.
- `SCALE` must be a positive finite number; anything else throws.
- Cost: pixel data per frame grows with `SCALE²` (2x = 4x the work), so encoding takes proportionally longer.

## Recording a single chapter

Pass `{chapter: name}` to both calls to render one chapter instead of the full video:

```js
await record(CONFIG, visual, duration, import.meta.url, {chapter: "intro"});
addSounds(audio, duration, import.meta.url, {chapter: "intro"});
```

- Chapter names come from `_.chapter()` / `_.scene()` and must match exactly (names are unique).
- Chapter recordings write `visual_<name>.mp4` / `audio_<name>.mp4` (the name is sanitized for the filesystem), so the full render stays intact.
- The clip covers `chapter.start` to `chapter.end`; an open last chapter (not closed by a later `chapter()` call) ends at the total duration.
- Frames are sampled at `t = chapter.start + f / FPS`: everything visible in the full video at those times is drawn, including elements from before the chapter.
- Audio events with a `start` inside the window are shifted into the clip; sounds that began before the chapter are dropped.
- `renderVideo(CONFIG, callerPath, {audio: true, chapter: "intro"})` forwards the option to both calls.

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
4. **Set defaults** with `_.setProp({...})`, `_.setBackgroundColor(...)`, and `_.setAssets({...})` for script-relative sounds and images.
5. **Build the timeline** with `_.newText()`, `_.wait()`, `_.playSound()`, etc.
6. **Encode**: `await record(CONFIG, visual, duration, import.meta.url);` then `addSounds(audio, duration, import.meta.url);`

**Always pass `import.meta.url`** (a `file://` URL, not `import.meta.filename`) so outputs are written next to your animation script regardless of the working directory.

> Note: `anim_template.js` currently imports `record`/`addSounds` via `../Anim/Engine/...` paths and stores `import.meta.url` in a `filename` variable. This works, but new animations should use `./Engine/...`.
