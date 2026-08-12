# Anim

This project contains a Node.js/Canvas + FFmpeg pipeline to generate animated math videos with rich text, audio, and custom effects.

> **Agent tip:** For implementation notes, performance considerations, and editing guidance, see [AGENTS.md](./AGENTS.md).

## What each module does

### Animation scripts (`anim_*.js`)

Starter template — copy to create new animations.

Each `anim_*.js` file is a self-contained entry point that:

1. Creates a timeline using the `Engine` API (from `Engine/engine.js`).
2. Calls `record` and `addSounds` to encode `visual.mp4` and `audio.mp4`.

**Engine modules are NOT entry points.** Never run `node Engine/record.js` directly — always run an `anim_*.js` script that imports from `Engine/`.

### `package.json`

```json
{
    "type": "module",
    "dependencies": {
        "@napi-rs/canvas": "^0.1.97"
    }
}
```

### `Engine/engine.js`

Core timeline builder (global state, time cursor).

Exports the `Engine` object (aliased `_` in animation scripts), which maintains a global `time` cursor and accumulates `visual` and `audio` arrays.

### `Engine/textParser.js`

Handles text tokenization (bold, color, escape markup), width measurement, line wrapping, and segment splitting (configurable symbol for timed text chunks). Uses a module-level 1x1 canvas singleton for `measureText()` calls.

### `Engine/render.js`

Per-frame Canvas renderer (cached sort + binary search).

Takes the visual timeline and a time `t`, draws all active objects to a Canvas, and returns the Canvas. `record.js` then extracts `ImageData` via `canvas.getContext('2d').getImageData(...)` for FFmpeg streaming. Uses cached sorted events with binary search for efficient per-frame filtering.

**Cache caveat:** The sorted-events cache is invalidated when the `visual` array **reference** changes, not when its contents change. If you mutate the array in-place, use `_.getVisualTimeline()` to get the latest reference before rendering.

### `Engine/record.js`

Spawns FFmpeg, writes consecutive RGBA frames (at `CONFIG.FPS`) to stdin, and produces `visual.mp4`. Also preloads image assets referenced in the visual timeline (via `loadImageAsset()`), resolving paths relative to the calling script's directory.

```js
await record(CONFIG, visual, duration, callerPath)
```

- `CONFIG` — `{WIDTH, HEIGHT, FPS}` object
- `visual` — visual events array (from `_.getVisualTimeline()`)
- `duration` — total seconds (from `_.getDuration()`)
- `callerPath` — `import.meta.url` of the calling script; defaults to the calling file's directory
- Returns the path to the output file (`visual.mp4`)

### `Engine/addSounds.js`

Takes the audio timeline, delays each sound file via FFmpeg `adelay`, mixes them with `amix`, and produces `audio.mp4`. If no audio events have a `sound` property, it remuxes `visual.mp4` with a silent AAC track instead.

```js
addSounds(audio, duration, callerFilePath)
```

- `audio` — audio events array (from `_.getAudioTimeline()`)
- `duration` — total seconds (from `_.getDuration()`)
- `callerFilePath` — (optional) `import.meta.url` of the calling script; defaults to the calling file's directory

## Engine API

The `Engine` object is the core timeline builder. All methods modify a global state.

### Time management

```js
_.wait(sec) // Advance the time cursor by `sec` seconds
_.getDuration() // Total elapsed time
```

### Text

