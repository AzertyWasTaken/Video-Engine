# Recording & Audio

> Part of the [Anim documentation](../README.md#documentation).

Animation scripts end by encoding the timeline. The one-call form is `renderVideo()` from `Engine/pipeline.js`:

```js
import {renderVideo} from "./Engine/pipeline.js";

await renderVideo(CONFIG, import.meta.url, {audio: true});  // visual.mp4 + audio.mp4
```

It calls `record()` and, when `opts.audio` is `true`, `addSounds()`. To control both steps yourself, pass the timeline explicitly:

```js
const visual = _.getVisualTimeline();
const audio = _.getAudioTimeline();
const duration = _.getDuration();

await record(CONFIG, visual, duration, import.meta.url);
addSounds(audio, duration, import.meta.url);
```

Both forms produce `visual.mp4` (video-only) and `audio.mp4` (video + mixed audio) next to the calling script. `renderVideo()` returns `{visualPath, audioResult, duration}`.

## `record(CONFIG, visual, duration, callerPath, opts)` — async

`Engine/record.js` — spawns FFmpeg, writes consecutive RGBA frames to stdin, and produces `visual.mp4`.

- `CONFIG` — `{WIDTH, HEIGHT, FPS}`, plus an optional `SCALE` (default `1`) that changes the encoded resolution (see "Resolution"), and the optional encode knobs `PRESET` (default `"ultrafast"`), `CRF` (`0`-`51`) and `WORKERS` (see "Parallel rendering")
- `visual` — visual events array (from `_.getVisualTimeline()`)
- `duration` — total seconds (from `_.getDuration()`)
- `callerPath` — `import.meta.url` of the calling script (defaults to the current working directory); the output file is written to that directory
- `opts` - `{chapter}` records only one chapter (see "Recording a single chapter"); `{workers}` overrides `CONFIG.WORKERS`
- Returns the output file path

Details:

- Samples `Math.ceil(FPS * (end - start))` frames at `t = start + f / FPS` (full video: `start = 0`, `end = duration`), encoding with libx264 (`-preset ultrafast`, `yuv420p`) unless `PRESET`/`CRF` say otherwise.
- Handles FFmpeg stdin backpressure (waits for `drain`) and prints a progress line about once per encoded second.
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
- With **no** audio events it remuxes `visual.mp4` into `audio.mp4` with the video stream copied (no audio track) and returns.
- Per event: `adelay` (milliseconds from the event's `start`) + `volume`, then a single `amix` (`duration=longest`, `normalize=0`) trimmed to the video duration.
- Uses `execFileSync` — it **blocks** the process and throws on FFmpeg failure (it never exits the process for you). Call `await record(...)` first, then `addSounds(...)`.
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

## Parallel rendering

`record()` can split a long render across several processes, each rendering one slice of the same timeline:

```js
const CONFIG = {WIDTH: 1920, HEIGHT: 1080, FPS: 30, WORKERS: 4}; // or WORKERS: "auto"
```

- `CONFIG.WORKERS` (`opts.workers` also works) takes a positive integer or `"auto"` (the default when omitted outside chapters): `min(4, floor(cores / 4))`.
- Workers stay off for windows under 8 seconds, for fewer than 30 frames per worker, and always for chapter/edit renders.
- Each worker re-runs the calling script (so the timeline must be deterministic) and renders `visual_part<i>of<K>.mp4` next to the video; the parts are joined with an FFmpeg concat **stream copy** and the part files are deleted afterwards.
- Worker processes stop right after their part is rendered - code after `record()`/`renderVideo()` (including `addSounds()`) runs in the parent process only.
- Everything the script prints while building its timeline (its own logs, the caller's messages) is muted in the worker processes, so each line appears once; the `[part i/K]` progress lines still stream. `console.error` is not muted, so failures stay visible.
- Because each worker builds the whole timeline, keep post-render side effects (uploads, file moves) idempotent or guarded, and set `WORKERS: 1` for scripts whose content is random or depends on wall-clock time.
- Measured on a 16-thread machine at 1080p: ~42 fps single-process, ~74 fps with 2 workers, ~122 fps with 4 - the frame loop scales nearly linearly, and the join re-encodes nothing.

## Encode quality

`PRESET` (default `"ultrafast"`) and `CRF` (`0`-`51`, x264 default when omitted) are passed straight to libx264:

```js
const CONFIG = {WIDTH: 1920, HEIGHT: 1080, FPS: 30, PRESET: "veryfast", CRF: 20};
```

Encoding runs in a separate process and overlaps frame production, so these knobs change file size and quality rather than render throughput.

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

## Editing a single chapter

Pass `{chapter: name, edit: true}` to both calls to re-render one chapter and splice it into the existing full `visual.mp4` / `audio.mp4`, without re-encoding the rest of the video:

```js
// 1. Full render (produces visual.mp4 + audio.mp4)
await record(CONFIG, visual, duration, import.meta.url);
addSounds(audio, duration, import.meta.url);

// 2. Later: re-render just the "intro" chapter and splice it back in
await record(CONFIG, visual, duration, import.meta.url, {chapter: "intro", edit: true});
addSounds(audio, duration, import.meta.url, {chapter: "intro", edit: true});
```

- The chapter clip is rendered as `visual_<name>.mp4` / `audio_<name>.mp4`, then spliced into the full video at `[chapter.start, chapter.end)`.
- The full `visual.mp4` / `audio.mp4` are replaced in place (atomically, via a temp file).
- Edit mode requires the full render to exist first - it throws `"full video not found"` if `visual.mp4` / `audio.mp4` is missing.
- Chapter names come from `_.chapter()` / `_.scene()` and must match exactly.
- Alternative spellings are accepted: `{chapterName: "intro", edit: true}`, `{editChapter: "intro"}` (chapter name + edit implied), `{edit: true, chapter: "intro"}`, or `{edit: "intro"}` (string `edit` doubles as the chapter name).
- The rest of the video is copied from the existing file - only the chapter window is re-encoded.

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
   import {renderVideo} from "./Engine/pipeline.js";
   ```

3. **Set CONFIG** (`WIDTH`, `HEIGHT`, `FPS`).
4. **Set defaults** with `_.setProp({...}, "text")` (the defaults argument targets the shared `global` keys unless a type is passed), `_.setBackgroundColor(...)`, and `_.setAssets({...})` for script-relative sounds and images.
5. **Build the timeline** with `_.newText()`, `_.wait()`, `_.playSound()`, etc.
6. **Encode** with one call: `await renderVideo(CONFIG, import.meta.url, {audio: true})`, or `await record(...)` + `addSounds(...)` from `Engine/record.js` / `Engine/addSounds.js` for manual control.

**Iterate quickly:** `await previewFrame(CONFIG, import.meta.url, {t: 1.5})` (also from `Engine/pipeline.js`) renders one frame to `preview.png` next to the script - no FFmpeg, sub-second visual checks. `previewFrames(CONFIG, callerPath, {count: 6})` renders several evenly spaced frames. Existing scripts can also be run with `ANIM_DRY_RUN=1`, `ANIM_PREVIEW=<t>`, `ANIM_PREVIEW_FRAMES=0,1,2`, or `ANIM_PREVIEW_GRID=<n>` without editing them.

Property names are validated: an unknown key (e.g. `maxwidth` instead of `maxWidth`) throws an error with a "did you mean" suggestion. Custom keys belong to the `addon` type.

**Always pass `import.meta.url`** (a `file://` URL, not `import.meta.filename`) so outputs are written next to your animation script regardless of the working directory.
