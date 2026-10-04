# TODO

- [Github Repository](https://github.com/AzertyWasTaken/Video-Engine)

## Update log

- Rendering resolution: `CONFIG` takes an optional `SCALE` (default `1`) that multiplies the encoded resolution without touching the framing - `WIDTH/HEIGHT` stay the design space every event is positioned in, while the canvas, FFmpeg's `-video_size` and the frame readback are `WIDTH * SCALE x HEIGHT * SCALE` pixels. `{WIDTH: 1920, HEIGHT: 1080, FPS: 12, SCALE: 2}` records 3840x2160 with identical composition (a sharper output, at proportionally more pixels and encode time). Fractional values work (`1.5` -> 2880x1620)
- Closed lines and default position axes: `_.newLine()` takes a `loop` option (default `false`) that closes the path by stroking one extra segment from the last vertex back to the first.
- Every `positions` entry may now omit `x` or `y` - a missing axis defaults to `0`, so `positions: [{x: 120}, {y: -60}]` is a valid pair of vertices. `loop` requires at least 3 positions and throws otherwise
- Asset shorthands: `_.setAssets({"click": "./Sounds/click.wav", "favicon": "./Images/favicon.png"})` registers one shorthand map for **both** sounds and images, so `_.playSound("click")` and `_.newImage({src: "favicon"})` store the short name in the timeline; `record()` / `addSounds()` resolve it at the end (shorthand, then absolute path, then relative to the calling script). This replaces `_.setAudioFile()`, which joined sound paths against a base at `playSound()` time
- Line paths: `newLine()` takes a `positions` array of `{x, y}` vertices (relative to `posX`/`posY`, multiplied by the new `scaleX`/`scaleY` options) instead of `lengthX`/`lengthY`; `scaleX`/`scaleY` replace them as the tweenable size properties
- Style markup symbols: `styleSymbol` entries are now `{openSymbol, closeSymbol?, color?, fontWeight?}`; each entry picks its own opening and closing symbols and may require several symbols in a row, replacing the old `symbol` + `braces: true` form (`{y text}` is now `{openSymbol: "{y ", closeSymbol: "}"}`, and `closeSymbol` defaults to `openSymbol` for a toggle)
- Easing direction: an optional `direction` option (`"in"` default, `"out"`, `"inOut"`) shapes any easing into that form, so `{easing: "quad", direction: "out"}` replaces the old `"quadOut"` name
- Object opacity: `opacity` is a shared `global` default for text and visual objects, from `0` (invisible) to `1` (opaque); it is stored on each event and combined with fade progress
- Custom line gaps: `lineGap` text property adds extra space between lines (default `0`)
- Line breaks in text with `\n`
- Strokes for circles and rectangles (`strokeColor`, `strokeWidth`)

## Features

- [ ] Change text font with wrapping style TODO
- [ ] Auto color symbols (option to color specific symbols only) TODO
- [ ] Repeat & auto cancel tween mode TODO
- [ ] Rotation global
- [ ] Generate chapters timestamps
- [ ] Italic wrapping
- [ ] Custom sound for last text segment
- [ ] Bullet lists
- [ ] Table
- [ ] Exponentiation wrapping `^`
- [ ] `autoSetPos` align option

## Quality

- [ ] Layout order TODO
- [ ] Centered line if positions has a single element TODO
- [ ] Run multiple chapters merged in a single video TODO
- [ ] Auto volume modifier for sound shorthand TODO
- [ ] Relative position option TODO
- [ ] Revamp fading and flash effect
- [ ] Reverse text segments order option
- [ ] Last text segment delay option

## Template

## Ideas

- Gradient background
- Text typing effect
- Code blocks with font `monospace`
- Support special characters
- Fading set text option
- `render.js` accept only tweening with smooth transitions
- Module for appending instance objects
- Set text fading with additive compensation
- Line curves
