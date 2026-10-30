"use strict";
import {getEasing} from "./easing.js";
import {getTime, visual} from "./state.js";
import {matchesIds, requireEvents, toIdArray, validateDuration, validateOpacity} from "./validate.js";
import {getGroupCenter} from "./visualEvents.js";

// Properties that can be tweened with animate() / moveTo().
const TWEEN_KEYS = new Set([
    "posX", "posY", "rotation", "fontSize", "diameter", "arc",
    "width", "height", "scaleX", "scaleY",
    "lineWidth", "strokeWidth", "opacity"
]);

// Keys an orbit tween owns on its target: the sweep moves the object along an
// arc and spins it by the same angle, so position/rotation tweens and orbits
// never drive the same object at the same time.
const ORBIT_KEYS = new Set(["posX", "posY", "rotation"]);

// Latest property / color tween per drawable event.
const propTweens = new WeakMap();
const colorTweens = new WeakMap();

// Build-time cache of parsed hex colors for recolor().
const colorCache = new Map();

// Map an easing direction to its mirror on the reverse leg:
// in -> out, out -> in, inOut stays inOut.
function mirrorDirection(direction) {
    if (direction === "in") return "out";
    if (direction === "out") return "in";
    return "inOut";
}

// Resolve an easing, optionally shaping the direction into its mirror
// (used for the auto-reverse leg when reverseMirror is enabled).
function resolveEasing(opts, mirror = false) {
    const direction = mirror ? mirrorDirection(opts.direction ?? "in") : opts.direction ?? "in";
    return getEasing(opts.easing ?? "linear", direction);
}

// Resolve the tween-reverse options shared by animate()/moveTo()/recolor()/rotateAround().
// When enabled, a completed tween mirrors forward-to-back (after an optional
// reverseDelay). The mirror event is pushed into `visual` only - never into a
// chain WeakMap - so forward chain reads and later superseding tweens stay
// anchored to the completed value rather than the not-yet-started reverse.
// When reverseMirror is true, the mirror leg uses the mirrored easing direction:
// in -> out, out -> in, inOut -> inOut.
function resolveReverseOpts(opts) {
    const {reverse, reverseDelay, reverseMirror} = opts;
    const mirrorAliases = ["mirror", "mirrorReverse", "mirrorDirection", "reverseDirection", "reverseEase", "mirrorEase", "yoyoEase"];
    let mirror = reverseMirror;
    for (const alias of mirrorAliases) {
        if (mirror !== undefined) break;
        if (opts[alias] !== undefined) mirror = opts[alias];
    }
    if (reverse !== undefined && typeof reverse !== "boolean")
        throw new Error(`reverse must be a boolean, got ${JSON.stringify(reverse)}.`);
    if (mirror !== undefined && typeof mirror !== "boolean")
        throw new Error(`reverseMirror must be a boolean, got ${JSON.stringify(mirror)}.`);
    if (reverseDelay !== undefined) {
        if (typeof reverseDelay !== "number" || !Number.isFinite(reverseDelay) || reverseDelay < 0)
            throw new Error(`reverseDelay must be a finite non-negative number of seconds, got ${JSON.stringify(reverseDelay)}.`);
    }
    return {reverse: reverse === true, reverseMirror: mirror === true, reverseDelay: reverseDelay ?? 0};
}

// Value the current tween chain holds for one object on `key` at the time cursor.
function chainValue(target, key) {
    const tween = propTweens.get(target)?.get(key);
    if (!tween) return 0;

    const span = tween.tweenEnd - tween.start;
    const p = span <= 0 ? 1 : Math.min(Math.max((getTime() - tween.start) / span, 0), 1);

    return tween.from + (tween.to - tween.from) * tween.easing(p);
}

// True while a tween event still contributes at time t.
function tweenActive(tween, t) {
    return tween !== undefined && (tween.end === undefined || tween.end > t);
}

// Latest chain map of one target (created on first use).
function chainOf(target) {
    let chain = propTweens.get(target);
    if (!chain) {
        chain = new Map();
        propTweens.set(target, chain);
    }
    return chain;
}

