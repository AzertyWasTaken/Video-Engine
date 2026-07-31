# Anim

This project contains a Node.js/Canvas + FFmpeg pipeline to generate animated math videos with rich text, audio, and custom effects.

## What each module does

### Animation scripts (`anim_*.js`)

Starter template — copy to create new animations.

Each `anim_*.js` file is a self-contained entry point that:

1. Creates a timeline using the `Engine` API (from `Engine/engine.js`).
2. Calls `record` and `addSounds` to encode `visual.mp4` and `audio.mp4`.

**Engine modules are NOT entry points.** Never run `node Engine/record.js` directly — always run an `anim_*.js` script that imports from `Engine/`.

### `package.json`

{ "type": "module" }, dep: @napi-rs/canvas

### `Engine/engine.js`

Core timeline builder (global state, time cursor).

Exports the `Engine` object (aliased `_` in animation scripts), which maintains a global `time` cursor and accumulates `visual` and `audio` arrays.

### `Engine/textParser.js`

Handles rich text tokenization (`*bold*` markup), width measurement, line wrapping, and segment splitting (`;` for timed text chunks).

### `Engine/render.js`

Per-frame Canvas renderer (cached sort + binary search).

Takes the visual timeline and a time `t`, draws all active objects to a Canvas, and returns `ImageData`. Uses cached sorted events with binary search for efficient per-frame filtering.

### `Engine/record.js`

Spawns FFmpeg, writes consecutive RGBA frames (at `CONFIG.FPS`) to stdin, and produces `visual.mp4`.

```js
await record(CONFIG, visual, duration, callerPath)
```

- `CONFIG` — `{WIDTH, HEIGHT, FPS}` object
- `visual` — visual events array (from `_.getVisualTimeline()`)
- `duration` — total seconds (from `_.getDuration()`)
- `callerPath` — `import.meta.url` of the calling script; defaults to the calling file's directory

### `Engine/addSounds.js`

Takes the audio timeline, delays each sound file via FFmpeg `adelay`, mixes them with `amix`, and produces `audio.mp4`. If no audio events have a `sound` property, it remuxes `visual.mp4` with a silent AAC track instead.

```js
addSounds(audio, duration, callerPath)
```

- `audio` — audio events array (from `_.getAudioTimeline()`)
- `duration` — total seconds (from `_.getDuration()`)
- `callerPath` — (optional) `import.meta.url` of the calling script; defaults to the calling file's directory

## Engine API

The `Engine` object is the core timeline builder. All methods modify a global state.

### Time management

```js
_.wait(sec) // Advance the time cursor by `sec` seconds
_.getDuration() // â†’ total elapsed time
```

### Text

```js
_.newText(textConfig); // Add a text event at the current time cursor
_.setText(id, text) // Replace text of an existing id (clears old, creates new)
_.setProp({...}) // Set default properties for subsequent newText calls — merges into persistent defaults
_.changeProp(key, n) // Increment/decrement a default property (e.g. "posY", 80)
```

#### Text configuration properties

| Property | Default | Description |
| - | - | - |
| `id` | `0` | Integer or string group identifier (required) |
| `text` | `"Hello, world!"` | Text content to render |
| `fontSize` | `80` | Font size in pixels |
| `fontColor` | `"#FFFFFF"` | Text color (any CSS color string) |
| `fontFamily` | `"Arial"` | Font family name |
| `fontWeight` | `400` | Font weight (normal text); bold segments use `700` |
| `posX` | `0` | Horizontal offset from center |
| `posY` | `0` | Vertical offset from center (before alignment) |
| `alignY` | `0` | Vertical alignment: `-1` (top), `0` (center), `1` (bottom) |
| `maxWidth` | `Infinity` | Line-wrap threshold in pixels |
| `richText` | `false` | Enable `*bold*` markup parsing |
| `segmentedText` | `false` | Enable `;` segment splitting (delays between chunks) |
| `effect` | `false` | Enable yellow flash on newly spawned text (0.5s) |
| `autoSetPosY` | `false` | Auto-increment `posY` for chained `newText` calls |
| `autoDelay` | `false` | Auto-compute delay per entry in `newTextSection` based on text length |
| `onTextSegment` | `() => {}` | Callback per segment `(textLength) => void` |
| `textDelay` | `0` | Delay (seconds) before text appears after spawn |
| `fadeIn` | `0` | Fade-in duration (seconds) from transparent to full opacity |
| `fadeOut` | `0` | Fade-out duration (seconds) from full opacity to transparent |

