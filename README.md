# Anim

Node.js/Canvas + FFmpeg pipeline to generate animated math videos with rich text, audio, and custom effects.

> **Agent tip:** For implementation notes, performance considerations, and editing guidance, see [AGENTS.md](./AGENTS.md).

## Quick start

```bash
npm install
node anim_template.js
```

This produces `visual.mp4` (video-only) and `audio.mp4` (video + mixed audio) next to the script.

**Requirements:** Node.js 18+ (ES modules), `skia-canvas` (installed via `npm install`), and FFmpeg (default `C:/ffmpeg/bin/ffmpeg.exe`; override with the `FFMPEG_PATH` environment variable - see [recording](./Docs/recording.md#ffmpeg-configuration)).

## How it works

An animation script (e.g. `anim_template.js`) builds a **timeline** with the `Engine` API, then encodes it with one `renderVideo()` call:

```js
import {Engine as _} from "./Engine/engine.js";
import {renderVideo} from "./Engine/pipeline.js";

const CONFIG = {WIDTH: 1920, HEIGHT: 1080, FPS: 30};  // add SCALE: 2 to record 3840x2160, same framing

_.setBackgroundColor("#000080");
const title = _.newText({text: "Hello, world!", duration: 2});
_.wait(2);

_.moveTo(title, {posY: -200}, 1, {easing: "quad", direction: "out"});  // tween the text upward
_.wait(1);

await renderVideo(CONFIG, import.meta.url, {audio: true});  // visual.mp4 + audio.mp4
```

`renderVideo()` wraps `record()` and, with `{audio: true}`, `addSounds()`. Call those two directly (passing `_.getVisualTimeline()`, `_.getAudioTimeline()`, and `_.getDuration()`) when you need manual control - see [recording](./Docs/recording.md).

Everything is positioned at a monotonically increasing **time cursor**; `_.wait()` advances it and `_.seek()` sets it directly:

```js
_.wait(2)  // time = 2
_.newText({...})                 // text event starts at time = 2
_.wait(1)                        // time = 3
_.playSound("click")  // audio event starts at time = 3
_.clear(id)                      // text event ends at time = 3
```

Creators return the group's ids (a unique id is auto-assigned when `id` is omitted, `id` accepts an array so one object can carry several ids, and the returned value itself works as the id everywhere - every id-taking function then affects the object through any of its ids), and a `duration` property ends events on their own - so `wait` + `clear` pairs are optional. A `hold` property also advances the time cursor after the event spawns (`_.newText({text: "Hi", hold: 2})` is `newText` + `wait(2)`).

**Engine modules are NOT entry points.** Never run `node Engine/record.js` directly - always run an animation script (`anim_template.js` or a `Templates/*.js` demo) that imports from `Engine/`.

## Project structure

| Path | Role |
| - | - |
| `anim_template.js` | Starter animation script (entry point) - copy it to start a new animation |
| `Templates/*.js` | Runnable feature demos (text, visuals, tweens, chapters, audio, ids, props, wait) - also entry points |
| `Engine/engine.js` | Public `Engine` facade: all `_.` methods (time cursor, params, audio, queries) |
| `Engine/state.js` | Global engine state: event arrays, time cursor, auto-id counter, text configs, asset map |
| `Engine/assets.js` | Shorthand -> full path map for sounds and images, and the single path resolver used by `record()` / `addSounds()` |
| `Engine/validate.js` | Shared validation helpers (property types, ids, durations) |
| `Engine/visualEvents.js` | Table-driven visual event creation (`pushVisual`) and group centering |
| `Engine/tweens.js` | Property and color tween chains (`animate()`, `moveTo()`, `recolor()`) |
| `Engine/textEvents.js` | Text event layout and creation (`newText()`) |
| `Engine/chapters.js` | Chapter/scene markers (`chapter()`, `scene()`, `getChapters()`, `getChapterTimestamps()`) |
| `Engine/param.js` | Default property objects per type (`text`, `line`, `rect`, `circle`, `image`) plus shared `global` fallbacks |
| `Engine/textParser.js` | Text tokenization (markup), width measurement, line wrapping, segment splitting |
| `Engine/easing.js` | Easing functions for tweens (`linear`, `quad*`, `cubic*`) |
| `Engine/render.js` | Per-frame Canvas renderer (cached sort + binary search, tween resolution) |
| `Engine/record.js` | Streams frames to FFmpeg, producing `visual.mp4` (also preloads image assets) |
| `Engine/addSounds.js` | Delays and mixes audio events over the video, producing `audio.mp4` |
| `Engine/pipeline.js` | One-call render helper (`renderVideo`, `previewFrame`, `getTimeline`) |
| `Engine/utils.js` | Shared FFmpeg path and caller path resolution |

## Development tools

Quick helpers for iterating on animation scripts (no FFmpeg needed for inspection/preview):

```bash
npm test                                    # unit + previewFrame tests
node Tools/check.js                         # syntax check (root + Templates/)
node Tools/check-templates.js               # dry-run every template
node Tools/run.js anim_myScript.js --inspect
node Tools/run.js anim_myScript.js --preview 1.5
node Tools/run.js anim_myScript.js --grid 6
node Tools/clean-outputs.js                 # remove generated mp4/png
```

Environment flags (also work directly with `node script.js`):
`ANIM_DRY_RUN=1`, `ANIM_INSPECT=1`, `ANIM_PREVIEW=<t>`, `ANIM_PREVIEW_FRAMES=0,1,2`, `ANIM_PREVIEW_GRID=<n>`, `ANIM_PREVIEW_OUT=<name>`.

## Documentation

| Document | Contents |
| - | - |
| [engine-api](./Docs/engine-api.md) | Full `Engine` API reference, time model, property defaults, animation |
| [text](./Docs/text.md) | Text properties, markup (bold/color/segments/escaping), rendering pipeline |
| [visuals](./Docs/visuals.md) | Line/rect/circle/image properties, element types, rendering geometry |
| [recording](./Docs/recording.md) | `record()` / `addSounds()`, FFmpeg setup, creating a new animation |
| [internals](./Docs/internals.md) | Module-by-module implementation notes and performance considerations |
| [troubleshooting](./Docs/troubleshooting.md) | Common symptoms, causes, and fixes |
| [AGENTS.md](./AGENTS.md) | Guidance for AI agents and maintainers |
| [TODO.md](./TODO.md) | Planned features and update log |
