# Engine API Reference

> Part of the [Anim documentation](../README.md#documentation).

The `Engine` object (from `Engine/engine.js`, aliased `_` in animation scripts) is the core timeline builder. All methods operate on **global state**: a monotonically increasing `time` cursor plus `visual` and `audio` event arrays.

```js
import {Engine as _} from "./Engine/engine.js";
```

## Time management

```js
_.wait(sec)          // Advance the time cursor by `sec` seconds (0 if omitted)
_.seek(t)            // Jump the time cursor to absolute time t (seconds)
_.waitUntilIdle()    // Advance the cursor past the latest open event (no-op when none are open)
_.getDuration()      // Total elapsed time (current time cursor value)
```

## Time model

Every event is positioned at the **current** `time` cursor. `_.wait()` advances it and `_.seek()` sets it directly. Events can also end on their own via the `duration` property (see below).

```js
_.wait(2)                        // time = 2
_.newText({...})                 // text event starts at time = 2
_.wait(1)                        // time = 3
_.playSound("Sounds/click.wav")  // audio event starts at time = 3
_.clear(id)                      // text event ends at time = 3
```

> **Gotcha:** If you forget a final `_.wait()`, the last events have zero visible duration. Alternatively give the last event a `duration` and call `_.waitUntilIdle()`.

`waitUntilIdle()` pairs with the `duration` property to remove duplicated numbers from scripts. It scans for events that are open at the cursor (`start <= time`, `end > time`) and advances to the latest such `end`:

```js
_.newText({text: "Hello", duration: 2});
_.waitUntilIdle();  // time = 2, no matter what duration the text has
```

- Background events and tween events never hold the cursor.
- Open-ended events (no `duration`, not yet cleared) are ignored - their end is unknowable.

## Scenes & chapters

```js
_.chapter(name)                    // Mark a chapter boundary at the current time
_.scene(name, fn, opts)            // Mark a chapter, run fn(), close the chapter at the cursor
_.getChapters()                    // All chapter entries [{name, start, end}]
```

- `chapter(name)` closes the previous chapter at the current time and pushes `{name, start, end: null}`. Names must be unique and non-empty (duplicate names throw).
- `scene(name, fn, opts)` is `chapter(name)` + `fn()` + closing the chapter at whatever the cursor reached (`end` is set even when `fn()` throws, then the error rethrows). `opts.pad` (default `0`) advances the cursor before the scene starts - breathing room between scenes. Returns the chapter entry.

```js
_.scene("intro", () => {
    _.newText({text: "Welcome", duration: 2});
    _.waitUntilIdle();
}, {pad: 0.5});
// _.getChapters() -> [{name: "intro", start: 0.5, end: 2.5}]
```

Scenes are a naming/marking layer only: the time cursor and `Param` defaults stay global inside `fn()`. Combine with `withProp()` for scoped defaults.

## Ids & return values

Visual creators (`newText`, `newLine`, `newRect`, `newCircle`, `newImage`) **return the group id**. When `id` is omitted, a unique negative integer is auto-assigned, so elements can be captured and cleared without manual bookkeeping:

```js
const title = _.newText({text: "Hello"});  // id auto-assigned
_.clear(title);
```

## Property defaults

Default properties per type (`"text"`, `"line"`, `"rect"`, `"circle"`, `"image"`) live in `Engine/param.js` and persist across calls. Properties passed directly to `newText()` etc. are merged on top for that call only.

```js
_.setProp(newProp, type = "text")          // Merge keys into the persistent defaults
_.changeProp({key: delta}, type = "text")  // Increment numeric defaults; throws on non-numeric
_.getProp(key, type = "text")              // Get one default property value
_.getGlobalProp(type = "text")             // Get the full defaults object for a type
_.saveParam(type = "text")                 // Push a checkpoint of this type's defaults
_.undoParam(type = "text")                 // Pop the last checkpoint of this type
_.withProp(newProp, type, fn)              // Scoped defaults: apply, run fn(), restore
_.withProp({type: newProp, ...}, fn)       // Scoped defaults for multiple types at once
```

- `changeProp()` throws `Nonnumber values are not accepted` if the current value or the delta is not finite. Use `setProp()` for non-numeric properties.
- Checkpoint stacks are **per type**: `saveParam("circle")` pairs with `undoParam("circle")`, and mixing types cannot pop the wrong checkpoint. `undoParam()` throws when no checkpoint exists for the type.
- `withProp(newProp, fn)` defaults to `type: "text"`. The snapshot is restored in a `finally` block, even when `fn()` throws:

```js
_.withProp({fontSize: 40, fontColor: "#FF6060"}, () => {
    _.newText({text: "Small red text"});
    _.wait(1);
});
// Defaults restored here
```

- **Multi-type form:** pass a type-keyed object as the only props argument (`_.withProp({text: {...}, circle: {...}}, fn)`). Every type involved is snapshotted, changed, and restored together:

```js
_.withProp({text: {fontSize: 60}, circle: {color: "#FFE040", diameter: 60}}, () => {
    _.newText({text: "Big text"});
    _.newCircle({duration: 1});
    _.wait(1);
});
// Both text and circle defaults restored here
```

  The multi-type form is detected by shape (via `resolvePropEntries()` in `validate.js`): it applies when the object is non-empty, every key names a property type, and every value is an object. So `_.withProp({text: "Hello"}, fn)` is still a single-type text call and `_.withProp(newProp, "circle", fn)` still works. All types are validated **before** any default is changed, so a bad type key throws without leaving earlier types mutated, and a mix of type keys and property names (`{circle: {...}, posY: 100}`) throws instead of being silently misapplied.

## Text

```js
_.newText(newProp)                       // Add a text event; returns the group id
_.setText(id, text, opts = {})           // Replace text of an existing id with a crossfade
```

### `_.newText(newProp)`

Adds one text event; see [text.md](./text.md) for the full property table, markup, and rendering pipeline. Common properties: `id` (auto-assigned when omitted), `duration` (auto-end), `fadeIn`/`fadeOut`.

### `_.setText(id, text, opts = {})`

Replaces the text of an existing id. `opts.fade` (default `0`) crossfades old text out and new text in; `opts.hold` (default `0`) advances the cursor after the swap:

1. `_.clear(id, fade)` - ends the old event at the current time with `fadeOut = fade`.
2. Rewinds the cursor by `fade`, then creates a new text event at the rewound time with `fadeIn = fade` (a crossfade), reusing the config stored from the last `_.newText()` call with that id. Forces `flashDuration: 0`, `autoSetPosX: false`, `autoSetPosY: false`; all other properties - including `duration` and `fadeOut` - are preserved from the stored config.
3. Re-advances the cursor by `fade`, then advances it by `hold`.

```js
const title = _.newText({text: "Before"});
_.wait(1);
_.setText(title, "After", {fade: 0.5, hold: 2});  // crossfade, then hold 2s
_.clear(title);
```

`textProp[id]` must exist: call `_.newText()` with the same `id` before `_.setText()` (the id returned by `newText()` works). Throws a descriptive error otherwise.

## Visuals

```js
_.setBackgroundColor(color, opts = {})     // Add a background event at the current time
_.newLine(newProp)                          // Line centered at (posX, posY) with vector (lengthX, lengthY)
_.newRect(newProp)                          // Rectangle centered at (posX, posY)
_.newCircle(newProp)                        // Circle at (posX, posY)
_.newImage(newProp)                         // Image overlay at (posX, posY)
_.clear(id, fadeOut)                        // End all active events with matching id
_.centerText(id, posX = null, posY = null)  // Reposition a group so its bounding-box center moves to (posX, posY)
_.getEvents(id)                             // All visual events with matching id (array copy)
```

- All creators accept `duration` (seconds until the event auto-ends) and **return the group id**.
- `setBackgroundColor(color, opts)` accepts `{fadeIn, fadeOut, duration}`: the new color fades in over the previous background, `fadeOut` reverses the fade before the event ends, and a `duration` auto-ends it (the previous color shows again).
- `id` for `clear()`, `centerText()`, and `getEvents()` accepts a single id or a `Set` of ids.
- `clear()` sets `end` to the current time on matching events that have not ended yet (`end` stays put on already-finished events); if `fadeOut` is given it overrides each event's `fadeOut`.
- `centerText()` moves each axis independently - an axis is skipped when its argument is `null`. Works for text, rects, circles, lines, and images.
- See [visuals.md](./visuals.md) for property tables, element types, and rendering geometry.

## Animation

```js
_.animate(id, deltas, duration = 1, opts = {})      // Tween property deltas over time
_.moveTo(id, targets, duration = 1, opts = {})      // Tween properties to absolute target values
_.recolor(id, color, duration = 1, opts = {})       // Tween every matching event's color
```

```js
const box = _.newCircle({posY: 100, diameter: 60});
_.wait(0.5);
_.moveTo(box, {posX: -300, posY: 0}, 1, {easing: "quadOut"});  // glide to a target point
_.wait(1);
_.animate(box, {diameter: -30}, 0.5);                          // shrink relative to current size
_.wait(1);
_.moveTo(box, {diameter: 90}, 0.5);                            // grow to an absolute size
_.wait(1);
_.recolor(box, "#FF6060", 0.5, {easing: "quadInOut"});
_.wait(1);
```

Rules:

- `animate()` deltas are **relative**: `{posX: -200}` slides the group 200 px left of where it is right now. Tweenable properties: `posX`, `posY`, `fontSize`, `diameter`, `width`, `height`, `lengthX`, `lengthY`, `lineWidth`. Anything else throws.
- `moveTo()` targets are **absolute** final values: `posX`/`posY` place the bounding-box center of the group at that canvas offset (like `centerText()`), and any other key ends with the property rendered at exactly that value (`{fontSize: 40}` ends at font size 40). Omit keys to leave properties untouched.
- `opts.easing` is one of `linear` (default), `quad*`, `cubic*`, `sin*`, `expo*`, `circ*`, `back*`, `elastic*` (each in `In` / `Out` / `InOut` variants, see `Engine/easing.js`), or a custom `(t) => easedT` function.
- Tweens are group-level: all events sharing the id move together, so multi-segment text stays aligned. Tweened `fontSize` changes glyph size, but line spacing stays at the build-time layout.
- Tweens **chain**: animating the same property again starts from where the previous tween is at the current time cursor and supersedes it - no snaps, no double-counting.
- `recolor()` needs hex colors (`#RGB` / `#RRGGBB`) for the target color and for the events being recolored.
- Elements must exist first: all three throw when no visual events match the id.
- Tweens do not advance the time cursor - `wait()` through them to see them play.

## Sound

```js
_.playSound(filePath, volume)  // Schedule a sound at the current time cursor; volume defaults to 1
_.setAudioFile(filePath)       // Set the base path that sound paths resolve against
```

Sound paths are joined against the base path set by `_.setAudioFile()`. By default the base is the path of the `engine.js` module itself (rarely useful), so most scripts call `_.setAudioFile(path.dirname(fileURLToPath(import.meta.url)))` to make sound paths relative to the animation script.

## Timeline access

```js
_.getVisualTimeline()  // Visual events array (includes tween events)
_.getAudioTimeline()   // Audio events array
_.getDuration()        // Total seconds
_.getEvents(id)        // Visual events with matching id (excludes tween events)
```

Pass these to `record()` and `addSounds()` - see [recording.md](./recording.md). If you mutate the visual array, keep using the same reference (from `_.getVisualTimeline()`) so the `render.js` cache stays valid.

## Rendering & recording rules

- An event is drawn when `t >= event.start && t < (event.end ?? Infinity)`. `fadeIn`/`fadeOut` modulate opacity within that window.
- Tween events (`type: "tween"`) are resolved before drawing each frame: property tweens offset all events of their target id, color tweens override one event's color.
- The background is the most recent background event with `start <= t` and `t < end` (defaults to `#000000`). While `fadeIn`/`fadeOut` progress, the active color is alpha-composited over the previous background color.
- `record()` samples `Math.ceil(FPS * duration)` frames at `t = f / FPS`.