// Offset an orbit tween contributes to one target on a key at time t.
// posX/posY sweep the captured pivot-relative vector; rotation adds the
// swept angle to the captured spin, so the whole turn composes.
function orbitValue(orbit, target, key, t) {
    const span = orbit.tweenEnd - orbit.start;
    const p = span <= 0 ? 1 : Math.min(Math.max((t - orbit.start) / span, 0), 1);
    const swept = orbit.orbit.fromAngle + (orbit.orbit.toAngle - orbit.orbit.fromAngle) * orbit.easing(p);

    if (key === "rotation") return orbit.orbit.r0 + swept;

    const rad = swept * Math.PI / 180;
    const {cx, cy, dx, dy} = orbit.orbit;
    const x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    const y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);

    return key === "posX" ? x - target.posX : y - target.posY;
}

// Current tweened offset of one object on a property (used by setText()).
// An active orbit supersedes the linear chain on its keys.
export function getPropertyOffset(target, key) {
    const now = getTime();
    const orbit = propTweens.get(target)?.get("orbit");
    if (ORBIT_KEYS.has(key) && tweenActive(orbit, now))
        return orbitValue(orbit, target, key, now);

    return chainValue(target, key);
}

// Pin a value on a key by pushing a zero-span hold tween: the pose keeps
// rendering (p clamps to 1) and later tweens chain from it.
function holdValue(target, key, value, now) {
    const hold = {
        type: "tween",
        target,
        key,
        from: value,
        to: value,
        start: now,
        tweenEnd: now,
        easing: (t) => t
    };

    chainOf(target).set(key, hold);
    visual.push(hold);
}

// Close an active orbit on a target and hold its current pose, so position /
// rotation tweens can chain from where the orbit left off.
function releaseOrbit(target, now) {
    const orbit = propTweens.get(target)?.get("orbit");
    if (!tweenActive(orbit, now)) return;

    for (const key of ORBIT_KEYS)
        holdValue(target, key, orbitValue(orbit, target, key, now), now);

    orbit.end = now;
}

// Close active linear posX/posY/rotation tweens on a target and hold their
// values, so an orbit owns all three keys without losing the current pose.
function releasePositionTweens(target, now) {
    const chain = propTweens.get(target);
    if (!chain) return;

    for (const key of ORBIT_KEYS) {
        const prev = chain.get(key);
        if (!tweenActive(prev, now)) continue;

        const value = chainValue(target, key);
        prev.end = now;
        holdValue(target, key, value, now);
    }
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
// Push one tween event per (object, key). A new tween supersedes the previous
// one for the same (object, key) by closing its window, so chained tweens stay
// continuous and active windows never overlap. `toValue` resolves the absolute
// end value for one object / key from its current chain value. Objects that do
// not define the key are skipped (nothing would render them).
function pushTweens(objects, keys, toValue, duration, easing, reverse, reverseEasing = easing) {
    const now = getTime();

    for (const key of keys) {
        for (const target of objects) {
            if (target[key] === undefined) continue;

            // A position/rotation tween supersedes an active orbit on the target.
            if (ORBIT_KEYS.has(key)) releaseOrbit(target, now);

            const chain = chainOf(target);

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

            // Mirror the tween backward after a delay so it auto-reverses to its
            // start value. Only into `visual` (the renderer overwrites by start
            // order), never into `propTweens`.
            if (reverse.reverse) {
                visual.push({
                    type: "tween",
                    target,
                    key,
                    from: tween.to,
                    to: tween.from,
                    start: tween.tweenEnd + reverse.reverseDelay,
                    tweenEnd: tween.tweenEnd + reverse.reverseDelay + duration,
                    easing: reverseEasing
                });
            }
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
    const reverse = resolveReverseOpts(opts);
    const reverseEasing = reverse.reverse && reverse.reverseMirror ? resolveEasing(opts, true) : easing;
    pushTweens(objects, Object.keys(deltas), (target, key, from) => from + deltas[key], duration, easing, reverse, reverseEasing);
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
    const reverse = resolveReverseOpts(opts);
    const reverseEasing = reverse.reverse && reverse.reverseMirror ? resolveEasing(opts, true) : easing;

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

        if (key === "fontSize") {
            // Keep a style-markup fontSize multiplier relative: renderer applies
            // tw.fontSize * segFontSizeMultiplier on top of obj.fontSize, so the
            // stored offset must be in base-font-size units, i.e. target minus
            // the base font size, not the rendered segment size.
            const multiplier = target.segFontSizeMultiplier ?? 1;
            return targets[key] - target[key] / multiplier;
        }

        return targets[key] - target[key];
    }, duration, easing, reverse, reverseEasing);
}

// Tween the color of every visual event sharing a queried id to `color`.
// Each matching event is affected exactly once.
export function recolor(id, color, duration = 0, opts = {}) {
    validateDuration(duration);

    const easing = resolveEasing(opts);
    const reverse = resolveReverseOpts(opts);
    const reverseEasing = reverse.reverse && reverse.reverseMirror ? resolveEasing(opts, true) : easing;
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

        // Mirror color back to its start value after a delay, into `visual` only.
        if (reverse.reverse) {
            visual.push({
                type: "tween",
                target: event,
                color: {from: tween.color.to, to: tween.color.from},
                start: tween.tweenEnd + reverse.reverseDelay,
                tweenEnd: tween.tweenEnd + reverse.reverseDelay + duration,
                easing: reverseEasing
            });
        }
        matched++;
    });

    if (matched === 0)
        throw new Error(`recolor(): no visual events with id ${JSON.stringify(id)}.`);
}

