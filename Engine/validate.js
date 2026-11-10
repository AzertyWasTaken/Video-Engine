"use strict";
import {Param, suggestSimilar} from "./param.js";
import {getTime, visual} from "./state.js";

// Collect leaf ids from a single id, a (nested) array of ids, or a creator
// return value ({id, seg} from segment-split newText()). Anything else is
// appended as-is so normalizeIds() can reject it with a precise error.
function collectIds(value, out) {
    if (Array.isArray(value)) {
        for (const entry of value) collectIds(entry, out);
        return;
    }

    if (value !== null && typeof value === "object"
        && (value.id !== undefined || value.seg !== undefined)) {
        if (value.id !== undefined) collectIds(value.id, out);
        if (value.seg !== undefined) collectIds(value.seg, out);
        return;
    }

    out.push(value);
}

// Accept a single id, a (nested) array of ids, or a creator return value.
// undefined/null pass through as themselves so "no filter" callers keep working.
export function toIdArray(id) {
    if (id === undefined || id === null) return [id];

    const out = [];
    collectIds(id, out);
    return out;
}

// Normalize a creation `id` prop (single id, nested array, or creator result)
// into a unique ids array. Returns null when unset so the caller can auto-assign one id.
export function normalizeIds(id) {
    if (id === undefined || id === null) return null;

    const list = toIdArray(id);
    if (list.length === 0)
        throw new Error("id array must not be empty.");

    const ids = [];
    for (const value of list) {
        if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value)))
            throw new Error(`Invalid id ${JSON.stringify(value)} - ids must be strings or finite numbers (arrays and creator results flatten).`);
        if (!ids.includes(value)) ids.push(value);
    }
    return ids;
}

// True when the event carries any of the queried ids.
// Events without ids (tween, background) never match.
export function matchesIds(event, ids) {
    return event.ids !== undefined && event.ids.some((id) => ids.includes(id));
}

// True when the event already ended at `now` (end set and passed). Geometry
// queries skip ended events, so a reused id is not skewed by its predecessors.
export function hasEnded(event, now = getTime()) {
    return event.end !== undefined && event.end <= now;
}

// Compact display of a queried id (or id list) for messages.
export function showIds(ids) {
    return JSON.stringify(ids.length === 1 ? ids[0] : ids);
}

// Every id currently carried by a visual event (deduped, creation order).
export function knownIds() {
    const known = [];
    for (const event of visual) {
        for (const id of event.ids ?? []) {
            if (!known.includes(id)) known.push(id);
        }
    }
    return known;
}

// "Did you mean" suffix for an id query that matched nothing.
export function idHintSuffix(id) {
    const known = knownIds();
    const hints = toIdArray(id)
        .map((value) => suggestSimilar(value, known))
        .filter((hint, index, list) => hint !== null && list.indexOf(hint) === index);

    return (hints.length > 0 ? ` Did you mean ${hints.map((hint) => JSON.stringify(hint)).join(" or ")}?` : "") +
        (known.length > 0
            ? ` Known ids: ${known.slice(0, 8).map((value) => JSON.stringify(value)).join(", ")}.`
            : " No visual events exist yet.");
}

// Message for an id query that matched nothing: action, ids, note, and hints.
export function unknownIdMessage(action, id, note = "- nothing changed.") {
    return `${action}: no visual events with id ${showIds(toIdArray(id))} ${note}${idHintSuffix(id)}`;
}

export function requireType(type) {
    if (!Param[type])
        throw new Error(`Unknown property type "${type}". Expected one of: ${Object.keys(Param).filter((key) => key !== "addon").join(", ")}.`);
}

// Normalize a withProp() props argument into [type, newProp] entries.
// A type-keyed object (every key names a type, every value is a props object)
// selects the multi-type form; anything else is treated as props for one type.
// `type` is the single-type fallback: withProp(props, type, fn).
export function resolvePropEntries(newProp, type = "global") {
    if (!newProp || typeof newProp !== "object")
        return [[type, newProp ?? {}]];

    const keys = Object.keys(newProp);
    const typeKeys = keys.filter((key) => Param[key] && typeof newProp[key] === "object" && newProp[key] !== null);

    if (typeKeys.length === 0)
        return [[type, newProp ?? {}]];

    if (typeKeys.length !== keys.length) {
        const stray = keys.filter((key) => !typeKeys.includes(key)).join(", ");
        throw new Error(`withProp() mixes property types with property names: ${stray}.`);
    }

    return Object.entries(newProp);
}

