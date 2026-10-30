"use strict";
import {Param, effectiveParam, assertKnownKeys, suggestSimilar} from "./param.js";
import {advanceTime, audio, chapters, getTime, setTime, textProp, visual, nextAutoId, currentAutoId} from "./state.js";
import {matchesIds, resolveDuration, resolvePropEntries, requireType, toIdArray, validateDuration, validateLayoutOrder, validateOpacity, validateRotation} from "./validate.js";
import {setAssets as setAssetMap, getAssets as getAssetMap} from "./assets.js";
import {getGroupCenter, getGroupSize, pushVisual as pushVisualEvent} from "./visualEvents.js";
import {addChapter as pushChapter, runScene as runSceneEvent, chapterTimestamps} from "./chapters.js";
import {animate as applyAnimate, moveTo as applyMoveTo, recolor as applyRecolor, rotateAround as applyRotateAround, getPropertyOffset} from "./tweens.js";
import {newText as createText, newTexts as createTexts} from "./textEvents.js";

// Per-type checkpoint stacks for saveParam() / undoParam().
const propCheckpoints = new Map();

// Warn (never throw) when an id matches no events yet - usually a typo.
// Events are never removed, so legitimate clears keep matching.
function describeUnknownId(action, ids) {
    const known = [];
    for (const event of visual) {
        for (const key of event.ids ?? []) {
            if (!known.includes(key)) known.push(key);
        }
        if (known.length >= 20) break;
    }

    const hints = ids
        .map((id) => suggestSimilar(id, known))
        .filter((hint, index, list) => hint !== null && list.indexOf(hint) === index);

    return `${action}: no visual events with id ${JSON.stringify(ids.length === 1 ? ids[0] : ids)} - nothing changed.` +
        (hints.length > 0 ? ` Did you mean ${hints.map((hint) => JSON.stringify(hint)).join(" or ")}?` : "") +
        (known.length > 0
            ? ` Known ids: ${known.slice(0, 8).map((key) => JSON.stringify(key)).join(", ")}.`
            : " No visual events exist yet.");
}

