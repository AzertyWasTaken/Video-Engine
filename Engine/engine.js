"use strict";
import path from 'path';
import {fileURLToPath} from "url";
import {Param} from "./param.js";
import {getEasing} from "./easing.js";
import {
    getSegmentsWidth,
    wrapTextSegments,
    measureTextWidth
} from "./textParser.js";

const visual = [];
const audio = [];

let audioFile = fileURLToPath(import.meta.url);

const textProp = {};

// Per-type checkpoint stacks for saveParam() / undoParam().
const propCheckpoints = new Map();

// Auto-assigned group ids are negative, so they never collide with user ids.
let autoId = -1;

// Latest property tween per (id, key), and per drawable event for colors.
const tweenChains = new Map();
const colorTweens = new WeakMap();

// Build-time cache of parsed hex colors for recolor().
const colorCache = new Map();

let time = 0;
let textLength = 0;

// Properties that can be tweened with animate() / moveTo().
const TWEEN_KEYS = new Set([
    "posX", "posY", "fontSize", "diameter",
    "width", "height", "lengthX", "lengthY", "lineWidth"
]);

// Fields copied from the merged config into each visual event.
// Adding a visual type means one entry here plus a draw branch in render.js.
const VISUAL_FIELDS = {
    line: ["posX", "posY", "lengthX", "lengthY", "lineWidth", "color", "fadeIn", "fadeOut"],
    rect: ["posX", "posY", "width", "height", "color", "fadeIn", "fadeOut"],
    circle: ["posX", "posY", "diameter", "color", "fadeIn", "fadeOut"],
    image: ["src", "posX", "posY", "width", "height", "fadeIn", "fadeOut"]
};

function getItemSize(item) {
    switch (item.type) {
        case "text": return {x: measureTextWidth(item), y: item.fontSize};

        case "circle": return {x: item.diameter, y: item.diameter};

        case "line": return {x: item.lengthX + item.lineWidth, y: item.lengthY + item.lineWidth};

        case "rect": return {x: item.width, y: item.height};

        case "image": return {x: item.width, y: item.height};

        default: throw new Error(`Invalid item type ${item.type}`);
    }
}

// Get the center point of grouped `id` items
function getGroupCenter(id) {
    const updMin = (a, b) => a > b || a === null ? b : a;
    const updMax = (a, b) => a < b || a === null ? b : a;

    const minPos = {x: null, y: null};
    const maxPos = {x: null, y: null};

    visual.forEach((value) => {
        if (id.has(value.id)) {
            const itemSize = getItemSize(value);

            minPos.x = updMin(minPos.x, value.posX - itemSize.x / 2);
            minPos.y = updMin(minPos.y, value.posY - itemSize.y / 2);

            maxPos.x = updMax(maxPos.x, value.posX + itemSize.x / 2);
            maxPos.y = updMax(maxPos.y, value.posY + itemSize.y / 2);
        }
    });    

    return {x: ((minPos.x ?? 0) + (maxPos.x ?? 0)) / 2, y: ((minPos.y ?? 0) + (maxPos.y ?? 0)) / 2};
}

function toIdSet(id) {
    return id !== null && typeof id === "object" ? id : new Set([id]);
}

function nextAutoId() {
    return autoId--;
}

function requireType(type) {
    if (!Param[type])
        throw new Error(`Unknown property type "${type}". Expected one of: ${Object.keys(Param).filter((key) => key !== "addon").join(", ")}.`);
}

function requireEvents(action, id) {
    if (!visual.some((event) => event.id === id))
        throw new Error(`${action}: no visual events with id ${JSON.stringify(id)}.`);
}

// End time for a `duration` property (null when the event has no fixed end).
function resolveDuration(duration) {
    if (duration === undefined || duration === null) return null;

    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0)
        throw new Error(`Duration must be a finite number of seconds, got ${duration}.`);

    return time + duration;
}

function validateDuration(duration) {
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0)
        throw new Error(`Duration must be a finite number of seconds, got ${duration}.`);
}

