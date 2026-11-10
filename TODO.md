# TODO

- [Github Repository](https://github.com/AzertyWasTaken/Video-Engine)

## Update log

- Ids ergonomics: every id-taking call accepts creator results (`{id, seg}`) and nested arrays
- Shared unknown-id errors with "did you mean" hints; `getSize()`/`getCenter()` warn on typos; `_.getIds()` helper
- Group geometry (`centerText`, `getCenter`, `getSize`, `moveTo` center, orbit pivot) ignores ended events
- `clearAll(keepId)` rename with keep-typo warning; `recolor()` distinguishes colorless targets
- Chapter timestamps
- Layout order
- Incomplete circle arcs
- Reverse mirror tween option
- Text part selection
- Set text fade align
- Font size style wrapping
- Font Y offset style wrapping
- Custom shapes
- Change a single chapter of the rendered video
- Generate whole text section
- Clear all elements with exceptions
- Repeat loop
- Grid repeat loop
- Set text font size fix
- Text escape without segment symbol
- Text wrap fixes and parser cleanup
- Starter `anim_template.js` restored (entry point + `npm run render`)
- `getAutoId()` helper and auto-id collision fix (`takeAutoId()`)
- `withProp(props, type, fn)`, `playSound(sound, {volume})`
- `saveParam`/`undoParam` removed (use `withProp`)
- Docs corrected: circle `diameter`, type defaults, tween `duration`, return shapes
- Text glow (`glowRange`, `glowIntensity`, `glowColor`)
- Render speed: frames read back with `toBufferSync("raw")` (~2.1x at 1080p, no glow spikes)
- Render speed: parallel worker processes with stream-copy concat (`CONFIG.WORKERS`, up to ~2.9x)
- Per-frame render hygiene: cached context/backgrounds/font strings, reused object buffer, blank text skipped
- Render progress lines, `CONFIG.PRESET` / `CONFIG.CRF`
- Worker children no longer repeat the script's console output (muted until their slice renders)

## Features

- [ ] Auto color symbols (option to color specific symbols only)
- [ ] Repeat tween option
- [ ] `autoSetPos` align option
- [ ] Glowing objects (text glow available; other types pending)

## Quality

- [ ] Arrow heads
- [ ] Separate render and anim engines
- [ ] Run multiple chapters merged in a single video
- [ ] Relative position option

## Template

## Docs

- [ ] No test rule
- [ ] Update template rule

## Ideas

- Gradient background
- Text typing effect
- `render.js` accept only tweening with smooth transitions
- Set text fading with additive compensation
- Line curves
- Revamp flash & fade parameters
