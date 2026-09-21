# AGENTS.md

Guidance for AI agents and maintainers working in this repository.

- For how the engine works internally, see [Docs/internals.md](./Docs/internals.md)
- For the public API, see [README.md](./README.md) and [Docs/engine-api.md](./Docs/engine-api.md)

## Critical mental model: the time cursor

The `Engine` uses **global mutable state**: a monotonically increasing `time` cursor plus `visual`/`audio` arrays and persistent per-type defaults (`Engine/param.js`).

- Every `_.newText()`, `_.playSound()`, `_.setBackgroundColor()`, `_.newCircle()`, `_.newLine()`, `_.newRect()`, and `_.newImage()` call is positioned at the **current** time cursor. `_.wait()` advances the cursor and `_.seek()` sets it directly; a `duration` property makes events end on their own.
- **`setProp` side effects persist across calls.** Always consider side effects before editing `engine.js`. Prefer `withProp()` for scoped changes.
- If you forget a final `_.wait()`, the last events have zero visible duration.
- Tween events (`type: "tween"`) carry no `id`, so id-based queries (`clear`, `centerText`, `getEvents`) never match them.

## Workflow tips

1. **Before editing the engine:** the global mutable state (`time`, `visual`, `audio`, `textProp`, tween chains) lives in `Engine/state.js`; `engine.js` is the public facade (param checkpoints, audio base path). Changes to defaults persist across calls.
2. **Before editing `textParser.js`:** the 1x1 canvas singleton is created at module load. Do not add `createCanvas` calls inside functions - reuse the module-level `ctx`.
3. **Before editing `render.js`:** it runs `FPS x duration` times. Avoid per-frame allocations; preserve the cached sort + binary search and the reused tween maps. Keep the `beginPath()` call in the rect branch - the canvas path persists across frames.
4. **Before editing `record.js` or `addSounds.js`:** FFmpeg arguments are order-sensitive. Test with short durations first. Both import the shared `resolveCallerPath()` and `ffmpegPath` from `Engine/utils.js`.
5. **Testing:** run `node anim_template.js` and verify both `visual.mp4` and `audio.mp4` are produced. Watch for console warnings (image loading failures, FFmpeg errors).
6. **Debugging:** add `console.log` in `engine.js` methods to trace the time cursor and event pushes. Inspect `_.getVisualTimeline()`, `_.getAudioTimeline()`, and `_.getEvents(id)`.
7. **When in doubt:** read [docs/internals.md](./docs/internals.md) for engine internals and [docs/troubleshooting.md](./docs/troubleshooting.md) for known failure modes. `TODO.md` tracks planned features and completed work.
8. **Template import paths:** `anim_template.js` imports everything from `./Engine/...` and passes `import.meta.url` to both `record()` and `addSounds()`. New animations should do the same.

## File editing best practices

1. **Always complete edits fully.** After editing a file, re-read the modified section to confirm the change was applied and no partial content remains.
2. **No stray arrows or markers.** Never leave `->`, `=>`, a right arrow character, or similar in code or text unless syntactically valid for the language.
3. **Verify syntax after every edit.** After modifying a `.js` file, run `node --check <file>` before proceeding.
4. **Use exact, unique search matches.** Replacement tools match the first occurrence; ensure the search block is unique and matches character-for-character, including whitespace.
5. **Don't abandon edits mid-way.** Complete all steps of a multi-step edit before moving on; if one fails, diagnose and retry rather than leaving the file half-edited.
6. **Review before committing.** After all edits, scan the full file once more for stray characters, leftover comments, or incomplete replacements.
7. **Test the full pipeline.** After engine changes, run `node anim_template.js` and verify both outputs are produced without errors.
8. **Do not use JSDoc comments.** Keep comments short; avoid redundancy unless requested.
9. **Do not implement backward compatibility** unless requested.
10. **Do not add redundant features.** For example, every function in `Engine` must do different things.