function resolveEasing(opts) {
    return getEasing(opts.easing ?? "linear");
}

// Value the current tween chain holds for (id, key) at the time cursor.
function chainValue(id, key) {
    const tween = tweenChains.get(id)?.get(key);
    if (!tween) return 0;

    const span = tween.tweenEnd - tween.start;
    const p = span <= 0 ? 1 : Math.min(Math.max((time - tween.start) / span, 0), 1);

    return tween.from + (tween.to - tween.from) * tween.easing(p);
}

// Push one tween event per key. A new tween supersedes the previous one for
// the same (id, key) by closing its window, so chained tweens stay continuous
// and active windows never overlap.
function pushTweens(targetId, deltas, duration, easing) {
    let chain = tweenChains.get(targetId);
    if (!chain) {
        chain = new Map();
        tweenChains.set(targetId, chain);
    }

    for (const key of Object.keys(deltas)) {
        const prev = chain.get(key);
        if (prev) prev.end = time;

        const from = chainValue(targetId, key);

        const tween = {
            type: "tween",
            targetId,
            key,
            from,
            to: from + deltas[key],
            start: time,
            tweenEnd: time + duration,
            easing
        };

        chain.set(key, tween);
        visual.push(tween);
    }
}

// Base (pre-tween) value of `key` on the first event with the id that defines it.
function baseValue(targetId, key) {
    const event = visual.find((value) => value.id === targetId && value[key] !== undefined);

    if (!event)
        throw new Error(`moveTo(): no visual events with id ${JSON.stringify(targetId)} define "${key}".`);

    return event[key];
}

function parseColor(color) {
    if (typeof color !== "string")
        throw new Error(`Invalid color: ${JSON.stringify(color)}.`);

    const cached = colorCache.get(color);
    if (cached) return cached;

    let match = /^#([0-9a-f]{6})$/i.exec(color);
    if (match) {
        const n = match[1];
        const rgb = [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
        colorCache.set(color, rgb);
        return rgb;
    }

    match = /^#([0-9a-f]{3})$/i.exec(color);
    if (match) {
        const n = match[1];
        const rgb = [parseInt(n[0] + n[0], 16), parseInt(n[1] + n[1], 16), parseInt(n[2] + n[2], 16)];
        colorCache.set(color, rgb);
        return rgb;
    }

    throw new Error(`recolor() only supports hex colors (#RGB or #RRGGBB), got "${color}".`);
}

// Color the given color tween holds at time t, as an RGB array.
function colorChainValue(tween, t) {
    const span = tween.tweenEnd - tween.start;
    const p = span <= 0 ? 1 : Math.min(Math.max((t - tween.start) / span, 0), 1);
    const e = tween.easing(p);
    const from = tween.color.from;
    const to = tween.color.to;

    return [
        from[0] + (to[0] - from[0]) * e,
        from[1] + (to[1] - from[1]) * e,
        from[2] + (to[2] - from[2]) * e
    ];
}

function pushTextSegment(prop, seg, posX, posY, end) {
    const event = {
        type: "text",
        id: prop.id,
        text: seg.text,
        posX,
        posY,
        fontFamily: prop.fontFamily,
        fontSize: prop.fontSize,
        fontColor: seg.color ?? prop.fontColor,
        fontWeight: seg.bold ? 700 : prop.fontWeight,
        flashDuration: prop.flashDuration,
        flashColor: prop.flashColor,
        fadeIn: prop.fadeIn,
        fadeOut: prop.fadeOut,
        start: time
    };

    if (end !== null) event.end = end;
    visual.push(event);
}

function pushTextLine(prop, segments, linePosY, end) {
    // If parsing removed everything (edge-case), throw an error.
    if (segments.length === 0)
        throw new Error("Text lines must have at least one segment.");

    // Measure widths per segment so we can preserve centered alignment.
    const [totalWidth, segWidths] = getSegmentsWidth(prop, segments);

    let currWidth = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        if (typeof seg === "object") {
            textLength += seg.text.length;
            const segWidth = segWidths[i];

            const segCenterOffset = currWidth + segWidth / 2 - totalWidth / 2;
            const segPosX = prop.posX + segCenterOffset;

            pushTextSegment(prop, seg, segPosX, linePosY, end);

            currWidth += segWidth;
        } else {
            prop.onTextSegment(textLength);
            textLength = 0;
        }
    }

    return totalWidth;
}

