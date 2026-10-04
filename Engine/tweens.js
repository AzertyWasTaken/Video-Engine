"use strict";
import {getEasing} from "./easing.js";
import {getTime, visual} from "./state.js";
import {matchesIds, requireEvents, toIdArray, validateDuration, validateOpacity} from "./validate.js";
import {getGroupCenter} from "./visualEvents.js";

// Properties that can be tweened with animate() / moveTo().
const TWEEN_KEYS = new Set([
    "posX", "posY", "fontSize", "diameter",
    "width", "height", "scaleX", "scaleY",
    "lineWidth", "strokeWidth", "opacity"
]);

// Latest property / color tween per drawable event.
const propTweens = new WeakMap();
const colorTweens = new WeakMap();

// Build-time cache of parsed hex colors for recolor().
const colorCache = new Map();

function resolveEasing(opts) {
    return getEasing(opts.easing ?? "linear", opts.direction ?? "in");
}

// Value the current tween chain holds for one object on `key` at the time cursor.
function chainValue(target, key) {
    const tween = propTweens.get(target)?.get(key);
    if (!tween) return 0;

    const span = tween.tweenEnd - tween.start;
    const p = span <= 0 ? 1 : Math.min(Math.max((getTime() - tween.start) / span, 0), 1);

    return tween.from + (tween.to - tween.from) * tween.easing(p);
}

// Current tweened offset of one object on a property (used by setText()).
export function getPropertyOffset(target, key) {
    return chainValue(target, key);
}

// Every drawable event sharing at least one queried id, each included once.
function matchedObjects(action, id) {
    requireEvents(action, id);
    const ids = toIdArray(id);
    return visual.filter((event) => matchesIds(event, ids));
}

// Push one tween event per (object, key). A new tween supersedes the previous
// one for the same (object, key) by closing its window, so chained tweens stay
// continuous and active windows never overlap. `toValue` resolves the absolute
// end value for one object / key from its current chain value. Objects that do
// not define the key are skipped (nothing would render them).
function pushTweens(objects, keys, toValue, duration, easing) {
    const now = getTime();

    for (const key of keys) {
        for (const target of objects) {
            if (target[key] === undefined) continue;

            let chain = propTweens.get(target);
            if (!chain) {
                chain = new Map();
                propTweens.set(target, chain);
            }

            const prev = chain.get(key);
            if (prev) prev.end = now;

            const from = chainValue(target, key);

            const tween = {
                type: "tween",
                target,
                key,
                from,
                to: toValue(target, key, from),
                start: now,
                tweenEnd: now + duration,
                easing
            };

            chain.set(key, tween);
            visual.push(tween);
        }
    }
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

// Tween relative property deltas on every object sharing a queried id.
// Each matching object is affected exactly once; non-sharing objects are ignored.
export function animate(id, deltas, duration = 0, opts = {}) {
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

    const objects = matchedObjects("animate()", id);
    pushTweens(objects, Object.keys(deltas), (target, key, from) => from + deltas[key], duration, easing);
}

// Set-prop tween: like animate(), but targets are absolute values.
// posX/posY target the bounding-box center of the group, other keys the final rendered property value.
// Every object sharing a queried id is affected exactly once; non-sharing objects are ignored.
export function moveTo(id, targets, duration = 0, opts = {}) {
    if (typeof targets !== "object" || targets === null || Array.isArray(targets))
        throw new Error("moveTo() expects an object of absolute target values, e.g. {posX: -200}.");

    validateDuration(duration);

    const easing = resolveEasing(opts);

    for (const key of Object.keys(targets)) {
        if (!TWEEN_KEYS.has(key))
            throw new Error(`Property "${key}" cannot be tweened with moveTo(). Tweenable properties: ${[...TWEEN_KEYS].join(", ")}.`);

        const target = targets[key];
        // opacity is absolute here, so an out-of-range target is a build-time error.
        if (key === "opacity") {
            validateOpacity(target);
            continue;
        }

        if (typeof target !== "number" || !Number.isFinite(target))
            throw new Error(`moveTo() target for "${key}" must be a finite number, got ${target}.`);
    }

    const ids = toIdArray(id);
    const objects = matchedObjects("moveTo()", id);

    for (const key of Object.keys(targets)) {
        if (key !== "posX" && key !== "posY" && !objects.some((target) => target[key] !== undefined))
            throw new Error(`moveTo(): no visual events with id ${JSON.stringify(id)} define "${key}".`);
    }

    let center = null;

    // Chains hold offsets from base values, so the absolute end value for
    // posX/posY is target minus the group center; other keys target minus
    // the object's own base value.
    pushTweens(objects, Object.keys(targets), (target, key) => {
        if (key === "posX" || key === "posY") {
            center ??= getGroupCenter(ids);
            return targets[key] - (key === "posX" ? center.x : center.y);
        }

        return targets[key] - target[key];
    }, duration, easing);
}

// Tween the color of every visual event sharing a queried id to `color`.
// Each matching event is affected exactly once.
export function recolor(id, color, duration = 0, opts = {}) {
    validateDuration(duration);

    const easing = resolveEasing(opts);
    const to = parseColor(color);
    const ids = toIdArray(id);

    let matched = 0;
    visual.forEach((event) => {
        if (!matchesIds(event, ids)) return;

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
