# Anim

This project contains a Node.js/Canvas + FFmpeg pipeline to generate animated math videos with rich text, audio, and custom effects.

## What each module does

### Animation scripts (`anim_*.js`)

Each `anim_*.js` file is a self-contained entry point that:

1. Creates a timeline using the `Engine` API (from `Engine/engine.js`)
2. Calls `record(CONFIG, visual, duration)` to encode `visual.mp4`
3. Optionally calls `addSounds(audio, duration)` to produce `audio.mp4`

### `Engine/engine.js`

Exports the `Engine` object (aliased `_` in animation scripts), which maintains a global `time` cursor and accumulates `visual` and `audio` arrays.

### `Engine/textParser.js`

Handles rich text tokenization (`*bold*` markup), width measurement, line wrapping, and segment splitting (`;` for timed text chunks).

### `Engine/render.js`

Takes the visual timeline and a time `t`, draws all active objects to a Canvas, and returns `ImageData`.

### `Engine/record.js`

Spawns FFmpeg, writes consecutive RGBA frames (at `CONFIG.FPS`) to stdin, and produces `visual.mp4`.

```js
record(CONFIG, visual, duration, callerPath)
```

- `CONFIG` — `{WIDTH, HEIGHT, FPS}` object
- `visual` — visual events array (from `_.getVisualTimeline()`)
- `duration` — total seconds (from `_.getDuration()`)
- `callerPath` — (optional) `import.meta.url` of the calling script; defaults to the calling file's directory

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
_.getDuration() // → total elapsed time
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
| `onTextSegment` | `() => {}` | Callback per segment `(textLength) => void` |

Properties passed directly to `_.newText({...})` are merged on top of the persistent defaults set by `_.setProp()`.

#### `_.setText(id, text)`

Replaces text for an existing id: calls `_.clear(id)` to end the old event, then creates a new text event with the same prior configuration (except `effect` and `autoSetPosY` are forced to `false`).

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
_.clear(id) // End all active events with matching id
_.centerText(idSet, posY) // Vertically center a group of ids around posY
```

### Timeline access

```js
_.getVisualTimeline() // → visual events array
_.getAudioTimeline() // → audio events array
_.getDuration() // → total seconds
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
2. `tokenizeRichText()` — parse **bold** markers → token array `[{text, bold}, ...]`
3. `chunkTokens()` — split tokens into word/space chunks
4. `splitLines()` — measure widths, wrap at maxWidth → lines of chunks
5. `segTextLine()` — split chunks at ; (if segmentedText) → `["wait", {text, bold}, ...]`
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
  - In `Engine/record.js`: update the `ffmpegPath` constant
  - In `Engine/addSounds.js`: set `FFMPEG_PATH` environment variable, or update the default fallback

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

1. Copy `anim_template.js` as a starting template.
2. Import `Engine as _` from `"./Engine/engine.js"`, `record` from `"./Engine/record.js"`, and `addSounds` from `"./Engine/addSounds.js"`.
3. Set `CONFIG` (width, height, FPS).
4. Build the timeline with `_.newText`, `_.wait`, `_.sound`, etc.
5. Call `await record(CONFIG, visual, duration)` and `addSounds(audio, duration)`.

## Troubleshooting

| Symptom | Likely fix |
| - | - |
| `visual.mp4` not found | Run `node anim_template.js` first (not `node record.js` directly) |
| FFmpeg not found | Check `ffmpegPath` in `Engine/record.js` (default: `C:/ffmpeg/bin/ffmpeg.exe`) |
| Missing audio in output | Ensure `addSounds(audio, duration)` is uncommented in the animation script |
| Audio events out of sync | Audio `start` depends on the `time` cursor (includes all `_.wait()` calls) |
| Text not wrapping | Set `maxWidth` via `_.setProp({maxWidth: 960})` before calling `_.newText` |
| Bold not rendering | Enable `richText: true` in `_.setProp()` or the `newText` call |
| "Missing audio file" errors | Place `.wav`/`.mp3` files in the correct folder and reference with a path relative to the animation script (e.g. `"Sounds/click.wav"`) |
