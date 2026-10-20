# TODO

- [Github Repository](https://github.com/AzertyWasTaken/Video-Engine)

## Update log

- Group orbits: `_.rotateAround(id, center, angle, duration, opts)` tweens every object sharing a queried id along a circular arc around a pivot `{x, y}` (`null` defaults to the group bounding-box center) while spinning each by the same clockwise angle, so the group turns rigidly around the pivot; orbits chain with position/rotation tweens in both directions without snaps.
- Group queries: `_.getSize(id)` returns the bounding-box `{width, height}` of every object sharing a queried id and `_.getCenter(id)` returns its `{x, y}` center.
- Usability hardening: `record()` throws on a 0-second timeline and warns about events that are never visible or get cut off (the forgotten-final-`wait()` class)
- Fast iteration: `previewFrame(CONFIG, import.meta.url, {t, out})` in `Engine/pipeline.js` renders one frame to PNG next to the script with no FFmpeg
- Chapter timestamps: `_.getChapterTimestamps()` returns video-description lines (`"00:00 Intro - 00:05 Outro"`, `mm:ss` or `h:mm:ss`)
- Automated tests: `test/*.test.js` with Node's built-in runner (`npm test`), covering validate/param/timeline/chapters/tweens/text plus a `previewFrame` PNG integration test; `package.json` also gains `npm run render`
- Style markup: `styleSymbol` entries are now `{openSymbol, closeSymbol?, color?, fontWeight?, fontFamily?, italic?}`, so a region can switch font family and slant as well as color and weight (e.g. `{openSymbol: "/", italic: true}` and `{openSymbol: "{f ", closeSymbol: "}", fontFamily: "Times New Roman"}`). A new `italic` text property (default `false`) sets the whole text to italic; style markup overrides it per region, and `italic: false` in an entry turns it back off inside italic text. Measurement and rendering share one `fontString()` helper, so a region using a different family or slant is measured at the width it is actually drawn
- Layout order: a shared `global` numeric `layoutOrder` property (default `0`) stacks objects independently of creation order - higher values draw on top, equal values keep creation order; set per object (e.g. `_.newRect({layoutOrder: -1})`) or for all new objects with `_.setProp({layoutOrder: -1}, "global")`
- Incomplete circle arcs: `_.newCircle()` takes an `arc` option (clockwise **degrees** from 12 o'clock, default `360`) that draws a partial circle - the fill is a pie wedge and the stroke follows only the arc rim. `arc` is tweenable with `_.animate()` / `_.moveTo()`

## Features

- [ ] Exponent and subscripts style wrapping TODO
- [ ] Auto color symbols (option to color specific symbols only) TODO
- [ ] Repeat & auto cancel tween mode TODO
- [ ] Custom sound for last text segment
- [ ] Bullet lists
- [ ] Table
- [ ] `autoSetPos` align option

## Quality

- [ ] Separate render and anim engines TODO
- [ ] Remove flash parameter TODO
- [ ] Run multiple chapters merged in a single video TODO
- [ ] Auto volume modifier for sound shorthand TODO
- [ ] Relative position option TODO
- [ ] Reverse text segments order option
- [ ] Last text segment delay option

## Template

## Ideas

- Gradient background
- Text typing effect
- Code blocks with font `monospace`
- Support special characters
- `render.js` accept only tweening with smooth transitions
- Module for appending instance objects
- Set text fading with additive compensation
- Line curves
