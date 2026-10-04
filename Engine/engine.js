"use strict";
import {Param, effectiveParam} from "./param.js";
import {advanceTime, audio, chapters, getTime, setTime, textProp, visual, nextAutoId} from "./state.js";
import {matchesIds, resolveDuration, resolvePropEntries, requireType, toIdArray, validateDuration, validateOpacity, validateRotation} from "./validate.js";
import {setAssets as setAssetMap, getAssets as getAssetMap} from "./assets.js";
import {getGroupCenter, pushVisual as pushVisualEvent} from "./visualEvents.js";
import {addChapter as pushChapter, runScene as runSceneEvent} from "./chapters.js";
import {animate as applyAnimate, moveTo as applyMoveTo, recolor as applyRecolor, getPropertyOffset} from "./tweens.js";
import {newText as createText} from "./textEvents.js";

// Per-type checkpoint stacks for saveParam() / undoParam().
const propCheckpoints = new Map();

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

        if (latest !== null) advanceTime(latest - now);
    },

    // ---- Param defaults ----

    saveParam(type = "text") {
        requireType(type);

        const stack = propCheckpoints.get(type) ?? [];
        stack.push({...Param[type]});
        propCheckpoints.set(type, stack);
    },

    undoParam(type = "text") {
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

    getGlobalProp(type = "text") {
        requireType(type);
        return Param[type];
    },

    getProp(key, type = "text") {
        requireType(type);
        return effectiveParam(type, key);
    },

    setProp(newProp, type = "text") {
        requireType(type);

        for (const key in newProp) {
            // `undefined` re-inherits the global default on a type, so it skips validation.
            if (key === "opacity" && (type === "global" || newProp[key] !== undefined))
                validateOpacity(newProp[key]);

            if (key === "rotation" && (type === "global" || newProp[key] !== undefined))
                validateRotation(newProp[key]);

            Param[type][key] = newProp[key];
        }
    },

    changeProp(newProp, type = "text") {
        requireType(type);

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

    pushVisual(type, newProp) {return pushVisualEvent(type, newProp);},

    newText(newProp) {return createText(newProp);},

    newLine(newProp) {return pushVisualEvent("line", newProp);},

    newRect(newProp) {return pushVisualEvent("rect", newProp);},

    newCircle(newProp) {return pushVisualEvent("circle", newProp);},

    newImage(newProp) {return pushVisualEvent("image", newProp);},

    // ---- Scenes ----

    chapter(name) {return pushChapter(name);},

    scene(name, fn, opts) {return runSceneEvent(name, fn, opts);},

    getChapters() {return chapters;},

    // ---- Tweens ----

    animate(id, deltas, duration = 0, opts = {}) {return applyAnimate(id, deltas, duration, opts);},

    moveTo(id, targets, duration = 0, opts = {}) {return applyMoveTo(id, targets, duration, opts);},

    recolor(id, color, duration = 0, opts = {}) {return applyRecolor(id, color, duration, opts);},

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

        const {fade = 0, hold = 0} = opts;
        validateDuration(fade);
        validateDuration(hold);

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

        if (!visual.some((value) => matchesIds(value, ids))) return;

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

        visual.forEach((value) => {
            if (matchesIds(value, ids)) {
                if (value.end === undefined || value.end > now) value.end = now;
                if (typeof fading === "number") value.fadeOut = fading;
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
        return getGroupCenter(ids);
    },

    getVisualTimeline() {return visual;},

    getAudioTimeline() {return audio;},

    getDuration() {return getTime();},

    getNextId() {return nextAutoId();}
};
