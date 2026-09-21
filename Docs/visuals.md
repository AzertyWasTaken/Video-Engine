# Visuals

> Part of the [Anim documentation](../README.md#documentation).

Visuals are created with `_.newLine()`, `_.newCircle()`, `_.newRect()`, `_.newImage()`, and `_.setBackgroundColor()`. Defaults for each type live in `Engine/param.js` and can be changed via `_.setProp(newProp, type)`.

## Common properties (all creators)

Every visual creator accepts these properties and **returns the group id**:

| Property | Default | Description |
| - | - | - |
| `id` | auto | Integer or string group identifier; a unique negative id is auto-assigned when omitted |
| `duration` | `null` | Seconds until the event auto-ends; `null` keeps it visible until `_.clear()` |
| `posX`, `posY` | `0` | Offset from canvas center |
| `fadeIn`, `fadeOut` | `0` | Fade-in / fade-out durations (seconds) |

The tables below list the type-specific properties. See [engine-api.md](./engine-api.md#animation) for animating these properties over time.

## Line properties (`type: "line"`)

| Property | Default | Description |
| - | - | - |
| `lengthX` | `0` | Horizontal vector component from center |
| `lengthY` | `0` | Vertical vector component from center |
| `lineWidth` | `16` | Stroke width in pixels |
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
| `src` | `""` | Image source path (relative to the calling script's directory, or absolute) |
| `width` | `256` | Rendered width in pixels |
| `height` | `256` | Rendered height in pixels |

Images are preloaded by `record()` before the first frame; relative paths resolve against the calling script's directory. Failed loads log a console warning and the image is skipped during rendering.

## Visual element types

All events pushed to the visual timeline share this structure (`start` is set to the time cursor; `end` is added by `_.clear()` or a `duration`):

| `type` | Fields | Description |
| - | - | - |
| `"background"` | `color`, `start`, `fadeIn`, `fadeOut`, `end?` | Fills the canvas; the most recent background with `start <= t < end` wins (default `#000000`) |
| `"text"` | `id`, `text`, `posX`, `posY`, `fontFamily`, `fontSize`, `fontColor`, `fontWeight`, `flashDuration`, `flashColor`, `fadeIn`, `fadeOut`, `start`, `end?` | Rendered text segment |
| `"circle"` | `id`, `posX`, `posY`, `diameter`, `color`, `strokeColor`, `strokeWidth`, `fadeIn`, `fadeOut`, `start`, `end?` | Filled circle (optional stroke) |
| `"rect"` | `id`, `posX`, `posY`, `width`, `height`, `color`, `strokeColor`, `strokeWidth`, `fadeIn`, `fadeOut`, `start`, `end?` | Filled rectangle (optional stroke) |
| `"line"` | `id`, `posX`, `posY`, `lengthX`, `lengthY`, `lineWidth`, `color`, `fadeIn`, `fadeOut`, `start`, `end?` | Stroked line |
| `"image"` | `id`, `src`, `posX`, `posY`, `width`, `height`, `fadeIn`, `fadeOut`, `start`, `end?` | Image overlay |
| `"tween"` | `targetId`/`target`, `key`/`color`, `from`, `to`, `start`, `tweenEnd`, `easing`, `end?` | Animation event; resolved by the renderer, never drawn |

## Rendering geometry

- **Text** - centered at `(width / 2 + posX, height / 2 + posY)`
- **Rect** - top-left corner at `(width - w) / 2 + posX, (height - h) / 2 + posY`
- **Circle** - arc centered at `(width / 2 + posX, height / 2 + posY)` (see the note above)
- **Line** - from `(posX - lengthX / 2, posY - lengthY / 2)` to `(posX + lengthX / 2, posY + lengthY / 2)`, stroked with `lineWidth`
- **Image** - top-left corner like rect, drawn from the image cache keyed on the original `src`

## Grouping & centering

`_.centerText(id, posX = null, posY = null)` computes the bounding box of all visual events with a matching id and shifts them so the group's center lands at `(posX, posY)`. Each axis moves only when its argument is not `null`. Accepts a single id or a `Set` of ids. Works for text, rects, circles, lines, and images.

Per-type bounding-box size: text uses its measured width and `fontSize`; circle uses `diameter`; line uses `length + lineWidth`; image and rect use `width`/`height`.

`_.getEvents(id)` returns the visual events with a matching id (excluding tween events) for inspection.

For animating groups over time (`animate`, `moveTo`, `recolor`), see [engine-api.md](./engine-api.md#animation).

## Background

`_.setBackgroundColor(color, opts = {})` pushes a background event at the current time cursor. Options: `fadeIn` / `fadeOut` (fade durations in seconds) and `duration` (auto-end). At render time the most recent background event with `start <= t` and `t < end` wins; with no active background event the canvas falls back to the previous background color, or `#000000`.

While `fadeIn` or `fadeOut` progress, the active color is alpha-composited over the previous background color - a new color fades in over it, and a `fadeOut` / `duration`-ended color fades back out to it:

```js
_.setBackgroundColor("#000080");                                       // Solid navy from here on
_.setBackgroundColor("#C04040", {fadeIn: 0.5});                        // Fade to red over 0.5s
_.setBackgroundColor("#000000", {fadeIn: 1, duration: 3, fadeOut: 1}); // Pulse to black, then back to navy
```