// Orbit tween: sweep every object sharing a queried id along a circular arc
// around a pivot point, spinning each by the same angle so the group turns
// rigidly around it. `center` is the pivot ({x, y}); null (or omitted) uses
// the group's bounding-box center. `angle` is clockwise degrees.
export function rotateAround(id, center, angle, duration = 0, opts = {}) {
    if (
        center !== undefined && center !== null
        && (typeof center !== "object" || Array.isArray(center)
            || typeof center.x !== "number" || !Number.isFinite(center.x)
            || typeof center.y !== "number" || !Number.isFinite(center.y))
    )
        throw new Error(`rotateAround() expects a {x, y} pivot point or null, got ${JSON.stringify(center)}.`);

    if (typeof angle !== "number" || !Number.isFinite(angle))
        throw new Error(`rotateAround() expects a finite angle in clockwise degrees, got ${angle}.`);

    validateDuration(duration);

    const easing = resolveEasing(opts);
    const reverse = resolveReverseOpts(opts);
    const reverseEasing = reverse.reverse && reverse.reverseMirror ? resolveEasing(opts, true) : easing;
    const ids = toIdArray(id);
    const objects = matchedObjects("rotateAround()", id);
    const pivot = center ?? getGroupCenter(ids);
    const now = getTime();

    for (const target of objects) {
        // Capture the current pose (active linear and orbit offsets included),
        // then let the new orbit own posX / posY / rotation on this object.
        const dx = target.posX + getPropertyOffset(target, "posX") - pivot.x;
        const dy = target.posY + getPropertyOffset(target, "posY") - pivot.y;
        const r0 = getPropertyOffset(target, "rotation");

        releaseOrbit(target, now);
        releasePositionTweens(target, now);

        const orbit = {
            type: "tween",
            target,
            orbit: {cx: pivot.x, cy: pivot.y, dx, dy, r0, fromAngle: 0, toAngle: angle},
            start: now,
            tweenEnd: now + duration,
            easing
        };

        chainOf(target).set("orbit", orbit);
        visual.push(orbit);

        // Mirror the orbit back to its start angle after a delay, into `visual` only.
        if (reverse.reverse) {
            visual.push({
                type: "tween",
                target,
                orbit: {cx: pivot.x, cy: pivot.y, dx, dy, r0, fromAngle: orbit.orbit.toAngle, toAngle: orbit.orbit.fromAngle},
                start: orbit.tweenEnd + reverse.reverseDelay,
                tweenEnd: orbit.tweenEnd + reverse.reverseDelay + duration,
                easing: reverseEasing
            });
        }
    }
}