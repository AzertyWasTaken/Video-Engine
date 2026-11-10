"use strict";
import {Param, effectiveParam, assertKnownKeys} from "./param.js";
import {advanceTime, audio, chapters, getTime, setTime, textProp, visual, nextAutoId, currentAutoId, resetAutoId, assetMap} from "./state.js";
import {hasEnded, knownIds, matchesIds, resolveDuration, resolvePropEntries, requireType, showIds, toIdArray, unknownIdMessage, validateDuration, validateLayoutOrder, validateOpacity, validateRotation} from "./validate.js";
import {setAssets as setAssetMap, getAssets as getAssetMap} from "./assets.js";
import {getGroupCenter, getGroupSize, pushVisual as pushVisualEvent} from "./visualEvents.js";
import {addChapter as pushChapter, runScene as runSceneEvent, chapterTimestamps} from "./chapters.js";
import {animate as applyAnimate, moveTo as applyMoveTo, recolor as applyRecolor, rotateAround as applyRotateAround, getPropertyOffset} from "./tweens.js";
import {newText as createText, newTexts as createTexts} from "./textEvents.js";
import {resetRenderCache} from "./render.js";

// Snapshot of pristine Param defaults, used by reset().
const initialParam = structuredClone(Param);

// Warn (never throw) when an id query matched nothing or only already-ended
// events. Returns true when the caller should bail out - nothing usable to act on.
function warnIfUnmatched(action, ids) {
    if (visual.some((value) => matchesIds(value, ids))) {
        if (!visual.some((value) => matchesIds(value, ids) && !hasEnded(value))) {
            console.warn(`${action}: all visual events with id ${showIds(ids)} have already ended.`);
            return true;
        }
        return false;
    }

    console.warn(unknownIdMessage(action, ids));
    return true;
}