Properties passed directly to `_.newText({...})` are merged on top of the persistent defaults set by `_.setProp()`.

#### `_.setText(id, text)`

Replaces text for an existing id: calls `_.clear(id)` to end the old event, then creates a new text event with the same prior configuration (except `effect`, `autoSetPosY`, `textDelay`, and `fadeIn` are forced to `false`/`0`).

#### `_.newTextSection(newProp, textArray)`

Adds grouped text with shared properties and per-entry vertical offsets and delays.

- `textArray` is an array of **entry objects**.
- **Object format (preferred):** each entry is a text config object with two optional named properties:
  - `offsetY` — vertical offset from the previous entry (default `0`)
  - `delay` — seconds to wait after this entry appears (default `0`)
  - All other properties are passed through to `_.newText()` as text config.
- Each entry calls `_.newText()` with the shared `newProp` merged with the entry's config, then advances `posY` by `offsetY` and waits `delay` seconds.
- After all entries, `_.centerText(prop.id, savedPosY)` centers the group.
- **Side-effect free:** `textConfig.posY` is saved and restored, so `newTextSection` does not leak `posY` mutations into subsequent calls.
- **`autoDelay` option:** when `autoDelay: true` is set in `newProp`, any entry without an explicit `delay` gets a delay auto-computed from its text length (`Math.floor(text.length / 12 + 2) / 2`), matching the segmented-text timing pattern.

```js
// Object format (preferred)
_.newTextSection({alignY: 1, autoSetPosY: true}, [
    {text: "Font color", fontColor: "#FFE040", offsetY: 40, delay: 1},
    {text: "Font family", fontFamily: "Times New Roman", offsetY: 80},
    {text: "Just a long text block; for *testing* purposes.", maxWidth: 800, offsetY: 80, delay: 3},
]);

// autoDelay — delays computed from text length automatically
_.newTextSection({alignY: 1, autoSetPosY: true, autoDelay: true}, [
    {text: "Auto delay entry one", offsetY: 40},
    {text: "Auto delay entry two with more text", offsetY: 80},
]);
```

### Rich text markup

When `richText: true`, the text is parsed for `*bold*` markers:

- `*bold text*` renders with `fontWeight: 700`
- Non-starred segments use the configured `fontWeight`
- Asterisks are consumed and not rendered

### Segmented text

When `segmentedText: true`, each line is split by `;` into timed chunks. The `onTextSegment` callback fires after each chunk, typically used to play a click sound and wait:

```js
onTextSegment: (textLength) => {
  _.sound("Sounds/click.wav", 2);
  _.wait(Math.floor(textLength / 12 + 2) / 2);
}
```

### Visuals

```js
_.setBackgroundColor("#101020") // Set background at current time
_.newCircle(id, posX, posY) // Add a circle at (posX, posY) from center
_.newImage(id, src, posX, posY, width, height) // Add an image overlay at (posX, posY) from center
_.clear(id) // End all active events with matching id
_.centerText(idSet, posY) // Vertically center a group of ids around posY
```

### Timeline access

```js
_.getVisualTimeline() // â†’ visual events array
_.getAudioTimeline() // â†’ audio events array
_.getDuration() // â†’ total seconds
```

### Sound

```js
_.sound("Sounds/click.wav", volume) // Schedule a sound at the current time cursor; volume defaults to 1 if omitted
```

## Time model (important)

The `Engine` maintains a monotonically increasing `time` cursor. Everything is positioned relative to this cursor.

```js
_.wait(2) // time = 2
_.newText({...}) // text event starts at time = 2
_.wait(1) // time = 3
_.sound("Sounds/click.wav") // audio event starts at time = 3
_.clear(id) // text event ends at time = 3
```

