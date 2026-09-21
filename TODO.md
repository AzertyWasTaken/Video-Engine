# TODO

- [Github Repository](https://github.com/AzertyWasTaken/Video-Engine)

## Update log

- Timeline ergonomics: `waitUntilIdle()`, scene/chapter markers (`chapter()`, `scene()`, `getChapters()`), `setText()` options object (`{fade, hold}`)
- `clear()` truncates `duration`-bearing events at the cursor (fixes crossfades over such events via `setText()`)
- Auto-assigned unique ids; visual creators return the group id
- `duration` property auto-ends events (no manual `wait` + `clear` pairs)
- `seek()` for absolute time cursor jumps
- Tween system: `animate()`, `moveTo()`, `recolor()` with `Engine/easing.js`
- Moving effect (`animate()` / `moveTo()`)
- Size changing effect (tween `fontSize`, `diameter`, `width`, `height`, `lengthX`, `lengthY`, `lineWidth`)
- Color changing effect (`recolor()`)
- Set-prop tween (`moveTo()` takes absolute targets for any tweenable property)
- Change `moveTo` to set prop tween
- Merge bold and color wrappings to style
- Line breaks in text with `\n`
- Background fades and auto-end (`setBackgroundColor(color, {fadeIn, fadeOut, duration})`)
- Strokes for circles and rectangles (`strokeColor`, `strokeWidth`)
- Easing families: `sin`, `expo`, `circ`, `back`, `elastic` (In/Out/InOut)

## Features

- [ ] Relative position
- [ ] Auto text size (to fit width)
- [ ] Auto In/Out/InOut easing.
- [ ] Italic wrapping
- [ ] Braces wrapping (`*text* -> {b text}`)
- [ ] Custom sound for last text segment
- [ ] Bullet lists
- [ ] Table
- [ ] Exponentiation wrapping `^`
- [ ] Blend texts with additive compensation
- [ ] Revamp fading and flash effect
- [ ] `autoSetPos` align option
- [ ] Last delay option
- [ ] Reverse text segments order

## Coding

- [ ] Global properties (params inheritance)
  - [ ] Make property locally editable
  - [ ] Set default type to global
- [ ] Fix text resizing animation bug

## Template

- [ ] Split into multiple functions to make video rendering faster

## Ideas

- Gradient background
- Text typing effect
- Code blocks with font `monospace`
- Support special characters
- Fading set text option
- `render.js` accept only tweening with smooth transitions
- Module for appending instance objects
