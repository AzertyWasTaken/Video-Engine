# Engine Internals

> Part of the [Anim documentation](../README.md#documentation).

Implementation notes for the `Engine/` modules. For usage, see [engine-api.md](./engine-api.md); for agent workflow and editing rules, see [AGENTS.md](../AGENTS.md).

## `Engine/param.js`

- Exports `Param` - the single source of default configs per type (`text`, `line`, `rect`, `circle`, `image`) plus an empty `addon` object.
- `id` defaults to `null` in every type: the engine auto-assigns a unique negative id when omitted.
- `duration` defaults to `null` in every type: `null` keeps the event until `clear()`, a number auto-ends it.
- `pushVisual()`/`newText()` merge per call: `const prop = {...Param[type], ...newProp}`.

## `Engine/state.js`

- Single home of the cross-module mutable state: the `visual`, `audio`, and `chapters` arrays, the `time` cursor (`getTime()` / `setTime()` / `advanceTime()`), `textProp` (last config per text id), and the auto-id counter (`nextAutoId()`, negative so user ids never collide). Arrays are exported as `const` and mutated in place - `getVisualTimeline()` must keep returning the same reference (render.js caches a sort keyed on it).

## `Engine/validate.js`

- Shared validation helpers: `toIdSet()` accepts a single id or a Set; `requireType()` guards every `Param[type]` access; `requireEvents()` builds the "no visual events with id" errors; `resolveDuration()` returns cursor + duration (null when absent) and, with `validateDuration()`, enforces finite non-negative durations.

## `Engine/visualEvents.js`

- **`VISUAL_FIELDS` + `pushVisual()`** - table-driven event creation for `line`/`rect`/`circle`/`image`; adding a visual type is one table entry plus a draw branch in `render.js`. Resolves the auto id, copies the listed fields, applies `duration` as `end`, and returns the id.
- **`getItemSize()` / `getGroupCenter()`** - bounding-box center used by `centerText()`/`moveTo()`; per-type size comes from `getItemSize()`: text = measured width x `fontSize`, rect/image = `width`/`height`, circle = `diameter`, line = `length + lineWidth`. Throws on unknown types. (The `rect` case was previously missing, so `centerText()` on a rect group threw.)

## `Engine/chapters.js`

- Owns the chapter list helpers behind `chapter()` / `scene()` / `getChapters()`. Chapters are `{name, start, end}` markers (`end: null` while open) - build-time metadata only, they never enter the `visual` array or the renderer.
- `addChapter(name)` rejects empty/duplicate names, closes the previous open chapter at the cursor, and pushes the new entry.
- `runScene(name, fn, opts)` validates `fn` and `opts.pad` (finite, non-negative), advances by `pad`, marks the chapter, runs `fn()`, and closes the chapter in a `finally` (a throwing scene still records its boundary, then rethrows).

## `Engine/tweens.js`

- Owns `TWEEN_KEYS`, the `tweenChains` Map, the `colorTweens` WeakMap, and the parsed-color `colorCache`, plus the `animate()` / `moveTo()` / `recolor()` implementations.
- **Property tweens** - `animate()`/`moveTo()` push `type: "tween"` events (`targetId`, `key`, `from`, `to`, `start`, `tweenEnd`, `easing`). `tweenChains` keeps the latest tween per `(id, key)`: a new tween reads the previous one's value at the cursor as its `from` and closes the previous window (`prev.end = time`), so chained tweens are continuous and windows never overlap. A tween holds its final value after `tweenEnd` until superseded (`end` unset = Infinity).
- **`moveTo()`** - set-prop tween: converts absolute targets to deltas, `delta = target - base - chainOffset`, where `base` is the bounding-box center of the id set for `posX`/`posY` and the value of the first matching event for other keys, so it composes with earlier tweens and with `centerText()`. Throws when no event with the id defines a targeted non-positional key.
- **Color tweens** - `recolor()` pushes one tween per matching event (`target` is the event reference, `color: {from, to}` are parsed RGB triplets). `colorTweens` (WeakMap) tracks the latest color tween per event for chaining. Hex only (`#RGB`/`#RRGGBB`), parsed once at build time and cached.
- **Tween events carry no `id`**, so id-based queries (`clear`, `centerText`, `getEvents`, `getGroupCenter`) never match them.

## `Engine/textEvents.js`

- Owns the `textLength` accumulator (module-local), `pushTextSegment()` / `pushTextLine()`, and the `newText()` implementation.
- **`pushTextSegment()` / `pushTextLine()`** - position each segment so lines stay center-aligned; `pushTextLine()` calls `prop.onTextSegment(textLength)` on `"wait"` markers (from segment splitting) and resets the accumulator. Both thread the optional `end` (from `duration`) into every segment event. Throws if parsing removed everything from a line.
- **`newText()`** - line height is `fontSize`; `posY` is adjusted for total height and `alignY`; `autoSetPosX`/`autoSetPosY` advance `Param.text.posX`/`posY` by the total rendered width/height. Returns the group id and stores the merged config in `textProp` for `setText()`.

## `Engine/engine.js`

- Public facade exporting the `Engine` object; all `_.` methods live here and delegate to the modules above. Own state is limited to the per-type checkpoint stacks (`propCheckpoints`) and the sound base path `audioFile` (defaults to the `engine.js` module directory).
- **`saveParam()` / `undoParam()`** - per-type stacks; `undoParam()` throws when the stack for that type is empty. `saveParam()` stores a shallow copy; nested objects (e.g. `styleSymbol`) stay shared by reference.
- **`withProp(newProp, type, fn)`** - snapshots the defaults, applies `newProp`, runs `fn()`, restores in a `finally` block. The multi-type form `withProp({text: {...}, circle: {...}}, fn)` snapshots and restores every involved type; `resolvePropEntries()` in `validate.js` detects a type-keyed map (all keys are type names with object values) and throws on a mix of type keys and property names. All types are validated before any default is mutated.
- **`waitUntilIdle()`** - advances the cursor to the latest `end` among events that are open at the cursor (`start <= now`, `end > now`). Skips tween and background events; ignores open-ended events (no `end`), so it is a no-op when nothing is durably open.
- **`setText(id, text, opts)`** - `opts.fade` crossfades, `opts.hold` advances the cursor after the swap; rewinds the cursor by `fade` (`Engine.wait(-fade)`) so old and new events overlap for a crossfade; throws a descriptive error when the id is unknown.
- **`clear(id, fading)`** - sets `end = now` on matching events that have not ended yet (`end` undefined or in the future; already-finished events keep their end, so re-clearing cannot resurrect them). This truncates `duration`-bearing events, which is what lets `setText()` crossfade them.
- **Validation** - `wait()`/`seek()` reject non-finite numbers and `playSound()` requires a string path (facade); `newText()` requires a string `text` (enforced in `textEvents.js`).

## `Engine/easing.js`

- Exports `Easing` (`linear`, `quad*`, `cubic*`, `sin*`, `expo*`, `circ*`, `back*`, `elastic*` - each in In/Out/InOut variants) and `getEasing(name | fn)`. Tween events store the resolved function, so the renderer never does string lookups per frame.

## `Engine/textParser.js`

- Creates a **1x1 canvas at module load** for `measureText()` calls. This is a singleton - do not add `createCanvas` calls inside functions; reuse the module-level `ctx`.
- **`tokenizeText(text, styleDefs, escapeCh)`** - produces `[{text, color, fontWeight}]` tokens. Styles use a stack (nesting/toggling); the escape character is kept in the output for downstream parsing while the next character is copied verbatim.
- **`wrapTextSegments(prop)`** takes only `prop` (the merged config). It splits tokens into word/space chunks, wraps at `maxWidth`, optionally balances the width (halving loop while `add >= 40`, re-running `splitLines()`), then applies segment splitting. Note: balancing mutates `prop.maxWidth` (the merged copy).
- **Line breaks** - `chunkTokens()` splits token text on `\n` and emits `{break: true}` markers between parts; `splitLines()` flushes the current line at each marker (blank lines collapse, trailing space chunks are dropped). Markers never reach `getSegmentsWidth()` / `segTextLine()`.
- **`getSegmentsWidth()`** is called per line in `pushTextLine()` and re-measures all segments - a performance hotspot with many text events.
- **`segTextLine()`** splits at `segmentSymbol` into `["wait", {text, color, fontWeight}, ...]` and consumes escape characters.

## `Engine/render.js`

- `setCanvas(WIDTH, HEIGHT)` is called by `record()`; `render()` throws `Missing canvas property` if it is not set.
- **Cached sort + binary search:** `getSortedEvents()` caches events sorted by `start`, keyed on the visual array **reference and length** - pushed events invalidate the cache, so rendering mid-build stays correct, while `record()` reuses one reference with a constant length, so the sort still happens once per render loop. If you mutate the array in place, keep using the same reference.
- `findFirstActive()` binary-searches the first event with `start > t`; per-frame cost is `O(log n + k)` for `k` active events. Avoid per-frame allocations when editing this file - it runs `FPS x duration` times.
- **Tween collection:** `collectTweens()` runs once per frame over the active window and fills two module-level maps - `tweenOffsets` (target id to `{key: value}` offsets) and `tweenColors` (event reference to a css color string) - cleared and reused each frame. Draw branches add `tw?.key ?? 0` offsets and prefer the color override for fill/stroke styles (the override also suppresses the text flash color).
- **Rect drawing calls `beginPath()`** - the canvas path persists across frames, so drawing rects without it accumulated path segments and produced ghost shapes once rects moved or disappeared.
- Background: one backward scan finds the active background (`start <= t < end`) and the previous background (crossfade underlay). While `fadeIn`/`fadeOut` progress, the active color is drawn with `globalAlpha` over the previous color; with no fades it is filled directly, opaque.
- `imageCache` is a `Map` keyed on the event's original `src`; `loadImageAsset(src, cacheKey)` lets preloading store under a different key than the resolved path.
- Opacity comes from `getTextOpacity()` (`fadeIn`/`fadeOut`); `globalAlpha` is reset to 1 after each object.

## `Engine/utils.js`

- Shared by `record.js` and `addSounds.js`: `ffmpegPath` (env `FFMPEG_PATH`, default `C:/ffmpeg/bin/ffmpeg.exe`) and `resolveCallerPath()` (handles `file://` URLs and plain paths, falls back to `process.cwd()`).

## `Engine/record.js`

- The frame loop writes RGBA `ImageData` buffers and waits for `drain` on backpressure; it rejects on a non-zero FFmpeg exit code and logs `Video complete` on success.

## `Engine/addSounds.js`

- **Synchronous** (`execFileSync`) and calls `process.exit()` on the remux path and on FFmpeg failure - unlike the async, streaming `record()`.
- `buildAudioFilterComplex()` - one delayed `adelay` + `volume` chain per audio event; input 0 is the video, inputs `1..N` are the sounds (index order matches the filter labels).
- `buildAmixFilter()` - `amix` with `duration=longest`, `normalize=0`, trimmed to the video duration with `atrim` when the duration is available.
- `resolveSoundFilePath()` returns the path string unchanged (no resolution); missing files throw an error listing the resolved path.

## Performance considerations

- `render.js` runs per frame - preserve the cached sort + binary search and avoid allocations; the tween maps are module-level and reused each frame.
- `getSegmentsWidth()` re-measures per line; extra text events multiply `measureText()` calls.
- `record()` streams frames to FFmpeg instead of buffering them; keep the drain handling.
