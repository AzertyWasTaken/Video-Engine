"use strict";
import {mergeParam} from "./param.js";
import {measureTextWidth} from "./textParser.js";
import {getTime, advanceTime, nextAutoId, visual} from "./state.js";
import {
    matchesIds, normalizeIds, normalizePositions,
    requireType, resolveDuration,
    validateArc, validateDuration, validateLayoutOrder, validateLoop, validateOpacity, validateRotation, validateScales
} from "./validate.js";

// Fields copied from the merged config into each visual event.
// Adding a visual type means one entry here plus a draw branch in render.js.
const VISUAL_FIELDS = {
    line: ["posX", "posY", "rotation", "positions", "scaleX", "scaleY", "lineWidth", "loop", "color", "fadeIn", "fadeOut", "opacity", "layoutOrder"],
    rect: ["posX", "posY", "rotation", "width", "height", "color", "strokeColor", "strokeWidth", "fadeIn", "fadeOut", "opacity", "layoutOrder"],
    circle: ["posX", "posY", "rotation", "diameter", "arc", "color", "strokeColor", "strokeWidth", "fadeIn", "fadeOut", "opacity", "layoutOrder"],
    image: ["posX", "posY", "rotation", "src", "width", "height", "fadeIn", "fadeOut", "opacity", "layoutOrder"]
};

// Bounding box of an event relative to its posX/posY anchor, used for
// alignment baking and group centering.
function getItemBox(item) {
    switch (item.type) {
        case "text": {
            const half = measureTextWidth(item) / 2;
            return {minX: -half, maxX: half, minY: -item.fontSize / 2, maxY: item.fontSize / 2};
        }

        case "circle":
            return {minX: -item.diameter / 2, maxX: item.diameter / 2, minY: -item.diameter / 2, maxY: item.diameter / 2};

        case "line": {
            let minX = 0;
            let maxX = 0;
            let minY = 0;
            let maxY = 0;
            let first = true;

            for (const vertex of item.positions) {
                const x = vertex.x * item.scaleX;
                const y = vertex.y * item.scaleY;

                if (first) {
                    minX = maxX = x;
                    minY = maxY = y;
                    first = false;
                    continue;
                }

                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }

            const half = item.lineWidth / 2;
            return {minX: minX - half, maxX: maxX + half, minY: minY - half, maxY: maxY + half};
        }

        case "rect":
        case "image":
            return {minX: -item.width / 2, maxX: item.width / 2, minY: -item.height / 2, maxY: item.height / 2};

        default: throw new Error(`Invalid item type ${item.type}`);
    }
}

// Bounding box of grouped `id` items in canvas space (unrotated, the same
// box alignment baking and centerText() use). Empty group: every edge 0.
export function getGroupBounds(ids) {
    const updMin = (a, b) => a > b || a === null ? b : a;
    const updMax = (a, b) => a < b || a === null ? b : a;

    const minPos = {x: null, y: null};
    const maxPos = {x: null, y: null};

    visual.forEach((value) => {
        if (matchesIds(value, ids)) {
            const box = getItemBox(value);

            minPos.x = updMin(minPos.x, value.posX + box.minX);
            minPos.y = updMin(minPos.y, value.posY + box.minY);

            maxPos.x = updMax(maxPos.x, value.posX + box.maxX);
            maxPos.y = updMax(maxPos.y, value.posY + box.maxY);
        }
    });

    return {minX: minPos.x ?? 0, minY: minPos.y ?? 0, maxX: maxPos.x ?? 0, maxY: maxPos.y ?? 0};
}

// Get the center point of grouped `id` items
export function getGroupCenter(ids) {
    const box = getGroupBounds(ids);
    return {x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2};
}

// Size of the bounding box of grouped `id` items
export function getGroupSize(ids) {
    const box = getGroupBounds(ids);
    return {width: box.maxX - box.minX, height: box.maxY - box.minY};
}

// Generic visual event creation, table-driven via VISUAL_FIELDS.
export function pushVisual(type, newProp, source = "pushVisual()") {
    requireType(type);

    const prop = mergeParam(type, newProp, source);
    validateOpacity(prop.opacity);
    validateRotation(prop.rotation);
    validateLayoutOrder(prop.layoutOrder);
    prop.id = normalizeIds(prop.id) ?? [nextAutoId()];

    if (type === "circle") {
        validateArc(prop.arc);
    }

    if (type === "line") {
        validateScales(prop.scaleX, prop.scaleY);
        validateLoop(prop.loop);
        prop.positions = normalizePositions(prop.positions);

        // Closing the path needs a real segment, so 3 vertices is the minimum.
        if (prop.loop && prop.positions.length < 3)
            throw new Error(
                `loop needs at least 3 positions to close the path, got ${prop.positions.length}.`
            );
    }

    const event = {type, ids: prop.id, start: getTime()};
    for (const key of VISUAL_FIELDS[type]) event[key] = prop[key];

    // Bake alignment: the box lands on the chosen side of the anchor
    // (align -1 puts box.max on the anchor, +1 puts box.min there, 0 keeps it).
    const box = getItemBox(event);
    event.posX += prop.alignX < 0 ? prop.alignX * box.maxX : -prop.alignX * box.minX;
    event.posY += prop.alignY < 0 ? prop.alignY * box.maxY : -prop.alignY * box.minY;

    const end = resolveDuration(prop.duration);
    if (end !== null) event.end = end;

    visual.push(event);

    // Strips hold from props; advances the cursor when set.
    const {hold = 0} = prop;
    validateDuration(hold);
    advanceTime(hold);

    return prop.id;
}
