# Anim

Node.js/Canvas + FFmpeg pipeline to generate animated math videos with rich text, audio, and custom effects.

> **Agent tip:** For implementation notes, performance considerations, and editing guidance, see [AGENTS.md](./AGENTS.md).

## Quick start

```bash
npm install
node anim_template.js
```

This produces `visual.mp4` (video-only) and `audio.mp4` (video + mixed audio) next to the script.

**Requirements:** Node.js 18+ (ES modules), `@napi-rs/canvas` (installed via `npm install`), and FFmpeg (default `C:/ffmpeg/bin/ffmpeg.exe`; override with the `FFMPEG_PATH` environment variable - see [docs/recording.md](./docs/recording.md#ffmpeg-configuration)).

## How it works

An animation script (`anim_*.js`) builds a **timeline** with the `Engine` API, then calls `record()` and `addSounds()` to encode the output:

```js
import {Engine as _} from "./Engine/engine.js";
import {record} from "./Engine/record.js";
import {addSounds} from "./Engine/addSounds.js";

const CONFIG = {WIDTH: 1920, HEIGHT: 1080, FPS: 30};

_.setBackgroundColor("#000080");
const title = _.newText({text: "Hello, world!", duration: 2});
_.wait(2);

_.moveTo(title, {posY: -200}, 1, {easing: "quadOut"});  // tween the text upward
_.wait(1);

const visual = _.getVisualTimeline();
const audio = _.getAudioTimeline();
const duration = _.getDuration();

await record(CONFIG, visual, duration, import.meta.url);
addSounds(audio, duration, import.meta.url);
```

Everything is positioned at a monotonically increasing **time cursor**; `_.wait()` advances it and `_.seek()` sets it directly:

```js
_.wait(2)  // time = 2
_.newText({...})                 // text event starts at time = 2
_.wait(1)                        // time = 3
_.playSound("Sounds/click.wav")  // audio event starts at time = 3
_.clear(id)                      // text event ends at time = 3
```

Creators return the group id (auto-assigned when `id` is omitted), and a `duration` property ends events on their own - so `wait` + `clear` pairs are optional.

**Engine modules are NOT entry points.** Never run `node Engine/record.js` directly - always run an `anim_*.js` script that imports from `Engine/`.

## Project structure

| Path | Role |
| - | - |
| `anim_*.js` | Self-contained animation scripts (entry points). `anim_template.js` is the starter template. |
| `Engine/engine.js` | Core timeline builder: time cursor, event arrays, all `_.` methods |
| `Engine/param.js` | Default property objects per type (`text`, `line`, `rect`, `circle`, `image`) |
| `Engine/textParser.js` | Text tokenization (markup), width measurement, line wrapping, segment splitting |
| `Engine/easing.js` | Easing functions for tweens (`linear`, `quad*`, `cubic*`) |
| `Engine/render.js` | Per-frame Canvas renderer (cached sort + binary search, tween resolution) |
| `Engine/record.js` | Streams frames to FFmpeg, producing `visual.mp4` (also preloads image assets) |
| `Engine/addSounds.js` | Delays and mixes audio events over the video, producing `audio.mp4` |
| `Engine/utils.js` | Shared FFmpeg path and caller path resolution |

## Documentation

| Document | Contents |
| - | - |
| [docs/engine-api.md](./docs/engine-api.md) | Full `Engine` API reference, time model, property defaults, checkpoints, animation |
| [docs/text.md](./docs/text.md) | Text properties, markup (bold/color/segments/escaping), rendering pipeline |
| [docs/visuals.md](./docs/visuals.md) | Line/rect/circle/image properties, element types, rendering geometry |
| [docs/recording.md](./docs/recording.md) | `record()` / `addSounds()`, FFmpeg setup, creating a new animation |
| [docs/internals.md](./docs/internals.md) | Module-by-module implementation notes and performance considerations |
| [docs/troubleshooting.md](./docs/troubleshooting.md) | Common symptoms, causes, and fixes |
| [AGENTS.md](./AGENTS.md) | Guidance for AI agents and maintainers |
| [TODO.md](./TODO.md) | Planned features and update log |