export function requireEvents(action, id) {
    const ids = toIdArray(id);
    if (!visual.some((event) => matchesIds(event, ids)))
        throw new Error(unknownIdMessage(action, id));
}

// End time for a `duration` property (null when the event has no fixed end).
export function resolveDuration(duration) {
    if (duration === undefined || duration === null) return null;

    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0)
        throw new Error(`Duration must be a finite number of seconds, got ${duration}.`);

    return getTime() + duration;
}

export function validateDuration(duration) {
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0)
        throw new Error(`Duration must be a finite number of seconds, got ${duration}.`);
}

export function validateRotation(rotation) {
    if (typeof rotation !== "number" || !Number.isFinite(rotation))
        throw new Error(`Rotation must be a finite number of degrees, got ${rotation}.`);
}

export function validateOpacity(opacity) {
    if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1)
        throw new Error(`Opacity must be a finite number from 0 to 1, got ${opacity}.`);
}

// Layout stacking order: any finite number; higher draws on top.
export function validateLayoutOrder(layoutOrder) {
    if (typeof layoutOrder !== "number" || !Number.isFinite(layoutOrder))
        throw new Error(`layoutOrder must be a finite number, got ${layoutOrder}.`);
}

// Validate a line's vertex array and return a fresh copy (events never share arrays).
// Each axis is optional and defaults to 0, so `{x: 5}` and `{y: 5}` are valid vertices.
export function normalizePositions(positions) {
    if (!Array.isArray(positions))
        throw new Error(`positions must be an array of {x, y} vertices, got ${JSON.stringify(positions)}.`);

    const vertices = [];
    for (const vertex of positions) {
        if (vertex === null || typeof vertex !== "object" || Array.isArray(vertex))
            throw new Error(`positions entries must be {x, y} objects, got ${JSON.stringify(vertex)}.`);

        const x = vertex.x ?? 0;
        const y = vertex.y ?? 0;

        if (typeof x !== "number" || !Number.isFinite(x))
            throw new Error(`positions x must be a finite number or omitted (defaults to 0), got ${JSON.stringify(vertex.x)}.`);
        if (typeof y !== "number" || !Number.isFinite(y))
            throw new Error(`positions y must be a finite number or omitted (defaults to 0), got ${JSON.stringify(vertex.y)}.`);

        vertices.push({x, y});
    }
    return vertices;
}

export function validateScales(scaleX, scaleY) {
    if (typeof scaleX !== "number" || !Number.isFinite(scaleX))
        throw new Error(`scaleX must be a finite number, got ${scaleX}.`);
    if (typeof scaleY !== "number" || !Number.isFinite(scaleY))
        throw new Error(`scaleY must be a finite number, got ${scaleY}.`);
}

// Circle arc sweep in clockwise degrees: a finite number from 0 up.
// Values above 360 render as a full circle.
export function validateArc(arc) {
    if (typeof arc !== "number" || !Number.isFinite(arc) || arc < 0)
        throw new Error(`arc must be a finite number of clockwise degrees from 0 up, got ${arc}.`);
}

// Text glow: a non-negative blur radius, a 0..1 intensity multiplier,
// and a CSS color for the halo.
export function validateGlow(range, intensity, color) {
    if (typeof range !== "number" || !Number.isFinite(range) || range < 0)
        throw new Error(`glowRange must be a finite number of pixels from 0 up, got ${range}.`);

    if (typeof intensity !== "number" || !Number.isFinite(intensity) || intensity < 0 || intensity > 1)
        throw new Error(`glowIntensity must be a finite number from 0 to 1, got ${intensity}.`);

    if (typeof color !== "string" || color.length === 0)
        throw new Error(`glowColor must be a non-empty CSS color string, got ${JSON.stringify(color)}.`);
}
