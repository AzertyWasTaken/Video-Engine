"use strict";
import {getEasing} from "./easing.js";
import {getTime, visual} from "./state.js";
import {requireEvents, toIdSet, validateDuration} from "./validate.js";
import {getGroupCenter} from "./visualEvents.js";

// Properties that can be tweened with animate() / moveTo().
const TWEEN_KEYS = new Set([
    "posX", "posY", "fontSize", "diameter",
    "width", "height", "lengthX", "lengthY",
    "lineWidth", "strokeWidth"
]);

// Latest property tween per (id, key), and per drawable event for colors.
const tweenChains = new Map();
const colorTweens = new WeakMap();

// Build-time cache of parsed hex colors for recolor().
const colorCache = new Map();

function resolveEasing(opts) {
    return getEasing(opts.easing ?? "linear");
}

// Value the current tween chain holds for (id, key) at the time cursor.
function chainValue(id, key) {
    const tween = tweenChains.get(id)?.get(key);
    if (!tween) return 0;

    const span = tween.tweenEnd - tween.start;
    const p = span <= 0 ? 1 : Math.min(Math.max((getTime() - tween.start) / span, 0), 1);

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
        if (prev) prev.end = getTime();

        const from = chainValue(targetId, key);

        const tween = {
            type: "tween",
            targetId,
            key,
            from,
            to: from + deltas[key],
            start: getTime(),
            tweenEnd: getTime() + duration,
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

// ---- Public tween API ----

// Tween relative property deltas on every event with the given id.
export function animate(id, deltas, duration = 1, opts = {}) {
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
}

// Set-prop tween: like animate(), but targets are absolute values.
// posX/posY target the bounding-box center of the group, other keys the final rendered property value.
export function moveTo(id, targets, duration = 1, opts = {}) {
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
}

// Tween the color of every visual event with the given id to `color`.
export function recolor(id, color, duration = 1, opts = {}) {
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
        if (prev) prev.end = getTime();

        const tween = {
            type: "tween",
            target: event,
            color: {from: prev ? colorChainValue(prev, getTime()) : parseColor(base), to},
            start: getTime(),
            tweenEnd: getTime() + duration,
            easing
        };

        colorTweens.set(event, tween);
        visual.push(tween);
        matched++;
    });

    if (matched === 0)
        throw new Error(`recolor(): no visual events with id ${JSON.stringify(id)}.`);
}
