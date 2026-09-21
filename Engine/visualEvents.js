"use strict";
import {Param} from "./param.js";
import {measureTextWidth} from "./textParser.js";
import {getTime, nextAutoId, visual} from "./state.js";
import {requireType, resolveDuration} from "./validate.js";

// Fields copied from the merged config into each visual event.
// Adding a visual type means one entry here plus a draw branch in render.js.
const VISUAL_FIELDS = {
    line: ["posX", "posY", "lengthX", "lengthY", "lineWidth", "color", "fadeIn", "fadeOut"],
    rect: ["posX", "posY", "width", "height", "color", "strokeColor", "strokeWidth", "fadeIn", "fadeOut"],
    circle: ["posX", "posY", "diameter", "color", "strokeColor", "strokeWidth", "fadeIn", "fadeOut"],
    image: ["src", "posX", "posY", "width", "height", "fadeIn", "fadeOut"]
};

// Bounding-box size of a pushed event, used for group centering.
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
export function getGroupCenter(ids) {
    const updMin = (a, b) => a > b || a === null ? b : a;
    const updMax = (a, b) => a < b || a === null ? b : a;

    const minPos = {x: null, y: null};
    const maxPos = {x: null, y: null};

    visual.forEach((value) => {
        if (ids.has(value.id)) {
            const itemSize = getItemSize(value);

            minPos.x = updMin(minPos.x, value.posX - itemSize.x / 2);
            minPos.y = updMin(minPos.y, value.posY - itemSize.y / 2);

            maxPos.x = updMax(maxPos.x, value.posX + itemSize.x / 2);
            maxPos.y = updMax(maxPos.y, value.posY + itemSize.y / 2);
        }
    });

    return {x: ((minPos.x ?? 0) + (maxPos.x ?? 0)) / 2, y: ((minPos.y ?? 0) + (maxPos.y ?? 0)) / 2};
}

// Generic visual event creation, table-driven via VISUAL_FIELDS.
export function pushVisual(type, newProp) {
    requireType(type);

    const prop = {...Param[type], ...newProp};
    if (prop.id === undefined || prop.id === null) prop.id = nextAutoId();

    const event = {type, id: prop.id, start: getTime()};
    for (const key of VISUAL_FIELDS[type]) event[key] = prop[key];

    const end = resolveDuration(prop.duration);
    if (end !== null) event.end = end;

    visual.push(event);
    return prop.id;
}