export const Engine = {
    wait(sec) {
        if (sec !== undefined && sec !== null
            && (typeof sec !== "number" || !Number.isFinite(sec)))
            throw new Error(`wait() expects a finite number of seconds, got ${sec}.`);

        time += sec ?? 0;
    },

    seek(t) {
        if (typeof t !== "number" || !Number.isFinite(t))
            throw new Error(`seek() expects a finite time in seconds, got ${t}.`);

        time = t;
    },

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
    withProp(newProp, type, fn) {
        if (typeof type === "function") {
            fn = type;
            type = "text";
        }

        if (typeof fn !== "function")
            throw new Error("withProp() expects a callback function.");

        requireType(type);

        const snapshot = {...Param[type]};
        Engine.setProp(newProp ?? {}, type);
        try {
            fn();
        } finally {
            Param[type] = snapshot;
        }
    },

    playSound(filePath, volume) {
        if (typeof filePath !== "string")
            throw new Error(`playSound() expects a file path string, got ${JSON.stringify(filePath)}.`);

        audio.push({
            sound: path.join(audioFile, filePath),
            volume: volume ?? 1,
            start: time
        });
    },

    setAudioFile(filePath) {
        audioFile = filePath;
    },

    setBackgroundColor(color) {
        visual.push({type: "background", color: color, start: time});
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

    // Generic visual event creation, table-driven via VISUAL_FIELDS.
    pushVisual(type, newProp) {
        requireType(type);

        const prop = {...Param[type], ...newProp};
        if (prop.id === undefined || prop.id === null) prop.id = nextAutoId();

        const event = {type, id: prop.id, start: time};
        for (const key of VISUAL_FIELDS[type]) event[key] = prop[key];

        const end = resolveDuration(prop.duration);
        if (end !== null) event.end = end;

        visual.push(event);
        return prop.id;
    },

    newLine(newProp) {return Engine.pushVisual("line", newProp);},

    newRect(newProp) {return Engine.pushVisual("rect", newProp);},

    newCircle(newProp) {return Engine.pushVisual("circle", newProp);},

    newImage(newProp) {return Engine.pushVisual("image", newProp);},

    newText(newProp) {
        requireType("text");

        const prop = {...Param.text, ...newProp};

        if (typeof prop.text !== "string")
            throw new Error(`Text must be a string, got ${typeof prop.text}.`);

        if (prop.id === undefined || prop.id === null) prop.id = nextAutoId();
        textProp[prop.id] = prop;
        textLength = 0;

        const end = resolveDuration(prop.duration);

        // Wrap while preserving bold state across line breaks.
        let lines = wrapTextSegments(prop);

        const lineHeight = prop.fontSize;
        const totalHeight = lines.length * lineHeight;

        // Get y-position at the center of the text
        let posY = prop.posY - totalHeight / 2 + lineHeight / 2;
        // Adjust y-position depending of `prop.alignY`
        posY += totalHeight * prop.alignY / 2;

        let totalWidth = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineSegments = lines[i];
            const lineWidth = pushTextLine(prop, lineSegments, posY, end);
            totalWidth = Math.max(totalWidth, lineWidth);
            posY += lineHeight;
        }

        prop.onTextSegment(textLength);
        textLength = 0;

        if (prop.autoSetPosX) Param.text.posX += totalWidth;
        if (prop.autoSetPosY) Param.text.posY += totalHeight;

        return prop.id;
    },

    // Tween relative property deltas on every event with the given id.
    animate(id, deltas, duration = 1, opts = {}) {
        if (typeof deltas !== "object" || deltas === null || Array.isArray(deltas))
            throw new Error("animate() expects an object of property deltas, e.g. {posX: -200}.");

        validateDuration(duration);

        const easing = resolveEasing(opts);

        for (const key of Object.keys(deltas)) {
            if (!TWEEN_KEYS.has(key))
                throw new Error(`Property "${key}" cannot be animated. Tweenable properties: ${[...TWEEN_KEYS].join(", ")}.`);

            const delta = deltas[key];
            if (typeof delta !== "number" || !Number.isFinite(delta))
                throw new Error(`animate() delta for "${key}" must be a finite number, got ${delta}.`);
        }

        for (const targetId of toIdSet(id)) {
            requireEvents("animate()", targetId);
            pushTweens(targetId, deltas, duration, easing);
        }
    },

    // Set-prop tween: like animate(), but targets are absolute values.
    // posX/posY target the bounding-box center of the group, other keys the final rendered property value.
    moveTo(id, targets, duration = 1, opts = {}) {
        if (typeof targets !== "object" || targets === null || Array.isArray(targets))
            throw new Error("moveTo() expects an object of absolute target values, e.g. {posX: -200}.");

        validateDuration(duration);

        const easing = resolveEasing(opts);

        for (const key of Object.keys(targets)) {
            if (!TWEEN_KEYS.has(key))
                throw new Error(`Property "${key}" cannot be tweened with moveTo(). Tweenable properties: ${[...TWEEN_KEYS].join(", ")}.`);

            const target = targets[key];
            if (typeof target !== "number" || !Number.isFinite(target))
                throw new Error(`moveTo() target for "${key}" must be a finite number, got ${target}.`);
        }

        const ids = toIdSet(id);
        let center = null;

        for (const targetId of ids) {
            requireEvents("moveTo()", targetId);

            const deltas = {};
            // Tween chains hold offsets from base values, so the delta to an
            // absolute target is target minus base minus current offset.
            for (const key of Object.keys(targets)) {
                let base;
                if (key === "posX" || key === "posY") {
                    center ??= getGroupCenter(ids);
                    base = key === "posX" ? center.x : center.y;
                } else {
                    base = baseValue(targetId, key);
                }

                deltas[key] = targets[key] - base - chainValue(targetId, key);
            }

            pushTweens(targetId, deltas, duration, easing);
        }
    },

    // Tween the color of every visual event with the given id to `color`.
    recolor(id, color, duration = 1, opts = {}) {
        validateDuration(duration);

        const easing = resolveEasing(opts);
        const to = parseColor(color);
        const ids = toIdSet(id);

        let matched = 0;
        visual.forEach((event) => {
            if (!ids.has(event.id)) return;

            const base = event.color ?? event.fontColor;
            if (base === undefined) return;

            const prev = colorTweens.get(event);
            if (prev) prev.end = time;

            const tween = {
                type: "tween",
                target: event,
                color: {from: prev ? colorChainValue(prev, time) : parseColor(base), to},
                start: time,
                tweenEnd: time + duration,
                easing
            };

            colorTweens.set(event, tween);
            visual.push(tween);
            matched++;
        });

        if (matched === 0)
            throw new Error(`recolor(): no visual events with id ${JSON.stringify(id)}.`);
    },

    setText(id, text, fading = 0) {
        if (!textProp[id])
            throw new Error(`No text found with id ${JSON.stringify(id)} - call newText() with this id before setText().`);

        Engine.clear(id, fading);
        Engine.wait(-fading);

        Engine.newText({
            ...textProp[id],
            text,
            flashDuration: 0,
            autoSetPosX: false,
            autoSetPosY: false,
            fadeIn: fading,
        });

        Engine.wait(fading);
    },

    centerText(id, posX = null, posY = null) {
        const ids = toIdSet(id);
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

        visual.forEach((value) => {
            if (ids.has(value.id)) {
                value.end ??= time;
                if (typeof fading === "number") value.fadeOut = fading;
            }
        });
    },

    getEvents(id) {
        const ids = toIdSet(id);
        return visual.filter((value) => ids.has(value.id));
    },

    getVisualTimeline() {return visual;},
    getAudioTimeline() {return audio;},
    getDuration() {return time;}
};