// Public API facade. Timeline and event logic lives in the dedicated modules;
// this object defines the full method surface used by animation scripts.
export const Engine = {
    // ---- Time cursor ----

    // Advance the cursor by `sec` seconds (0 when omitted).
    wait(sec = 0) {
        if (typeof sec !== "number" || !Number.isFinite(sec))
            throw new Error(`wait() expects a finite number of seconds, got ${JSON.stringify(sec)}.`);

        advanceTime(sec);
    },

    seek(sec) {
        if (typeof sec !== "number" || !Number.isFinite(sec))
            throw new Error(`seek() expects a finite time in seconds, got ${sec}.`);

        setTime(sec);
    },

    // Advance the cursor past the latest open event (no-op when none are open).
    // Backgrounds and open-ended events (no `duration`) are ignored.
    waitUntilIdle() {
        const now = getTime();
        let latest = null;

        for (const event of visual) {
            if (event.type === "tween" || event.type === "background") continue;
            if ((event.start ?? 0) > now) continue;

            if (event.end !== undefined && event.end > now
                && (latest === null || event.end > latest)) latest = event.end;
        }

        if (latest !== null) setTime(latest);
    },

    // ---- Param defaults ----

    // Scoped defaults: apply newProp, run fn(), then restore (even on throw).
    // Forms: withProp(props, fn), withProp(props, type, fn),
    // withProp({text: {...}, circle: {...}}, fn).
    withProp(newProp, typeOrFn, maybeFn) {
        const fn = typeof typeOrFn === "function" ? typeOrFn : maybeFn;
        const type = typeof typeOrFn === "string" ? typeOrFn : undefined;

        if (typeof fn !== "function")
            throw new Error(
                "withProp() expects a callback: withProp(props, fn), withProp(props, type, fn), " +
                "or withProp({text: {...}}, fn)."
            );

        const entries = resolvePropEntries(newProp, type);

        // Validate every type before mutating any of them.
        for (const [entryType] of entries)
            requireType(entryType);

        const snapshots = new Map(entries.map(([entryType]) => [entryType, {...Param[entryType]}]));
        for (const [entryType, entryProp] of entries)
            Engine.setProp(entryProp, entryType);

        try {
            fn();
        } finally {
            for (const [entryType, snapshot] of snapshots)
                Param[entryType] = snapshot;
        }
    },

    getGlobalProp(type = "global") {
        requireType(type);
        return Param[type];
    },

    getProp(key, type = "global") {
        requireType(type);
        return effectiveParam(type, key);
    },

    setProp(newProp, type = "global") {
        requireType(type);
        assertKnownKeys(type, newProp, "setProp()");

        for (const key in newProp) {
            // `undefined` re-inherits the global default on a type, so it skips validation.
            if (key === "opacity" && (type === "global" || newProp[key] !== undefined))
                validateOpacity(newProp[key]);

            if (key === "rotation" && (type === "global" || newProp[key] !== undefined))
                validateRotation(newProp[key]);

            if (key === "layoutOrder" && (type === "global" || newProp[key] !== undefined))
                validateLayoutOrder(newProp[key]);

            Param[type][key] = newProp[key];
        }
    },

    changeProp(newProp, type = "global") {
        requireType(type);
        assertKnownKeys(type, newProp, "changeProp()");

        for (const key in newProp) {
            const keyA = effectiveParam(type, key);
            const keyB = newProp[key];

            if (typeof keyA !== "number" || !Number.isFinite(keyA)
                || typeof keyB !== "number" || !Number.isFinite(keyB))
                throw new Error(
                    `changeProp(): ${JSON.stringify(key)} must combine finite numbers, ` +
                    `got ${JSON.stringify(keyA)} + ${JSON.stringify(keyB)}. Use setProp() for non-numeric properties.`
                );

            const value = keyA + keyB;
            if (key === "opacity") validateOpacity(value);

            Param[type][key] = value;
        }
    },

    // ---- Audio ----

    // Sound and image paths are stored as written: a registered shorthand, an
    // absolute path, or a path relative to the calling script. record() and
    // addSounds() resolve them once, after the timeline is built.
    // Second argument: a volume number, or an options object {volume}.
    playSound(filePath, volume = 1) {
        if (typeof filePath !== "string" || filePath.length === 0)
            throw new Error(`playSound() expects a non-empty file path string, got ${JSON.stringify(filePath)}.`);

        if (volume !== null && typeof volume === "object")
            volume = volume.volume ?? 1;

        if (
            volume !== undefined
            && volume !== null
            && (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0)
        )
        throw new Error(`playSound() expects a non-negative finite volume, got ${JSON.stringify(volume)}.`);

        audio.push({
            sound: filePath,
            volume: volume ?? 1,
            start: getTime()
        });
    },

    // ---- Assets ----

    // Register shorthand -> full path pairs, e.g. {click: "./Sounds/click.wav"}.
    // Both sounds and images resolve through this map, so a timeline keeps the
    // short names instead of resolved full paths.
    setAssets(newMap) {setAssetMap(newMap);},

    getAssets() {return getAssetMap();},

    // ---- Event creation ----

    setBackgroundColor(color, opts = {}) {
        if (typeof color !== "string" || color.length === 0)
            throw new Error(`setBackgroundColor() expects a non-empty color string, got ${JSON.stringify(color)}.`);

        if (typeof opts !== "object" || opts === null)
            throw new Error(`setBackgroundColor() expects an options object, got ${typeof opts}.`);

        const {fadeIn = 0, fadeOut = 0, duration = null} = opts;
        validateDuration(fadeIn);
        validateDuration(fadeOut);

        const event = {type: "background", color: color, start: getTime(), fadeIn, fadeOut};
        const end = resolveDuration(duration);
        if (end !== null) event.end = end;

        visual.push(event);
    },

    pushVisual(type, newProp) {return pushVisualEvent(type, newProp, "pushVisual()");},

    newText(newProp) {return createText(newProp);},

    // Batch-create multiple text events with automatic vertical spacing.
    newTexts(texts, configs = {}) {return createTexts(texts, configs);},

    newLine(newProp) {return pushVisualEvent("line", newProp, "newLine()");},

    newShape(newProp) {return pushVisualEvent("shape", newProp, "newShape()");},

    newRect(newProp) {return pushVisualEvent("rect", newProp, "newRect()");},

    newCircle(newProp) {return pushVisualEvent("circle", newProp, "newCircle()");},

    newImage(newProp) {return pushVisualEvent("image", newProp, "newImage()");},

    // ---- Scenes ----

    chapter(name) {return pushChapter(name);},

    scene(name, fn, opts) {
        const chapter = runSceneEvent(name, fn, opts);
        Engine.waitUntilIdle();
        return chapter;
    },

    getChapters() {return chapters;},

    // Video-description style chapter timestamps ("00:00 Intro - 00:05 Outro").
    getChapterTimestamps() {return chapterTimestamps();},

    // ---- Tweens ----

    animate(id, deltas, duration = 0, opts = {}) {return applyAnimate(id, deltas, duration, opts);},

    moveTo(id, targets, duration = 0, opts = {}) {return applyMoveTo(id, targets, duration, opts);},

    recolor(id, color, duration = 0, opts = {}) {return applyRecolor(id, color, duration, opts);},

    rotateAround(id, center, angle, duration = 0, opts = {}) {return applyRotateAround(id, center, angle, duration, opts);},

    // ---- Text updates ----

    // Replace text of an existing id with a crossfade.
    // opts.fade crossfades old out / new in; opts.hold advances the cursor afterwards.
    setText(id, text, opts = {}) {
        const ids = toIdArray(id);
        const stored = ids.map((idKey) => textProp[idKey]).find((entry) => entry !== undefined);
        if (!stored)
            throw new Error(unknownIdMessage("setText()", id, "- call newText() with this id before setText()."));

        if (typeof opts !== "object" || opts === null)
            throw new Error(`setText() expects an options object, got ${typeof opts}.`);

        const {fade = 0, align = 0.5, hold = 0, fontSize} = opts;
        validateDuration(fade);
        validateDuration(hold);

        if (fontSize !== undefined) {
            if (typeof fontSize !== "number" || !Number.isFinite(fontSize) || fontSize <= 0)
                throw new Error(`setText() fontSize must be a finite number greater than 0, got ${fontSize}.`);
        }

        // Tween events target the old segment events, so bake their current
        // offsets into the replacement props - otherwise the new text snaps
        // back to its pre-tween position. The source is the text on screen:
        // the last one created for these ids. An older text was already
        // replaced by a previous setText(), and its offsets are baked into the
        // stored config, so reading them again would compound the values.
        const source = visual.findLast((value) => value.type === "text" && matchesIds(value, ids));
        const baked = {};
        if (source) {
            for (const key of ["posX", "posY", "rotation", "fontSize", "opacity"]) {
                const offset = getPropertyOffset(source, key);
                if (offset === 0) continue;

                const value = stored[key] + offset;
                // opacity is bounded, and an offset can push the baked value out of range.
                baked[key] = key === "opacity" ? Math.min(Math.max(value, 0), 1) : value;
            }
        }

        // Explicit fontSize option overrides the baked (tweened) value.
        if (fontSize !== undefined) baked.fontSize = fontSize;
        const now = getTime();

        advanceTime(fade * align);
        Engine.clear(id, fade);

        advanceTime(-fade);
        Engine.newText({
            ...stored,
            ...baked,
            text,
            flashDuration: 0,
            autoSetPosX: false,
            autoSetPosY: false,
            fadeIn: fade,
            hold
        });
        setTime(now);
    },

    centerText(id, posX = null, posY = null) {
        const ids = toIdArray(id);

        if (warnIfUnmatched("centerText()", ids)) return;

        const center = getGroupCenter(ids);

        visual.forEach((value) => {
            if (matchesIds(value, ids) && !hasEnded(value)) {
                if (posX !== null) {
                    const deltaX = posX - center.x;
                    value.posX += deltaX;
                    // Text keeps its layout anchor on the group, so a later
                    // fontSize tween scales about the moved position.
                    if (value.anchorX !== undefined) value.anchorX += deltaX;
                }

                if (posY !== null) {
                    const deltaY = posY - center.y;
                    value.posY += deltaY;
                    if (value.anchorY !== undefined) value.anchorY += deltaY;
                }
            }
        });
    },

    clear(id, fadeOut) {
        const ids = toIdArray(id);
        const now = getTime();

        if (!visual.some((value) => matchesIds(value, ids)))
            console.warn(unknownIdMessage("clear()", id));

        visual.forEach((value) => {
            if (matchesIds(value, ids)) {
                if (value.end === undefined || value.end > now) {
                    value.end = now;
                    if (typeof fadeOut === "number") value.fadeOut = fadeOut;
                }
            }
        });
    },

    clearAll(keepId, fadeOut) {
        const ids = toIdArray(keepId);
        const now = getTime();

        // A keep filter that matches nothing is usually a typo: everything would go.
        if (keepId !== undefined && keepId !== null && !visual.some((value) => matchesIds(value, ids)))
            console.warn(unknownIdMessage("clearAll()", keepId, "- nothing was kept."));

        visual.forEach((value) => {
            if (!matchesIds(value, ids)) {
                if (value.end === undefined || value.end > now) {
                    value.end = now;
                    if (typeof fadeOut === "number") value.fadeOut = fadeOut;
                }
            }
        });
    },

    // ---- Reset (tests / single-process iteration) ----

    reset() {
        visual.length = 0;
        audio.length = 0;
        chapters.length = 0;
        setTime(0);
        resetAutoId();

        for (const key of Object.keys(textProp)) delete textProp[key];
        assetMap.clear();

        for (const type of Object.keys(initialParam)) {
            Param[type] = structuredClone(initialParam[type]);
        }
        resetRenderCache();
    },

    // ---- Timeline summary / validation ----

    getTimelineSummary(opts = {}) {
        const maxEvents = Number.isFinite(opts?.maxEvents) && opts.maxEvents > 0 ? opts.maxEvents : 50;
        const events = visual.slice(0, maxEvents).map((event) => ({
            type: event.type,
            ids: event.ids,
            start: event.start ?? 0,
            end: event.end ?? event.tweenEnd ?? null,
        }));

        const byType = {};
        for (const event of visual) byType[event.type] = (byType[event.type] ?? 0) + 1;

        return {
            duration: getTime(),
            visualEvents: visual.length,
            audioEvents: audio.length,
            byType,
            chapters: chapters.map((chapter) => ({name: chapter.name, start: chapter.start, end: chapter.end})),
            events,
            truncated: visual.length > maxEvents ? visual.length - maxEvents : 0,
        };
    },

    validateTimeline() {
        const duration = getTime();
        const epsilon = 1e-6;
        const warnings = [];

        if (!(duration > 0)) {
            warnings.push("Cannot record: the timeline is 0 seconds long.");
            return {ok: false, warnings};
        }

        for (const event of visual) {
            const eventEnd = event.end ?? event.tweenEnd ?? null;
            if (event.start >= duration - epsilon && (eventEnd === null || eventEnd > event.start + epsilon)) {
                warnings.push(`never visible: ${event.type}${event.ids ? ` id ${JSON.stringify(event.ids)}` : ""} (start ${event.start ?? 0}s)`);
            } else if (eventEnd !== null && eventEnd > duration + epsilon) {
                warnings.push(`cut off: ${event.type}${event.ids ? ` id ${JSON.stringify(event.ids)}` : ""} (end ${eventEnd}s > ${duration}s)`);
            }
        }

        return {ok: warnings.length === 0, warnings};
    },

    // ---- Queries ----

    getEvents(id) {
        const ids = toIdArray(id);
        return visual.filter((value) => matchesIds(value, ids));
    },

    getSize(id) {
        const ids = toIdArray(id);
        warnIfUnmatched("getSize()", ids);
        return getGroupSize(ids);
    },

    getCenter(id) {
        const ids = toIdArray(id);
        warnIfUnmatched("getCenter()", ids);
        return getGroupCenter(ids);
    },

    // Every id currently carried by a visual event (deduped) - debugging aid
    // for the "did you mean" hints on unknown-id errors.
    getIds() {return knownIds();},

    getVisualTimeline() {return visual;},

    getAudioTimeline() {return audio;},

    getDuration() {return getTime();},

    // Call fn(i) `count` times. Iteration only: the cursor moves only through
    // the wait() calls inside fn, so this loops animations without repeating
    // the body by hand.
    repeat(count, fn) {
        if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
            throw new Error(`repeat() expects a non-negative integer count, got ${JSON.stringify(count)}.`);
        if (typeof fn !== "function")
            throw new Error("repeat() expects a callback function.");

        const times = Math.floor(count);
        for (let i = 0; i < times; i++) fn(i);
    },

    // Nested loop over a rows x columns grid, calling fn(row, column).
    repeatGrid(rows, columns, fn) {
        for (const [name, value] of [["rows", rows], ["columns", columns]]) {
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
                throw new Error(`repeatGrid() expects a non-negative integer ${name}, got ${JSON.stringify(value)}.`);
        }
        if (typeof fn !== "function")
            throw new Error("repeatGrid() expects a callback function.");

        const rowCount = Math.floor(rows);
        const columnCount = Math.floor(columns);
        for (let x = 0; x < rowCount; x++)
            for (let y = 0; y < columnCount; y++) fn(x, y);
    },

    // Next auto-assigned id (negative integer) without consuming it, so it is
    // the id the next creator would receive.
    getAutoId() {return currentAutoId();},

    // Same value as getAutoId(), but consuming it: the next auto-assigned
    // creator skips this id.
    getNextId() {return nextAutoId();}
};
