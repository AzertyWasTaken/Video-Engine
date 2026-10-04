# Engine Internals

> Part of the [Anim documentation](../README.md#documentation).

Implementation notes for the `Engine/` modules. For usage, see [engine-api.md](./engine-api.md); for agent workflow and editing rules, see [AGENTS.md](../AGENTS.md).

## `Engine/param.js`

- Exports `Param` - the single source of default configs per type (`text`, `line`, `rect`, `circle`, `image`), plus a shared `global` section and an empty `addon` object.
- `global` holds the ten `GLOBAL_KEYS` (`id`, `posX`, `posY`, `rotation`, `alignX`, `alignY`, `fadeIn`, `fadeOut`, `opacity`, `duration`). Every type declares those keys as `undefined` and inherits the global value while it stays undefined: `effectiveParam(type, key)` resolves one key, `mergeParam(type, newProp)` resolves a whole merge. `opacity` is validated as a finite number from `0` to `1`; `rotation` defaults to `0` and is validated as a finite number of degrees. `null` does not inherit - `id: null` still auto-assigns an ids array with one unique negative id, `duration: null` still keeps the event until `clear()` while a number auto-ends it.
- `global` is addressable as a type: `setProp()`/`changeProp()`/`getProp()`/`saveParam()`/`withProp()` accept `"global"` (and `{global: {...}}` in the multi-type form).
- `pushVisual()`/`newText()` merge per call: `const prop = mergeParam(type, newProp)` - type defaults, then `newProp`, then undefined `GLOBAL_KEYS` filled from `Param.global`.

## `Engine/state.js`

- Single home of the cross-module mutable state: the `visual`, `audio`, and `chapters` arrays, the `time` cursor (`getTime()` / `setTime()` / `advanceTime()`), `textProp` (last config per text id, stored under each id the text carries), the `assetMap` shorthand registry (see `assets.js`), and the auto-id counter (`nextAutoId()`, negative so user ids never collide). Arrays are exported as `const` and mutated in place - `getVisualTimeline()` must keep returning the same reference (render.js caches a sort keyed on it).

## `Engine/validate.js`

- Shared validation helpers: `toIdArray()` accepts a single id or an array; `normalizeIds()` validates and dedupes a creation `id` (single or array) into an ids array, returning `null` when unset so the caller auto-assigns one; `matchesIds()` reports whether an event carries any queried id (id-less tween/background events never match); `requireType()` guards every `Param[type]` access; `requireEvents()` builds the "no visual events with id" errors; `resolveDuration()` returns cursor + duration (null when absent) and, with `validateDuration()`, enforces finite non-negative durations; `validateOpacity()` enforces a finite value from `0` to `1`; `validateRotation()` enforces a finite number of degrees (rotation is unbounded - negative and >360 values are valid); `normalizePositions()` validates a line's vertex array into a fresh copy - each axis is optional and must be a finite number when present, so a missing axis normalizes to `0`; `validateScales()` enforces finite line `scaleX`/`scaleY`; `validateLoop()` enforces a boolean line `loop`.

## `Engine/visualEvents.js`

- **`VISUAL_FIELDS` + `pushVisual()`** - table-driven event creation for `line`/`rect`/`circle`/`image`; adding a visual type is one table entry plus a draw branch in `render.js`. Resolves the ids (`normalizeIds()` or one auto id), stores them as `ids` on the event, copies the listed fields (including inherited `opacity` and `rotation`), validates `scaleX`/`scaleY`/`loop` and normalizes `positions` for lines (a `loop` line needs at least 3 vertices, which throws at build time), bakes `alignX`/`alignY` into `posX`/`posY` so the bounding box lands on the chosen side of the anchor, applies `duration` as `end`, and returns the ids array.
- **`getItemBox()` / `getGroupCenter()`** - bounding box of one event relative to its anchor (from `getItemBox()`) and the bounding-box center of all events sharing a queried id, used by `centerText()`/`moveTo()`; per-type box: text = measured width x `fontSize`, rect/image = `width`/`height`, circle = `diameter`, line = `scaleX`/`scaleY`-scaled vertex extents + `lineWidth` (empty `positions` = `lineWidth` only). Throws on unknown types. (The `rect` case was previously missing, so `centerText()` on a rect group threw.)

## `Engine/assets.js`

- Owns the shorthand registry: `setAssets(newMap)` **replaces** the whole `assetMap` (never merges, so the map is always the current one) and validates that the argument is a plain object with non-empty string keys and values. `getAssets()` returns the live `Map`, mirroring `getChapters()`.
- **`resolveAsset(src, baseDir)`** is the single resolution point shared by `record.js` and `addSounds.js`, in precedence order: registered shorthand -> absolute path (as-is) -> `path.join(baseDir, src)`. Unregistered shorthands are not an error; they fall through to the path rules, so plain relative paths keep working. Throws `TypeError` on an empty / non-string `src`.
- Because resolution happens in the pipeline, events store paths **as written** and the timeline stays free of machine-specific absolute paths. This replaced `setAudioFile()` and its build-time `path.join` in `playSound()`.

## `Engine/chapters.js`

- Owns the chapter list helpers behind `chapter()` / `scene()` / `getChapters()`. Chapters are `{name, start, end}` markers (`end: null` while open) - build-time metadata only, they never enter the `visual` array or the renderer.
- `addChapter(name)` rejects empty/duplicate names, closes the previous open chapter at the cursor, and pushes the new entry.
- `runScene(name, fn, opts)` validates `fn` and `opts.pad` (finite, non-negative), advances by `pad`, marks the chapter, runs `fn()`, and closes the chapter in a `finally` (a throwing scene still records its boundary, then rethrows).

- `findChapter(name, duration)` looks a chapter up by name (returns a copy, not the state entry) and resolves an open `end` to the total duration; `chapterFileName(prefix, name)` builds the sanitized `visual_<name>.mp4` / `audio_<name>.mp4` names used by `record.js` / `addSounds.js`.

## `Engine/tweens.js`

- Owns `TWEEN_KEYS` (`posX`, `posY`, `rotation`, `fontSize`, `diameter`, `width`, `height`, `scaleX`, `scaleY`, `lineWidth`, `strokeWidth`, `opacity`), the `propTweens` WeakMap (latest property tween per drawable event), the `colorTweens` WeakMap, and the parsed-color `colorCache`, plus the `animate()` / `moveTo()` / `recolor()` implementations.
- **Property tweens** - `animate()`/`moveTo()` resolve the matched object set once (`matchedObjects()`: every drawable event sharing a queried id, exactly once - non-sharing objects are ignored) and push one `type: "tween"` event per `(object, key)` (`target`, `key`, `from`, `to`, `start`, `tweenEnd`, `easing`). `propTweens` keeps the latest tween per `(object, key)`: a new tween reads the previous one's value at the cursor as its `from` and closes the previous window (`prev.end = time`), so chained tweens are continuous and windows never overlap. A tween holds its final value after `tweenEnd` until superseded (`end` unset = Infinity). Objects that do not define the key are skipped, and objects created after the call are never targeted by it.
- **`moveTo()`** - set-prop tween: absolute end values, `to = target - base`, where `base` is the bounding-box center of the id set for `posX`/`posY` (one uniform offset for the whole group) and the object's own base value for other keys, so it composes with earlier tweens and with `centerText()`. Throws when no matched object defines a targeted non-positional key. `opacity` is the one range-checked target (`validateOpacity`, `0`..`1`) because it is absolute; `animate()` deltas are only checked for finiteness, since a delta's valid range depends on the value it starts from.
- **Color tweens** - `recolor()` pushes one tween per matching event (`target` is the event reference, `color: {from, to}` are parsed RGB triplets). `colorTweens` (WeakMap) tracks the latest color tween per event for chaining. Hex only (`#RGB`/`#RRGGBB`), parsed once at build time and cached.
- **Tween events carry a `target` reference and no `ids`**, so id-based queries (`clear`, `centerText`, `getEvents`, `getGroupCenter`) never match them. `getPropertyOffset()` exposes the current chain value for `setText()`'s offset baking (see `engine.js`).

## `Engine/textEvents.js`

- Owns the `textLength` accumulator (module-local), `pushTextSegment()` / `pushTextLine()`, and the `newText()` implementation.
- **`pushTextSegment()` / `pushTextLine()`** - position each segment so lines stay centered, shifted sideways by `alignX`; `pushTextLine()` calls `prop.onTextSegment(textLength)` on `"wait"` markers (from segment splitting) and resets the accumulator. Both thread the optional `end` (from `duration`) into every segment event. Throws if parsing removed everything from a line. Every segment event also stores `anchorX`/`anchorY` (the merged config's `posX`/`posY`): the baked `posX`/`posY` are pixel offsets measured from that anchor, which is what lets `render.js` rescale the layout when `fontSize` is tweened, and the same anchor is the pivot `render.js` rotates text about. `rotation` is copied onto each segment event from the merged config.
- **`newText()`** - line height is `fontSize`, plus `lineGap` extra space between lines; `posY` is adjusted for total height and `alignY`; `autoSetPosX`/`autoSetPosY` advance `Param.text.posX`/`posY` by the total rendered width/height. Normalizes `id` (single or array) into the ids array, returns it, and stores the merged config in `textProp` under each id for `setText()` after layout succeeds.

## `Engine/engine.js`

- Public facade exporting the `Engine` object; all `_.` methods live here and delegate to the modules above. Own state is limited to the per-type checkpoint stacks (`propCheckpoints`).
- **`saveParam()` / `undoParam()`** - per-type stacks; `undoParam()` throws when the stack for that type is empty. `saveParam()` stores a shallow copy; nested objects (e.g. `styleSymbol`) stay shared by reference.
- **`withProp(newProp, type, fn)`** - snapshots the defaults, applies `newProp`, runs `fn()`, restores in a `finally` block. The multi-type form `withProp({text: {...}, circle: {...}}, fn)` snapshots and restores every involved type; `resolvePropEntries()` in `validate.js` detects a type-keyed map (all keys are type names with object values) and throws on a mix of type keys and property names. All types are validated before any default is mutated.
- **`getProp(key, type)`** returns the effective value (the `global` fallback applied); `getGlobalProp(type)` returns the raw object where inherited keys are `undefined`.
- **`waitUntilIdle()`** - advances the cursor to the latest `end` among events that are open at the cursor (`start <= now`, `end > now`). Skips tween and background events; ignores open-ended events (no `end`), so it is a no-op when nothing is durably open.
- **`setText(id, text, opts)`** - looks the stored config up through any queried id; `opts.fade` crossfades, `opts.hold` advances the cursor after the swap; rewinds the cursor by `fade` (`Engine.wait(-fade)`) so old and new events overlap for a crossfade; bakes the replaced text's current tween offsets (`getPropertyOffset()`) into the replacement props - over `posX`, `posY`, `rotation`, `fontSize`, `opacity` - so a tweened text keeps its position and angle instead of snapping back; throws a descriptive error when no queried id is known.
- **`clear(id, fading)`** - sets `end = now` on matching events that have not ended yet (`end` undefined or in the future; already-finished events keep their end, so re-clearing cannot resurrect them). This truncates `duration`-bearing events, which is what lets `setText()` crossfade them.
- **Validation** - `wait()`/`seek()` reject non-finite numbers and `playSound()` requires a string path (facade); `newText()` requires a string `text` (enforced in `textEvents.js`).
- **`playSound()` / `setAssets()`** - `playSound()` pushes `{sound, volume, start}` with the path **verbatim** (no build-time joining); `setAssets()` / `getAssets()` delegate to `assets.js` for the shorthand map used by both sounds and images.

## `Engine/easing.js`

- Exports `Easing` (`linear`, `quad`, `cubic`, `sin`, `expo`, `circ`, `back`, `elastic`), every curve in its base **in** form, plus `getEasing(name | fn, direction)`. The direction wraps the resolved curve: `"in"` (default) returns it unchanged, `"out"` mirrors it (`1 - fn(1 - t)`), `"inOut"` scales each half (`fn(2t) / 2`, then `1 - fn(2 - 2t) / 2`); anything else throws. Tween events store the resolved function, so the renderer never does string lookups per frame.

## `Engine/textParser.js`

- Creates a **1x1 canvas at module load** for `measureText()` calls. This is a singleton - do not add `createCanvas` calls inside functions; reuse the module-level `ctx`.
- **`tokenizeText(text, styleDefs, escapeCh)`** - produces `[{text, color, fontWeight}]` tokens. Each `styleDefs` entry is `{openSymbol, closeSymbol?, color?, fontWeight?}`; symbols are matched as whole strings (so several symbols in a row can be required) and `closeSymbol` defaults to `openSymbol`, making that entry a toggle. Entries are indexed by their first character, longest symbol first, so `**` wins over `*` at the same position; a symbol declared by two entries throws. Styles use a stack: `open` pushes, `close` pops the innermost region (and stays literal text when no region is open), and a toggle pushes unless the same entry is already on top. The escape character is kept in the output for downstream parsing while the next character is copied verbatim, which also breaks a multi-symbol match when it escapes the first character.
- **`wrapTextSegments(prop)`** takes only `prop` (the merged config). It splits tokens into word/space chunks, optionally auto-sizes the text on one line, wraps at `maxWidth`, optionally balances the width (halving loop while `add >= 40`, re-running `splitLines()`), then applies segment splitting. Auto-sizing removes hard-break markers, measures visible segments (including styled weights and consumed segment/escape markers), and binary-searches the largest positive `fontSizeStep` multiple within `maxWidth`. Note: balancing mutates `prop.maxWidth` (the merged copy).
- **Line breaks** - `chunkTokens()` splits token text on `\n` and emits `{break: true}` markers between parts; `splitLines()` flushes the current line at each marker (blank lines collapse, trailing space chunks are dropped). Markers never reach `getSegmentsWidth()` / `segTextLine()`.
- **`getSegmentsWidth()`** is called per line in `pushTextLine()` and re-measures all segments - a performance hotspot with many text events.
- **`segTextLine()`** splits at `segmentSymbol` into `["wait", {text, color, fontWeight}, ...]` and consumes escape characters.

## `Engine/render.js`

- `setCanvas(WIDTH, HEIGHT, SCALE = 1)` is called by `record()`; `render()` throws `Missing canvas property` if it is not set. `width`/`height` stay **logical** (the design space), while `pixelWidth`/`pixelHeight` hold `Math.round(WIDTH * SCALE)` / `Math.round(HEIGHT * SCALE)`. The context transform `setTransform(pixelWidth / WIDTH, 0, 0, pixelHeight / HEIGHT, 0, 0)` maps the logical space onto the larger buffer, so raising `SCALE` sharpens the output without moving anything; it is set once here because the transform persists across frames on the same context. It is derived from the **rounded** pixel size rather than from `SCALE`, so a fractional `SCALE` (1.5) tiles the frame onto the buffer exactly with no sub-pixel seam.
- `getPixelSize()` returns the encoded resolution in device pixels for `record()`; `getImageData()` and FFmpeg's `-video_size` are unaffected by the transform, so they must use this size, not the logical one.
- **Cached sort + binary search:** `getSortedEvents()` caches events sorted by `start`, keyed on the visual array **reference and length** - pushed events invalidate the cache, so rendering mid-build stays correct, while `record()` reuses one reference with a constant length, so the sort still happens once per render loop. If you mutate the array in place, keep using the same reference.
- `findFirstActive()` binary-searches the first event with `start > t`; per-frame cost is `O(log n + k)` for `k` active events. Avoid per-frame allocations when editing this file - it runs `FPS x duration` times.
- **Tween collection:** `collectTweens()` runs once per frame over the active window and fills two module-level maps - `tweenOffsets` (target event reference to `{key: value}` offsets) and `tweenColors` (event reference to a css color string) - cleared and reused each frame. Draw branches read `tweenOffsets.get(obj)` and add `tw?.key ?? 0` offsets, and prefer the color override for fill/stroke styles (the override also suppresses the text flash color).
- **Text layout scaling:** segment positions and line spacing are baked as pixel offsets in `posX`/`posY` at build time, so the text branch rescales them when a `fontSize` tween is active: `anchor + (posX - anchor) * (fontSize / baseFontSize)`, using the event's `anchorX`/`anchorY`. Without it the glyphs resize but keep their old spacing. The factor is linear, which matches `measureText()` (widths are linear in font size to ~0.01px), and the branch is skipped entirely when no font size is tweened. `centerText()` shifts `anchorX`/`anchorY` with `posX`/`posY` so the pivot travels with a repositioned group.
- **Rotation:** each object draws inside a `save()` / `translate(pivot)` / `rotate(deg * PI / 180)` / `translate(-pivot)` / `restore()` bracket, added right after the alpha is set and closed before the `globalAlpha = 1` reset. The pivot is `anchorX`/`anchorY` when present (text) and `posX`/`posY` otherwise - for shapes that is already the bounding-box center, so rotation never moves a group's center. **The bracket is entered only when `rotation !== 0`** (base value plus tween offset), so unrotated objects - the default for the whole engine - pay nothing, and no per-frame object is allocated. `getItemBox()` stays rotation-unaware (widths/heights/positions stay unrotated), which is why alignment baking and `centerText()` still use the unrotated box.
- **Rect drawing calls `beginPath()`** - the canvas path persists across frames, so drawing rects without it accumulated path segments and produced ghost shapes once rects moved or disappeared.
- **Line drawing** - the polyline walks `positions` with each vertex scaled by `scaleX`/`scaleY` (plus their tweened offsets) and strokes it with the tweened `lineWidth`; fewer than 2 vertices skips the draw entirely. `loop` calls `closePath()` after the last vertex, which strokes one segment back to the first - the closing segment is a chord between existing vertices, so it never leaves the bounding box used by `getItemBox()`.
- Background: one backward scan finds the active background (`start <= t < end`) and the previous background (crossfade underlay). Background events are excluded from the object-drawing loop, so object `opacity` never applies to them. While `fadeIn`/`fadeOut` progress, the active color is drawn with `globalAlpha` over the previous color; with no fades it is filled directly, opaque.
- `imageCache` is a `Map` keyed on the event's original `src`; `loadImageAsset(src, cacheKey)` lets preloading store under a different key than the resolved path.
- Opacity comes from `getObjectOpacity()`: each object's stored `opacity` plus its tween offset from `tweenOffsets`, **clamped to `0`..`1`**, multiplied by its `fadeIn`/`fadeOut` progress, and `globalAlpha` is reset to 1 after each object. The clamp is load-bearing: canvas ignores out-of-range `globalAlpha`, so an unclamped overshooting easing (`back` / `elastic`) would leave the previous object's alpha in place instead of drawing. The `tw` lookup is hoisted above this call so the offset is available; no extra per-frame allocation.

## `Engine/utils.js`

- Shared by `record.js` and `addSounds.js`: `ffmpegPath` (env `FFMPEG_PATH`, default `C:/ffmpeg/bin/ffmpeg.exe`) and `resolveCallerPath()` (handles `file://` URLs and plain paths, falls back to `process.cwd()`).

## `Engine/record.js`

- The frame loop writes RGBA `ImageData` buffers (sized from `getPixelSize()`, i.e. the `SCALE`-multiplied resolution) and waits for `drain` on backpressure; it rejects on a non-zero FFmpeg exit code and logs `Video complete` on success.
- `CONFIG.SCALE` is optional (default `1`) and validated by `renderVideo()` in `pipeline.js` as a positive finite number. `record()` passes it to `setCanvas()` and takes the resulting pixel size from `getPixelSize()` for `-video_size` and `getImageData()`; the FFmpeg argument order is otherwise untouched.
- `opts.chapter` narrows the render to one chapter window: frames are sampled at `t = start + f / FPS`, only images overlapping the window are preloaded, and the output goes to `visual_<name>.mp4`.
- Image preload resolves each `src` with `resolveAsset(img.src, videoDir)`, so shorthands and script-relative paths both work; the image is still cached under the **original** `src` so `render.js` can look it up. An empty `src` is skipped with a warning rather than attempting to load the directory.

## `Engine/addSounds.js`

- **Synchronous** (`execFileSync`) and calls `process.exit()` on the remux path and on FFmpeg failure - unlike the async, streaming `record()`.
- `buildAudioFilterComplex()` - one delayed `adelay` + `volume` chain per audio event; input 0 is the video, inputs `1..N` are the sounds (index order matches the filter labels, delays relative to the chapter start offset).
- `opts.chapter` reads `visual_<name>.mp4` and writes `audio_<name>.mp4`, keeps only audio events with `start` inside the window, and trims the mix to the chapter length.
- `buildAmixFilter()` - `amix` with `duration=longest`, `normalize=0`, trimmed to the video duration with `atrim` when the duration is available.
- `resolveSoundFilePath()` validates the `sound` string then defers to `resolveAsset(sound, baseDir)`, where `baseDir` is the calling script's directory (passed to `appendAudioInputArgs()`); missing files throw an error listing the resolved path.

## Performance considerations

- `render.js` runs per frame - preserve the cached sort + binary search and avoid allocations; the tween maps are module-level and reused each frame.
- `getSegmentsWidth()` re-measures per line; extra text events multiply `measureText()` calls.
- `record()` streams frames to FFmpeg instead of buffering them; keep the drain handling.
