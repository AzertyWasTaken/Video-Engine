"use strict";
import {Param} from "./param.js";
import {getTime, visual} from "./state.js";

// Accept a single id or a Set of ids.
export function toIdSet(id) {
    return id !== null && typeof id === "object" ? id : new Set([id]);
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
    if (!visual.some((event) => event.id === id))
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
