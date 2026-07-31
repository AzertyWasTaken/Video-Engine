# AGENTS.md — Anim Project Guide

> **Purpose:** This file accelerates agent reasoning and reduces time-to-solution for anyone working on the **Anim** project. Read it before making changes.
>
> For full API documentation, see [README.md](./README.md). This file focuses on agent-specific guidance, implementation notes, and workflow tips.

## 1. Project at a Glance

**Anim** is a Node.js + Canvas + FFmpeg pipeline that generates animated math videos. An animation script (`anim_*.js`) builds a **timeline** using the `Engine` API, then calls `record()` and `addSounds()` to encode `visual.mp4` and `audio.mp4`.

| Concern | Detail |
| - | - |
| Runtime | Node.js 18+ (ES Modules: `"type": "module"`) |
| Canvas | `@napi-rs/canvas` (npm install) |
| Encoder | FFmpeg at `C:/ffmpeg/bin/ffmpeg.exe` (see §3) |
| Entry point | `anim_*.js` files at project root |
| Output | `visual.mp4` (video-only), `audio.mp4` (video + mixed audio) |

**Engine modules are NOT entry points.** Never run `node Engine/record.js` directly — always run an `anim_*.js` script that imports from `Engine/`.

## 2. Critical Mental Model: The Time Cursor

The `Engine` maintains a **monotonically increasing `time` cursor**. Everything is positioned relative to this cursor.

```js
_.wait(2)              // time = 2
_.newText({...})       // text event starts at time = 2
_.wait(1)              // time = 3
_.sound("Sounds/click.wav")  // audio event starts at time = 3
_.clear(id)            // text event ends at time = 3
```

**Critical mental model:** Every `_.newText()`, `_.sound()`, `_.setBackgroundColor()`, `_.newCircle()` call is positioned at the **current** `time` cursor. `_.wait()` is the only way to advance time. There is no "absolute time" parameter on events — they all inherit `time` at call-site.

**Gotcha:** If you forget a `_.wait()` at the end of your script, the last events may have zero visible duration. Always ensure the final `_.wait()` covers the time you want the last elements to be visible.

## 3. Environment Setup

### Prerequisites

1. **Node.js 18+** (ES Modules)
2. **npm install** — installs `@napi-rs/canvas`
3. **FFmpeg** — must be at `C:/ffmpeg/bin/ffmpeg.exe`

### Custom FFmpeg Path

If your FFmpeg is elsewhere:

- **In `Engine/record.js`:** Update the `ffmpegPath` constant (line 7).
- **In `Engine/addSounds.js`:** Set the `FFMPEG_PATH` environment variable, or update the default fallback (line 7).

### Running

```bash
npm install
node anim_template.js
```

This produces `visual.mp4` and `audio.mp4` in the project root.

## 4. Key Implementation Notes

These notes are essential for modifying engine internals:

- **`textParser.js`** creates a **1×1 canvas** at module load for `measureText()` calls. This is a singleton — do not recreate it.
- **`wrapRichTextSegments(prop)`** takes only `prop` (the merged config). The second argument `textConfig` that was previously passed from `engine.js` was unused — it has been removed.
- **`pushTextLine()`** calls `prop.onTextSegment(textLength)` when it encounters a `"wait"` marker (from `;` splitting). This is how segmented text triggers sounds and waits.
- **`getSegmentsWidth()`** is called per line in `pushTextLine()` — it re-measures all segments. This is a performance hotspot if you have many text events.
- **`record.js`** uses `process.env.FFMPEG_PATH ?? "C:/ffmpeg/bin/ffmpeg.exe"` — the env var takes precedence over the hardcoded default.
- **`addSounds()`** is **synchronous** (uses `execFileSync`), while `record()` is **async** (uses `spawn` with streaming). Call `await record(...)` first, then `addSounds(...)`.
- **`resolveCallerPath()`** helper handles both `file://` URLs and plain file paths. Always pass `import.meta.url` (a `file://` URL), not `import.meta.filename`.

## 5. Agent Workflow Tips

1. **Before editing `engine.js`:** Remember it uses **global mutable state**. Changes to `textConfig` persist across calls. Always consider side effects.
2. **Before editing `textParser.js`:** The `1×1 canvas` singleton is created at module load. Do not add `createCanvas` calls inside functions — reuse the module-level `ctx`.
3. **Before editing `render.js`:** This runs `FPS × duration` times. Avoid adding per-frame allocations or expensive operations. The cached sort + binary search optimization should be preserved.
4. **Before editing `record.js` or `addSounds.js`:** FFmpeg arguments are order-sensitive. Test with short durations first. Both use `resolveCallerPath()` to handle `import.meta.url` vs file paths.
5. **Testing:** Run `node anim_template.js` to verify the full pipeline. Check `visual.mp4` and `audio.mp4` outputs.
6. **Debugging:** Add `console.log` in `engine.js` methods to trace the time cursor and event pushes. The `visual` and `audio` arrays are accessible via `_.getVisualTimeline()` and `_.getAudioTimeline()`.
7. **When in doubt:** Read the `README.md` — it's comprehensive and up-to-date. The `TODO.md` tracks planned features and completed work.