```js
_.newText(textConfig); // Add a text event at the current time cursor
_.setText(id, text) // Replace text of an existing id (clears old, creates new)
_.setProp({...}) // Set default properties for subsequent newText calls — merges into persistent defaults
_.changeProp({key: delta}) // Increment/decrement numeric default properties (e.g. {posY: 80}). Throws on non-numeric values.
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
| `boldSymbol` | `null` | Enable bold markup parsing with the selected symbol (e.g. `"*"`) |
| `colorSymbol` | `[]` | Enable color markup parsing with selected symbols (`[{color, symbol}]`) |
| `segmentSymbol` | `null` | Enable segment splitting with the selected symbol (e.g. `";"`) |
| `escapeSymbol` | `null` | Enable escaping special characters with the selected symbol (e.g. `"\\"`) |
| `flashDuration` | `0` | Flash duration on newly spawned text (disabled if 0) |
| `flashColor` | `"#FFFF60"` | Flash color on newly spawned text |
| `autoSetPosX` | `false` | Auto-increment `posX` for chained `newText` calls |
| `autoSetPosY` | `false` | Auto-increment `posY` for chained `newText` calls |
| `onTextSegment` | `() => {}` | Callback `(textLength) => void`. Fires when a `"wait"` marker is encountered during `pushTextLine()`, and once more at the end of `newText()` with the remaining accumulated `textLength`. |
| `fadeIn` | `0` | Fade-in duration (seconds) from transparent to full opacity |
| `fadeOut` | `0` | Fade-out duration (seconds) from full opacity to transparent |

Properties passed directly to `_.newText({...})` are merged on top of the persistent defaults set by `_.setProp()`.

#### `_.setText(id, text)`

Replaces text for an existing id: calls `_.clear(id, true)` to end the old event (skipping fade-out), then creates a new text event with the same prior configuration (except `flashDuration` is forced to `0`, `autoSetPosX` and `autoSetPosY` are forced to `false`, and `fadeIn` is forced to `0`). All other properties — including `fadeOut` — are preserved from the original `textProp[id]` config.

```js
function textDelay(length) {
    return Math.floor(length / 12 + 2) / 2;
}
```

### Text markup

Text markup is configured via symbol-based properties. Each markup type is enabled by setting its corresponding symbol property to a non-null (or non-empty) value. Symbols can be configured globally via `_.setProp()` or overridden per-call in `_.newText()`.

#### Bold markup (`boldSymbol`)

When `boldSymbol` is set (not null), the text is parsed for bold markers using that symbol. For example, with `boldSymbol: "*"`:

- `*bold text*` renders with `fontWeight: 700`
- Non-starred segments use the configured `fontWeight`
- The bold symbol characters are consumed and not rendered

#### Color markup (`colorSymbol`)

When `colorSymbol` is set to an array of `{color, symbol}` pairs, the text is parsed for color markers using those symbols. For example, with `colorSymbol: [{color: "#FF6060", symbol: "_"}]`:

- `_text_` between matching symbols renders with the specified `color`
- Colors stack and can be nested
- The symbol characters are consumed and not rendered

#### Segment splitting (`segmentSymbol`)

When `segmentSymbol` is set (not null), each line is split by that symbol into timed chunks. The `onTextSegment` callback fires after each chunk, typically used to play a click sound and wait:

```js
onTextSegment: (textLength) => {
  _.sound("Sounds/click.wav", 2);
  _.wait(Math.floor(textLength / 12 + 2) / 2);
}
```

#### Escaping special characters (`escapeSymbol`)

When `escapeSymbol` is set (not null), special characters (bold, color, and segment symbols) can be escaped by prefixing them with the escape symbol. For example, with `escapeSymbol: "\\"`:

- `\*` renders a literal `*` instead of starting bold
- `\_` renders a literal `_` instead of starting a color span
- `\;` renders a literal `;` instead of splitting a segment
- `\\` renders a literal `\`

> **Note:** The escape character itself is consumed during parsing — it does not appear in the rendered output. The next character after the escape is rendered verbatim (skipping bold/color/segment parsing).

```js
_.newText({text: "Use \\\\ to *escape*; special characters (like \\* or \\;)."});
```

#### Disabling markup per-call

Any markup symbol can be overridden per-call. To disable a globally-enabled markup for a specific text event, set the symbol to null in the `_.newText()` call:

```js
// Disable segment splitting for this text only
_.newText({text: "This has a ; that should not split.", segmentSymbol: null});
```

### Visuals

```js
_.setBackgroundColor("#101020") // Set background at current time
_.newCircle(id, posX, posY, diameter, color) // Add a circle at (posX, posY) from center with given diameter and color
_.newLine(id, posX, posY, lengthX, lengthY, lineWidth, color) // Add a line from (posX - lengthX/2, posY - lengthY/2) to (posX + lengthX/2, posY + lengthY/2)
_.newImage(id, src, posX, posY, width, height) // Add an image overlay at (posX, posY) from center
_.clear(id) // End all active events with matching id
_.centerText(idSet, posX = 0, posY = 0) // Reposition a group of ids so their bounding-box center moves to (posX, posY)
```

#### Visual element types

All visual events pushed to the timeline share this structure:

| `type` | Fields | Description |
| - | - | - |
| `"background"` | `color`, `start` | Fills the canvas with `color` from `start` onward |
| `"text"` | `text`, `posX`, `posY`, `fontSize`, `fontColor`, `fontWeight`, `fontFamily`, `fadeIn`, `fadeOut`, `flashDuration`, `flashColor`, `start`, `end?` | Renders a text segment |
| `"circle"` | `posX`, `posY`, `diameter`, `color`, `fadeIn`, `fadeOut`, `start`, `end?` | Draws a filled circle |
| `"line"` | `posX`, `posY`, `lengthX`, `lengthY`, `lineWidth`, `color`, `fadeIn`, `fadeOut`, `start`, `end?` | Draws a line centered at `(posX, posY)` |
| `"image"` | `src`, `posX`, `posY`, `width`, `height`, `fadeIn`, `fadeOut`, `start`, `end?` | Draws an image overlay |

### Timeline access

```js
_.getVisualTimeline() // Visual events array
_.getAudioTimeline() // Audio events array
_.getDuration() // Total seconds
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

