"use strict";
import {Param} from "./param.js";
import {getSegmentsWidth, wrapTextSegments} from "./textParser.js";
import {getTime, nextAutoId, textProp, visual} from "./state.js";
import {requireType, resolveDuration} from "./validate.js";

// Accumulated text length across segments; reset per newText() and consumed
// by onTextSegment callbacks at "wait" markers.
let textLength = 0;

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
        fontWeight: seg.fontWeight ?? prop.fontWeight,
        flashDuration: prop.flashDuration,
        flashColor: prop.flashColor,
        fadeIn: prop.fadeIn,
        fadeOut: prop.fadeOut,
        start: getTime()
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

export function newText(newProp) {
    requireType("text");

    const prop = {...Param.text, ...newProp};

    if (typeof prop.text !== "string")
        throw new Error(`Text must be a string, got ${typeof prop.text}.`);

    if (prop.id === undefined || prop.id === null) prop.id = nextAutoId();
    textProp[prop.id] = prop;
    textLength = 0;

    const end = resolveDuration(prop.duration);

    // Wrap while preserving style state across line breaks.
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
}