// Public API facade. Timeline and event logic lives in the dedicated modules;
// this object defines the full method surface used by animation scripts.
export const Engine = {
    // ---- Time cursor ----

    wait(sec) {
        if (typeof sec !== "number" || !Number.isFinite(sec))
            throw new Error(`wait() expects a finite number of seconds, got ${sec}.`);

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

    saveParam(type = "global") {
        requireType(type);

        const stack = propCheckpoints.get(type) ?? [];
        stack.push({...Param[type]});
        propCheckpoints.set(type, stack);
    },

    undoParam(type = "global") {
        requireType(type);

        const stack = propCheckpoints.get(type);
        if (!stack || stack.length === 0)
            throw new Error(`No saved checkpoint for type "${type}" - call saveParam("${type}") first.`);

        Param[type] = stack.pop();
    },

    // Scoped defaults: apply newProp, run fn(), then restore (even on throw).
    // Multi-type form: withProp({text: {...}, circle: {...}}, fn).
    withProp(newProp, fn) {
        if (typeof fn !== "function")
            throw new Error("withProp() expects a callback function.");

        const entries = resolvePropEntries(newProp);

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

            if (!isFinite(keyA) || !isFinite(keyB))
                throw new Error(`Nonnumber values are not accepted: ${keyA}, ${keyB}`);

            const value = keyA + keyB;
            if (key === "opacity") validateOpacity(value);

            Param[type][key] = value;
        }
    },

    // ---- Audio ----

    // Sound and image paths are stored as written: a registered shorthand, an
    // absolute path, or a path relative to the calling script. record() and
    // addSounds() resolve them once, after the timeline is built.
    playSound(filePath, volume) {
        if (typeof filePath !== "string" || filePath.length === 0)
            throw new Error(`playSound() expects a non-empty file path string, got ${JSON.stringify(filePath)}.`);

        if (
            volume !== undefined
            && volume !== null
            && (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0)
        )
        throw new Error(`playSound() expects a non-negative finite volume, got ${volume}.`);

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
    newTexts(texts, configs) {return createTexts(texts, configs);},

    newLine(newProp) {return pushVisualEvent("line", newProp, "newLine()");},

    newShape(newProp) {return pushVisualEvent("shape", newProp, "newShape()");},

    newRect(newProp) {return pushVisualEvent("rect", newProp, "newRect()");},

    newCircle(newProp) {return pushVisualEvent("circle", newProp, "newCircle()");},

    newImage(newProp) {return pushVisualEvent("image", newProp, "newImage()");},

    // ---- Scenes ----

    chapter(name) {return pushChapter(name);},

    scene(name, fn, opts) {
        const chapter = runSceneEvent(name, fn, opts);
        this.waitUntilIdle();
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
            throw new Error(`No text found with id ${JSON.stringify(id)} - call newText() with this id before setText().`);

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
        // back to its pre-tween position.
        const source = visual.find((value) => value.type === "text" && matchesIds(value, ids));
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
        advanceTime(fade);
    },

    centerText(id, posX = null, posY = null) {
        const ids = toIdArray(id);

        if (!visual.some((value) => matchesIds(value, ids))) {
            console.warn(describeUnknownId("centerText()", ids));
            return;
        }

        const center = getGroupCenter(ids);

        visual.forEach((value) => {
            if (matchesIds(value, ids)) {
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

    clear(id, fading) {
        const ids = toIdArray(id);
        const now = getTime();

        if (!visual.some((value) => matchesIds(value, ids)))
            console.warn(describeUnknownId("clear()", ids));

        visual.forEach((value) => {
            if (matchesIds(value, ids)) {
                if (value.end === undefined || value.end > now) {
                    value.end = now;
                    if (typeof fading === "number") value.fadeOut = fading;
                }
            }
        });
    },

    clearAll(ignoreId, fading) {
        const ids = toIdArray(ignoreId);
        const now = getTime();

        visual.forEach((value) => {
            if (!matchesIds(value, ids)) {
                if (value.end === undefined || value.end > now) {
                    value.end = now;
                    if (typeof fading === "number") value.fadeOut = fading;
                }
            }
        });
    },

    // ---- Queries ----

    getEvents(id) {
        const ids = toIdArray(id);
        return visual.filter((value) => matchesIds(value, ids));
    },

    getSize(id) {
        const ids = toIdArray(id);
        return getGroupSize(ids);
    },

    getCenter(id) {
        const ids = toIdArray(id);
        return getGroupCenter(ids);
    },

    getVisualTimeline() {return visual;},

    getAudioTimeline() {return audio;},

    getDuration() {return getTime();},

    // Repeat fn() for `seconds`, advancing the time cursor accordingly.
    // Each iteration starts at the current cursor time. Useful for looping
    // animations without manual wait()/newText() cycles.
    repeat(count, fn) {
        if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
            throw new Error(`repeat() expects a non-negative finite number of seconds, got ${count}.`);
        if (typeof fn !== "function")
            throw new Error("repeat() expects a callback function.");

        for (let i = 0; i < count; i++) fn(i);
    },

    repeatGrid(rows, columns, fn) {
        if (typeof rows !== "number" || !Number.isFinite(rows) || rows < 0)
            throw new Error(`repeat() expects a non-negative finite number of seconds, got ${rows}.`);
        if (typeof columns !== "number" || !Number.isFinite(columns) || columns < 0)
            throw new Error(`repeat() expects a non-negative finite number of seconds, got ${columns}.`);
        if (typeof fn !== "function")
            throw new Error("repeat() expects a callback function.");

        for (let x = 0; x < rows; x++)
            for (let y = 0; y < columns; y++) fn(x, y);
    },

    // Return the next auto-assigned id (negative integer). Useful when you
    // want to pre-assign an id before creating an event.
    getNextId() {return nextAutoId();},

    getCurrentId() {return currentAutoId();}
};