**Rendering rule** (in `render.js`): an event is drawn when `t >= event.start && t < (event.end ?? Infinity)`. The `fadeIn` and `fadeOut` properties further modulate opacity within this window (see `getTextOpacity()`).

**Recording rule** (in `record.js`): samples `Math.ceil(FPS * duration)` frames at `t = f / FPS`.

## Text rendering pipeline

1. Input text string
2. `tokenizeBoldText()` — parse bold, color, and escape markers into token array `[{text, bold, color}, ...]`
3. `chunkTokens()` — split tokens into word/space chunks
4. `splitLines()` — measure widths, wrap at maxWidth
5. `segTextLine()` — split chunks at `segmentSymbol` (if not null) → `["wait", {text, bold, color}, ...]`
6. `pushTextLine()` — measure each segment, compute x-positions, push visual events. Calls `prop.onTextSegment(textLength)` when encountering `"wait"` markers.
7. `newText()` (in engine.js) — calls `prop.onTextSegment(textLength)` once at the end with the remaining accumulated text length
8. `render.js` — draw each text event at (width/2 + posX, height/2 + posY)

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

1. **Copy** `anim_template.js`.
2. **Import** the Engine and helpers:

   ```js
   import {Engine as _} from "./Engine/engine.js";
   import {record} from "./Engine/record.js";
   import {addSounds} from "./Engine/addSounds.js";
   ```

3. **Set CONFIG** (width, height, FPS).
4. **Set defaults** with `_.setProp({...})` and `_.setBackgroundColor(...)`.
5. **Build the timeline** with `_.newText()`, `_.wait()`, `_.sound()`, etc.
6. **Call** `await record(CONFIG, visual, duration, callerPath);` and `addSounds(audio, duration, callerFilePath);` to produce `visual.mp4` and `audio.mp4`.

**Always pass `import.meta.url` as the last argument** to `record()` and `addSounds()` — this ensures output files are written next to your animation script, not in a random CWD.

## Troubleshooting

| Symptom | Cause | Fix |
| - | - | - |
| `visual.mp4` not found | Ran `node Engine/record.js` directly | Run an `anim_*.js` script instead |
| FFmpeg not found | Path mismatch | Update `ffmpegPath` in `record.js` or set `FFMPEG_PATH` env var |
| Missing audio in output | `addSounds()` commented out | Uncomment `addSounds()` to enable it |
| Audio out of sync | Audio `start` depends on `time` cursor (includes all `_.wait()` calls) | Check that `_.wait()` calls before `_.sound()` match intended timing |
| Text not wrapping | `maxWidth` is `Infinity` by default | Set `_.setProp({maxWidth: 960})` before `_.newText()` |
| Bold not rendering | `boldSymbol` is `null` by default | Set `_.setProp({boldSymbol: "*"})` or pass in `newText()` |
| Segment not splitting | `segmentSymbol` is `null` by default | Set `_.setProp({segmentSymbol: ";"})` or pass in `newText()` |
| "Missing audio file" | Sound path resolved relative to script dir, not CWD | Use paths like `"Sounds/click.wav"` (relative to script) |
| Last text disappears instantly | No `_.wait()` after the last `_.newText()` | Add `_.wait(sec)` to keep it visible |
| `setText` loses config | `textProp[id]` not set (e.g., `newText` never called for that id) | Ensure `_.newText()` was called with the same `id` before `_.setText()` |
| `callerPath` errors | Passed `import.meta.filename` instead of `import.meta.url` | Use `import.meta.url` (a `file://` URL) |
| `changeProp` throws "Nonnumber values" | Passed a non-numeric delta or the property doesn't exist in `textConfig` | Ensure the property is numeric; use `setProp()` for non-numeric property changes |
| Image not showing | `loadImageAsset` failed silently | Check console warnings; ensure image path is relative to script dir and file exists |
| Text misaligned vertically | `alignY` not set correctly | Use `alignY: -1` (top), `0` (center), or `1` (bottom) |
| Text not centered horizontally | `posX` offsets not accounted for | Use `centerText()` to reposition a group after positioning |
