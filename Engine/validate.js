"use strict";
import {Param} from "./param.js";
import {getTime, visual} from "./state.js";

// Accept a single id or an array of ids.
export function toIdArray(id) {
    return Array.isArray(id) ? id : [id];
}

// Normalize a creation `id` prop (single id or array) into a unique ids array.
// Returns null when unset so the caller can auto-assign one id.
export function normalizeIds(id) {
    if (id === undefined || id === null) return null;

    const list = Array.isArray(id) ? id : [id];
    if (list.length === 0)
        throw new Error("id array must not be empty.");

    const ids = [];
    for (const value of list) {
        if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value)))
            throw new Error(`Invalid id ${JSON.stringify(value)} - ids must be strings or finite numbers.`);
        if (!ids.includes(value)) ids.push(value);
    }
    return ids;
}

// True when the event carries any of the queried ids.
// Events without ids (tween, background) never match.
export function matchesIds(event, ids) {
    return event.ids !== undefined && event.ids.some((id) => ids.includes(id));
}

export function requireType(type) {
    if (!Param[type])
        throw new Error(`Unknown property type "${type}". Expected one of: ${Object.keys(Param).filter((key) => key !== "addon").join(", ")}.`);
}

// Normalize a withProp() props argument into [type, newProp] entries.
// A type-keyed object (every key names a type, every value is a props object)
// selects the multi-type form; anything else is treated as props for one type.
export function resolvePropEntries(newProp) {
    if (!newProp || typeof newProp !== "object")
        return [["text", newProp ?? {}]];

    const keys = Object.keys(newProp);
    const typeKeys = keys.filter((key) => Param[key] && typeof newProp[key] === "object" && newProp[key] !== null);

    if (typeKeys.length === 0)
        return [["text", newProp ?? {}]];

    if (typeKeys.length !== keys.length) {
        const stray = keys.filter((key) => !typeKeys.includes(key)).join(", ");
        throw new Error(`withProp() mixes property types with property names: ${stray}.`);
    }

    return Object.entries(newProp);
}

export function requireEvents(action, id) {
    const ids = toIdArray(id);
    if (!visual.some((event) => matchesIds(event, ids)))
        throw new Error(`${action}: no visual events with id ${JSON.stringify(id)}.`);
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

export function validateOpacity(opacity) {
    if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1)
        throw new Error(`Opacity must be a finite number from 0 to 1, got ${opacity}.`);
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

export function validateLoop(loop) {
    if (typeof loop !== "boolean")
        throw new Error(`loop must be a boolean, got ${JSON.stringify(loop)}.`);
}
