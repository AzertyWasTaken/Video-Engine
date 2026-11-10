# Repository Guidance

- For engine internals, see [Docs/internals.md](./Docs/internals.md).
- For the public API, see [README.md](./README.md) and [Docs/engine-api.md](./Docs/engine-api.md).

## Engine model

The `Engine` uses global mutable state: a monotonically increasing `time` cursor, `visual` and `audio` event arrays, and persistent per-type defaults in `Engine/param.js`.

- Every creator or audio/background call is positioned at the current cursor. `_.wait()` advances it; `_.seek()` sets it directly. A `duration` property ends an event automatically.
- Without a final `_.wait()`, the last events have zero visible duration.
- Property changes persist across calls. Consider side effects before editing `Engine/engine.js`; prefer `withProp()` for scoped changes.
- Tween events (`type: "tween"`) have no `id`, so id-based queries such as `clear`, `centerText`, and `getEvents` do not match them.

## Working in the engine

- Before changing engine behavior, check `Engine/state.js` for shared state and `Engine/engine.js` for the public facade. Changes to defaults persist across calls.
- `Engine/textParser.js` creates its 1x1 canvas context at module load. Reuse the module-level context; do not create canvases inside functions.
- `Engine/render.js` runs once per frame (`FPS` times duration). Avoid per-frame allocations and preserve the cached sort, binary search, and reused tween maps. Keep `beginPath()` in the rectangle branch because canvas paths persist across frames.
- Ship frames to FFmpeg with `renderRawFrame()` (`canvas.toBufferSync("raw")`), never `getImageData()` - it takes a slow synchronous GPU path (~2x slower at 1080p, worse with glow).
- `record()` can split a render across worker processes (`CONFIG.WORKERS`); workers re-run the calling script, so timelines must stay deterministic and post-render code must stay idempotent.
- FFmpeg argument order matters in `Engine/record.js` and `Engine/addSounds.js`. Both use `resolveCallerPath()` and `ffmpegPath` from `Engine/utils.js`.
- Animation entry points should import from `Engine/` and pass `import.meta.url` to both `record()` and `addSounds()`. Do not run engine modules directly.
- For debugging, inspect `_.getVisualTimeline()`, `_.getAudioTimeline()`, `_.getEvents(id)`, and `_.getIds()`. Add temporary logging only when needed and remove it before finishing.

## Tests and outputs

- Run `npm test` for unit and `previewFrame` integration tests; this does not require FFmpeg.
- Run `node Tools/check-templates.js` to dry-run every template without FFmpeg.
- Run `node Tools/run.js <script> --inspect` or set `ANIM_DRY_RUN=1` for a compact timeline summary.
- Run `node Tools/run.js <script> --preview <t>` (or `ANIM_PREVIEW=<t>`) for a single PNG frame without encoding.
- Run `node anim_template.js` for full-pipeline validation when the change affects rendering or audio. Verify that `visual.mp4` and `audio.mp4` are produced and check for image-loading or FFmpeg warnings.
- Remove temporary test files, fixtures, and generated outputs created solely for the task when finished. Preserve the repository's existing tests and any pre-existing user files.

## Templates and documentation

- When a feature is added, changed, or removed, update relevant starter/example templates in `Templates/` and `anim_template.js` so they stay consistent with the supported behavior.
- Update the relevant documentation when public behavior or usage changes. See [Docs/troubleshooting.md](./Docs/troubleshooting.md) for known failure modes; `TODO.md` tracks planned work and completed changes.

## Editing practices

- Keep changes focused and follow existing naming, formatting, validation, and localization patterns.
- After editing JavaScript, run `node --check <file>`. Run the narrowest applicable tests, then review the changed file and diff for incomplete edits or stray markers.
- Keep comments short; no JSDoc.
- Avoid unrequested backward compatibility and redundant features.
