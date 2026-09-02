# TODO

- [Github Repository](https://github.com/AzertyWasTaken/Video-Engine)

## Update log

- Refractor and split `README.md`
- Auto-assigned unique ids; visual creators return the group id
- `duration` property auto-ends events (no manual `wait` + `clear` pairs)
- `withProp()` scoped defaults and per-type param checkpoints
- `seek()` for absolute time cursor jumps
- Tween system: `animate()`, `moveTo()`, `recolor()` with `Engine/easing.js`
- Table-driven visual event creation (`VISUAL_FIELDS` + `pushVisual`)
- Shared `Engine/utils.js` for FFmpeg path and caller path resolution
- Input validation with descriptive engine errors
- `getEvents()` timeline query helper
- Fixed missing `rect` case in `getItemSize()` (centering rect groups threw)
- Fixed rect path accumulation in `render.js` (ghost shapes across frames)
- Extended params with addons
- Moving effect (`animate()` / `moveTo()`)
- Size changing effect (tween `fontSize`, `diameter`, `width`, `height`, `lengthX`, `lengthY`, `lineWidth`)
- Color changing effect (`recolor()`)
- Set-prop tween (`moveTo()` takes absolute targets for any tweenable property)
- Change `moveTo` to set prop tween

## Features

- [ ] Circles and rectangles strokes
- [ ] Custom sound for last text segment
- [ ] Bullet lists
- [ ] Table
- [ ] Italic wrapping `|`
- [ ] Exponentiation wrapping `^`
- [ ] Blend texts with additive compensation
- [ ] Revamp fading and flash effect
- [ ] `autoSetPos` align option
- [ ] Last delay option
- [ ] Reverse text segments order

## Coding

- [ ] Refractor `enigne.js`
- [ ] Global properties (params inheritance)
- [ ] Make property locally editable
- [ ] Set default type to global
- [ ] Fix text resizing bug

## Template

- [ ] Split into multiple functions to make video rendering faster

## Ideas

- Gradient background
- Text typing effect
- Code blocks with font `monospace`
- Support special characters
- Break text line
- Fading set text option
- `render.js` accept only tweening with smooth transitions
- Module for appending instance objects
