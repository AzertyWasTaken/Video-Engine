# Visuals

> Part of the [Anim documentation](../README.md#documentation).

Visuals are created with `_.newLine()`, `_.newCircle()`, `_.newRect()`, `_.newImage()`, and `_.setBackgroundColor()`. Defaults for each type live in `Engine/param.js` and can be changed via `_.setProp(newProp, type)`.

## Common properties (object creators)

Every object creator (`_.newText()`, `_.newLine()`, `_.newCircle()`, `_.newRect()`, and `_.newImage()`) accepts these properties and **returns the group's ids (array)**. Their defaults live in the shared `global` section of `Engine/param.js` - change them for all unset types at once with `_.setProp(props, "global")`. Background events are documented separately below.

| Property | Default | Description |
| - | - | - |
| `id` | auto | Id or array of ids (string or finite number); the object is affected by any id it carries. A unique negative id is auto-assigned when omitted |
| `duration` | `null` | Seconds until the event auto-ends; `null` keeps it visible until `_.clear()` |
| `posX`, `posY` | `0` | Offset from canvas center |
| `rotation` | `0` | Clockwise rotation in degrees, about the object's anchor (`posX`/`posY` for shapes, the text layout anchor for text); tweenable |
| `alignX`, `alignY` | `0` | Alignment relative to `posX`/`posY`: `-1` left/top, `0` center, `1` right/bottom - the element sits on that side of the anchor (its opposite edge lands on `posX`/`posY`) |
| `fadeIn`, `fadeOut` | `0` | Fade-in / fade-out durations (seconds) |
| `opacity` | `1` | Base opacity from `0` (invisible) to `1` (opaque); multiplied by fade progress; tweenable |

The tables below list the type-specific properties. See [engine-api.md](./engine-api.md#animation) for animating these properties over time.

## Line properties (`type: "line"`)

| Property | Default | Description |
| - | - | - |
| `positions` | `[]` | Array of vertex objects, each relative to `posX`/`posY`; consecutive vertices form the polyline segments (fewer than 2 draws nothing). **Each axis is optional and defaults to `0`**, so `{x: 120}` and `{y: -60}` are valid vertices |
| `scaleX` | `1` | Horizontal multiplier applied to every vertex offset (`lineWidth` is unaffected); tweenable |
| `scaleY` | `1` | Vertical multiplier applied to every vertex offset; tweenable |
| `lineWidth` | `16` | Stroke width in pixels |
| `loop` | `false` | Close the path: strokes one extra segment from the last vertex back to the first. Needs at least 3 `positions` - a build-time error is thrown otherwise |
| `color` | `"#FFFFFF"` | Line color (any CSS color string) |

## Rectangle properties (`type: "rect"`)

| Property | Default | Description |
| - | - | - |
| `width` | `256` | Rectangle width in pixels |
| `height` | `256` | Rectangle height in pixels |
| `strokeColor` | `null` | Stroke color; `null` disables the stroke |
| `strokeWidth` | `4` | Stroke width in pixels |
| `color` | `"#FFFFFF"` | Fill color (any CSS color string) |

## Circle properties (`type: "circle"`)

| Property | Default | Description |
| - | - | - |
| `diameter` | `40` | Circle size in pixels (see rendering note below) |
| `strokeColor` | `null` | Stroke color; `null` disables the stroke |
| `strokeWidth` | `4` | Stroke width in pixels |
| `color` | `"#FFFFFF"` | Fill color (any CSS color string) |

> **Rendering note:** `render.js` passes `diameter` directly as the canvas arc *radius*, so the drawn circle's radius equals the `diameter` value (visual size = 2 x `diameter`).

## Image properties (`type: "image"`)

| Property | Default | Description |
| - | - | - |
| `src` | `""` | Image source: a shorthand registered with `_.setAssets()`, an absolute path, or a path relative to the calling script's directory |
| `width` | `256` | Rendered width in pixels |
| `height` | `256` | Rendered height in pixels |

Images are preloaded by `record()` before the first frame; each `src` is resolved through the shorthand map set by `_.setAssets()` (see [engine-api.md](./engine-api.md#sound--assets)), falling back to the calling script's directory for plain relative paths. Failed loads log a console warning and the image is skipped during rendering; an empty `src` is skipped with a warning.

## Visual element types

All events pushed to the visual timeline share this structure (`start` is set to the time cursor; `end` is added by `_.clear()` or a `duration`):

| `type` | Fields | Description |
| - | - | - |
| `"background"` | `color`, `start`, `fadeIn`, `fadeOut`, `end?` | Fills the canvas; the most recent background with `start <= t < end` wins (default `#000000`) |
| `"text"` | `ids`, `text`, `posX`, `posY`, `rotation`, `anchorX`, `anchorY`, `fontFamily`, `fontSize`, `fontColor`, `fontWeight`, `flashDuration`, `flashColor`, `fadeIn`, `fadeOut`, `opacity`, `start`, `end?` | Rendered text segment |
| `"circle"` | `ids`, `posX`, `posY`, `rotation`, `diameter`, `color`, `strokeColor`, `strokeWidth`, `fadeIn`, `fadeOut`, `opacity`, `start`, `end?` | Filled circle (optional stroke) |
| `"rect"` | `ids`, `posX`, `posY`, `rotation`, `width`, `height`, `color`, `strokeColor`, `strokeWidth`, `fadeIn`, `fadeOut`, `opacity`, `start`, `end?` | Filled rectangle (optional stroke) |
| `"line"` | `ids`, `posX`, `posY`, `rotation`, `positions`, `scaleX`, `scaleY`, `lineWidth`, `loop`, `color`, `fadeIn`, `fadeOut`, `opacity`, `start`, `end?` | Stroked polyline (closed when `loop` is set) |
| `"image"` | `ids`, `src`, `posX`, `posY`, `rotation`, `width`, `height`, `fadeIn`, `fadeOut`, `opacity`, `start`, `end?` | Image overlay |
| `"tween"` | `target`, `key`/`color`, `from`, `to`, `start`, `tweenEnd`, `easing`, `end?` | Animation event; resolved by the renderer, never drawn |

## Rendering geometry

- **Text** - centered at `(width / 2 + posX, height / 2 + posY)`
- **Rect** - top-left corner at `(width - w) / 2 + posX, (height - h) / 2 + posY`
- **Circle** - arc centered at `(width / 2 + posX, height / 2 + posY)` (see the note above)
- **Line** - path through `(posX + x * scaleX, posY + y * scaleY)` for every vertex `{x, y}` in `positions` (an omitted axis is `0`), stroked with `lineWidth`; `loop` closes the path back to the first vertex, which stays inside the vertex bounding box so alignment and centering are unaffected
- **Image** - top-left corner like rect, drawn from the image cache keyed on the original `src`
- **Alignment** - `alignX`/`alignY` shift the element by half its bounding box to that side of the anchor: text lines shift by half the line width, the text block by half its total height, shapes by half their `width`/`height` or `diameter`, lines by their scaled vertex box plus `lineWidth`
- **Rotation** - `rotation` is a pure drawing transform applied around the anchor, in clockwise degrees. It is a **visual rotation only**: `width`/`height`/`positions` stay unrotated, so the bounding box used by `centerText()` / `getSize()` and the `alignX`/`alignY` baking is still the unrotated one. Text pivots on its layout anchor (`anchorX`/`anchorY`, i.e. the text config's `posX`/`posY`), so a multi-segment or multi-line block turns as one unit instead of each segment spinning in place; every other type pivots on its own `posX`/`posY`, which is already its bounding-box center - so a rotated object's group center does not move. Objects with `rotation: 0` (the default) skip the canvas transform entirely.

## Grouping & centering

`_.centerText(id, posX = null, posY = null)` computes the bounding box of all visual events sharing a queried id and shifts them so the group's center lands at `(posX, posY)`. Each axis moves only when its argument is not `null`. Accepts a single id or an array of ids; each call affects every matching object exactly once. Works for text, rects, circles, lines, and images.

Per-type bounding-box size: text uses its measured width and `fontSize`; circle uses `diameter`; line uses its scaled vertex extents plus `lineWidth`; image and rect use `width`/`height`.

`_.getEvents(id)` returns the visual events sharing a queried id (excluding tween events) for inspection.

For animating groups over time (`animate`, `moveTo`, `recolor`), see [engine-api.md](./engine-api.md#animation).

## Background

`_.setBackgroundColor(color, opts = {})` pushes a background event at the current time cursor. Options: `fadeIn` / `fadeOut` (fade durations in seconds) and `duration` (auto-end). At render time the most recent background event with `start <= t` and `t < end` wins; with no active background event the canvas falls back to the previous background color, or `#000000`.

While `fadeIn` or `fadeOut` progress, the active color is alpha-composited over the previous background color - a new color fades in over it, and a `fadeOut` / `duration`-ended color fades back out to it:

```js
_.setBackgroundColor("#000080");                                       // Solid navy from here on
_.setBackgroundColor("#C04040", {fadeIn: 0.5});                        // Fade to red over 0.5s
_.setBackgroundColor("#000000", {fadeIn: 1, duration: 3, fadeOut: 1}); // Pulse to black, then back to navy
```
