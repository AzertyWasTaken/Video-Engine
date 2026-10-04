"use strict";
import {Param, effectiveParam, mergeParam} from "./param.js";
import {getSegmentsWidth, wrapTextSegments} from "./textParser.js";
import {getTime, advanceTime, nextAutoId, textProp, visual} from "./state.js";
import {normalizeIds, requireType, resolveDuration, validateDuration, validateOpacity, validateRotation} from "./validate.js";

// Accumulated text length across segments; reset per newText() and consumed
// by onTextSegment callbacks at "wait" markers.
let textLength = 0;

function pushTextSegment(prop, seg, posX, posY, end) {
    const event = {
        type: "text",
        ids: prop.id,
        text: seg.text,
        posX,
        posY,
        // Layout anchor: posX/posY are pixel offsets from the text config
        // anchor, so a tweened font size scales the whole layout about it.
        anchorX: prop.posX,
        anchorY: prop.posY,
        rotation: prop.rotation,
        fontFamily: prop.fontFamily,
        fontSize: prop.fontSize,
        fontColor: seg.color ?? prop.fontColor,
        fontWeight: seg.fontWeight ?? prop.fontWeight,
        flashDuration: prop.flashDuration,
        flashColor: prop.flashColor,
        fadeIn: prop.fadeIn,
        fadeOut: prop.fadeOut,
        opacity: prop.opacity,
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
            // Adjust x-position depending of `prop.alignX`
            const segPosX = prop.posX + segCenterOffset + totalWidth * prop.alignX / 2;

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

    const prop = mergeParam("text", newProp);
    validateOpacity(prop.opacity);
    validateRotation(prop.rotation);

    if (typeof prop.text !== "string")
        throw new Error(`Text must be a string, got ${typeof prop.text}.`);

    prop.id = normalizeIds(prop.id) ?? [nextAutoId()];
    textLength = 0;

    const end = resolveDuration(prop.duration);

    // Wrap while preserving style state across line breaks.
    let lines = wrapTextSegments(prop);

    // Cache only after layout succeeds; invalid autoSize settings must not leave text state.
    for (const idKey of prop.id) textProp[idKey] = prop;

    const lineHeight = prop.fontSize;
    const lineGap = prop.lineGap;
    const totalHeight = lines.length * lineHeight + Math.max(lines.length - 1, 0) * lineGap;

    // Get y-position at the center of the text
    let posY = prop.posY - totalHeight / 2 + lineHeight / 2;
    // Adjust y-position depending of `prop.alignY`
    posY += totalHeight * prop.alignY / 2;

    let totalWidth = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineSegments = lines[i];
        const lineWidth = pushTextLine(prop, lineSegments, posY, end);
        totalWidth = Math.max(totalWidth, lineWidth);
        posY += lineHeight + lineGap;
    }

    prop.onTextSegment(textLength);
    textLength = 0;

    if (prop.autoSetPosX) Param.text.posX = effectiveParam("text", "posX") + totalWidth;
    if (prop.autoSetPosY) Param.text.posY = effectiveParam("text", "posY") + totalHeight;

    // Strips hold from props; advances the cursor when set.
    const {hold = 0} = prop;
    validateDuration(hold);
    advanceTime(hold);

    return prop.id;
}
