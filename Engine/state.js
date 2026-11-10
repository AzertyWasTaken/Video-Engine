"use strict";

// All cross-module mutable engine state lives here.
// The visual/audio arrays are handed out by reference (render.js caches a sort
// keyed on the visual array reference), so they are mutated in place, never reassigned.

export const visual = [];
export const audio = [];

// Monotonically increasing time cursor (seconds). Primitives cannot be shared
// by reference, so access goes through these functions.
let time = 0;

export function getTime() {return time;}

export function setTime(t) {time = t;}

export function advanceTime(sec) {time += sec;}

// Last merged config per text id, used by setText(). Stored under every id the text carries.
export const textProp = {};

// Chapter/scene markers, mutated in place like visual/audio.
export const chapters = [];

// Shorthand -> full asset path pairs, set by Engine.setAssets().
export const assetMap = new Map();

// Auto-assigned group ids are negative, so they never collide with user ids.
let autoId = -1;

export function nextAutoId() {return autoId--;}

// Auto id that no existing event uses yet: an id handed out by getAutoId() and
// then passed to a creator explicitly keeps its meaning, instead of colliding
// with the next auto-assigned id.
export function takeAutoId() {
    let id = nextAutoId();
    while (visual.some((event) => event.ids !== undefined && event.ids.includes(id)))
        id = nextAutoId();
    return id;
}

// Reset the auto-id counter (used by reset()).
export function resetAutoId() {autoId = -1;}
export function currentAutoId() {return autoId;}
