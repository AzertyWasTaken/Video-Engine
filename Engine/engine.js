"use strict";
import path from "path";
import {Param} from "./param.js";
import {advanceTime, audio, chapters, getTime, setTime, textProp, visual} from "./state.js";
import {resolveDuration, resolvePropEntries, requireType, toIdSet, validateDuration} from "./validate.js";
import {getGroupCenter, pushVisual as pushVisualEvent} from "./visualEvents.js";
import {addChapter as pushChapter, runScene as runSceneEvent} from "./chapters.js";
import {animate as applyAnimate, moveTo as applyMoveTo, recolor as applyRecolor} from "./tweens.js";
import {newText as createText} from "./textEvents.js";

// Per-type checkpoint stacks for saveParam() / undoParam().
const propCheckpoints = new Map();

// Sound paths are joined against this base.
// Null means resolve against the current working directory; setAudioFile() overrides it.
let audioFile = null;

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
        return Param[type][key];
    },

    setProp(newProp, type = "text") {
        requireType(type);

        for (const key in newProp) {
            Param[type][key] = newProp[key];
        }
    },

    changeProp(newProp, type = "text") {
        requireType(type);

        for (const key in newProp) {
            const keyA = Param[type][key];
            const keyB = newProp[key];

            if (!isFinite(keyA) || !isFinite(keyB))
                throw new Error(`Nonnumber values are not accepted: ${keyA}, ${keyB}`);

            Param[type][key] += keyB;
        }
    },

    // ---- Audio ----

    playSound(filePath, volume) {
        if (typeof filePath !== "string" || filePath.length === 0)
            throw new Error(`playSound() expects a non-empty file path string, got ${JSON.stringify(filePath)}.`);

        if (
            volume !== undefined
            && volume !== null
            && (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0)
        )
        throw new Error(`playSound() expects a non-negative finite volume, got ${volume}.`);

        const sound = path.isAbsolute(filePath) || !audioFile
        ? filePath
        : path.join(audioFile, filePath);

        audio.push({
            sound,
            volume: volume ?? 1,
            start: getTime()
        });
    },

    setAudioFile(filePath) {audioFile = filePath;},

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

    animate(id, deltas, duration = 1, opts = {}) {return applyAnimate(id, deltas, duration, opts);},

    moveTo(id, targets, duration = 1, opts = {}) {return applyMoveTo(id, targets, duration, opts);},

    recolor(id, color, duration = 1, opts = {}) {return applyRecolor(id, color, duration, opts);},

    // ---- Text updates ----

    // Replace text of an existing id with a crossfade.
    // opts.fade crossfades old out / new in; opts.hold advances the cursor afterwards.
    setText(id, text, opts = {}) {
        if (!textProp[id])
            throw new Error(`No text found with id ${JSON.stringify(id)} - call newText() with this id before setText().`);

        if (typeof opts !== "object" || opts === null)
            throw new Error(`setText() expects an options object, got ${typeof opts}.`);

        const {fade = 0, hold = 0} = opts;
        validateDuration(fade);
        validateDuration(hold);

        Engine.clear(id, fade);
        advanceTime(-fade);

        Engine.newText({
            ...textProp[id],
            text,
            flashDuration: 0,
            autoSetPosX: false,
            autoSetPosY: false,
            fadeIn: fade,
        });

        advanceTime(fade + hold);
    },

    centerText(id, posX = null, posY = null) {
        const ids = toIdSet(id);

        if (!visual.some((value) => ids.has(value.id)))
            throw new Error(`centerText(): no visual events with id ${JSON.stringify(id)}.`);

        const center = getGroupCenter(ids);

        visual.forEach((value) => {
            if (ids.has(value.id)) {
                if (posX !== null) value.posX += posX - center.x;
                if (posY !== null) value.posY += posY - center.y;
            }
        });
    },

    clear(id, fading) {
        const ids = toIdSet(id);
        const now = getTime();

        visual.forEach((value) => {
            if (ids.has(value.id)) {
                if (value.end === undefined || value.end > now) value.end = now;
                if (typeof fading === "number") value.fadeOut = fading;
            }
        });
    },

    // ---- Queries ----

    getEvents(id) {
        const ids = toIdSet(id);
        return visual.filter((value) => ids.has(value.id));
    },

    getVisualTimeline() {return visual;},

    getAudioTimeline() {return audio;},

    getDuration() {return getTime();}
};