**Rendering rule** (in `render.js`): an event is drawn when `t >= event.start && t < (event.end ?? Infinity)`.

**Recording rule** (in `record.js`): samples `FPS * duration` frames at `t = f / FPS`.

## Text rendering pipeline

1. Input text string
2. `tokenizeRichText()` — parse **bold** markers â†’ token array `[{text, bold}, ...]`
3. `chunkTokens()` — split tokens into word/space chunks
4. `splitLines()` — measure widths, wrap at maxWidth â†’ lines of chunks
5. `segTextLine()` — split chunks at ; (if segmentedText) â†’ `["wait", {text, bold}, ...]`
6. `pushTextLine()` — measure each segment, compute x-positions, push visual events
7. `render.js` — draw each text event at (width/2 + posX, height/2 + posY)

### Size hierarchy

- **Character** — atomic unit
- **Word** — contiguous non-space characters
- **Line** — wrapped words; removed trailing space
- **Paragraph** — all lines from one `newText` call
- **Section** — group of paragraphs sharing an id (ended by `clear`)

## Requirements

- **Node.js 18+** (ES modules: `"type": "module"`)
- **npm dependency**: `@napi-rs/canvas` (install via `npm install`)
- **FFmpeg** installed at:
  - `C:/ffmpeg/bin/ffmpeg.exe`

  If your FFmpeg path differs:
  - In `Engine/record.js`: update the `ffmpegPath` constant (or set the `FFMPEG_PATH` environment variable, which takes precedence)
  - In `Engine/addSounds.js`: set the `FFMPEG_PATH` environment variable, or update the default fallback

## Setup & run

From the project root:

```bash
npm install
node anim_template.js
```

This produces:

- `visual.mp4` — video-only output (no audio)
- `audio.mp4` — final video with mixed & delayed audio

### Creating a new animation

1. **Copy** `anim_template.js` â†’ `anim_my_scene.js` (or similar name).
2. **Import** the Engine and helpers:

   ```js
   import {Engine as _} from "../Anim/Engine/engine.js";
   import {record} from "../Anim/Engine/record.js";
   import {addSounds} from "../Anim/Engine/addSounds.js";
   ```

3. **Set CONFIG** (width, height, FPS).
4. **Set defaults** with `_.setProp({...})` and `_.setBackgroundColor(...)`.
5. **Build the timeline** with `_.newText()`, `_.wait()`, `_.sound()`, etc.
6. **Call** `await record(CONFIG, visual, duration, filename);` and `addSounds(audio, duration, filename);` to produce `visual.mp4` and `audio.mp4`.

**Always pass `import.meta.url` as the last argument** to `record()` and `addSounds()` — this ensures output files are written next to your animation script, not in a random CWD.

## Troubleshooting

| Symptom | Cause | Fix |
| - | - | - |
| `visual.mp4` not found | Ran `node Engine/record.js` directly | Run an `anim_*.js` script instead |
| FFmpeg not found | Path mismatch | Update `ffmpegPath` in `record.js` or set `FFMPEG_PATH` env var |
| Missing audio in output | `addSounds()` commented out | Uncomment `addSounds()` to enable it |
| Audio out of sync | Audio `start` depends on `time` cursor (includes all `_.wait()` calls) | Check that `_.wait()` calls before `_.sound()` match intended timing |
| Text not wrapping | `maxWidth` is `Infinity` by default | Set `_.setProp({maxWidth: 960})` before `_.newText()` |
| Bold not rendering | `richText` is `false` by default | Enable `_.setProp({richText: true})` or pass in `newText()` |
| "Missing audio file" | Sound path resolved relative to script dir, not CWD | Use paths like `"Sounds/click.wav"` (relative to script) |
| Last text disappears instantly | No `_.wait()` after the last `_.newText()` | Add `_.wait(sec)` to keep it visible |
| `setText` loses config | `textProp[id]` not set (e.g., `newText` never called for that id) | Ensure `_.newText()` was called with the same `id` before `_.setText()` |
| `callerPath` errors | Passed `import.meta.filename` instead of `import.meta.url` | Use `import.meta.url` (a `file://` URL) |
