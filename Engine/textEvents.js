"use strict";
import {Param, effectiveParam, mergeParam} from "./param.js";
import {getSegmentsWidth, wrapTextSegments} from "./textParser.js";
import {getTime, advanceTime, nextAutoId, textProp, visual} from "./state.js";
import {normalizeIds, requireType, resolveDuration, validateDuration, validateLayoutOrder, validateOpacity, validateRotation} from "./validate.js";

// Distinct automatic ids collected for each part of the current newText() call.
let currentPartId = null;

function pushTextSegment(prop, seg, posX, posY, end, ids) {
    const event = {
        type: "text",
        ids,
        text: seg.text,
        posX,
        posY,
        anchorX: prop.posX,
        anchorY: prop.posY,
        rotation: prop.rotation,
        fontFamily: seg.fontFamily ?? prop.fontFamily,
        fontSize: (seg.fontSize ?? 1) * prop.fontSize,
        fontColor: seg.color ?? prop.fontColor,
        fontWeight: seg.fontWeight ?? prop.fontWeight,
        italic: seg.italic ?? prop.italic,
        flashDuration: prop.flashDuration,
        flashColor: prop.flashColor,
        fadeIn: prop.fadeIn,
        fadeOut: prop.fadeOut,
        opacity: prop.opacity,
        layoutOrder: prop.layoutOrder,
        start: getTime(),
        offsetY: seg.offsetY ?? 0,
        // Segment fontSize multiplier relative to base fontSize
        segFontSizeMultiplier: seg.fontSize ?? 1,
    };

    if (end !== null) event.end = end;
    visual.push(event);
}

function pushTextLine(prop, segments, linePosY, end, multiSegment, partIds) {
    // If parsing removed everything (edge-case), throw an error.
    if (segments.length === 0)
        throw new Error("Text lines must have at least one segment.");

    // Measure widths per segment so we can preserve centered alignment.
    const [totalWidth, segWidths] = getSegmentsWidth(prop, segments);

    let currWidth = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        if (typeof seg === "object") {
            if (multiSegment && currentPartId === null) {
                currentPartId = nextAutoId();
                partIds.push(currentPartId);
            }
            const segWidth = segWidths[i];
            const segCenterOffset = currWidth + segWidth / 2 - totalWidth / 2;
            // Adjust x-position depending of `prop.alignX`
            const segPosX = prop.posX + segCenterOffset + totalWidth * prop.alignX / 2;
            const ids = multiSegment ? [...prop.id, currentPartId] : prop.id;
            pushTextSegment(prop, seg, segPosX, linePosY + (seg.offsetY ?? 0) * prop.fontSize, end, ids);
            currWidth += segWidth;
        } else {
            currentPartId = null;
        }
    }

    return totalWidth;
}

export function newText(newProp) {
    requireType("text");

    const prop = mergeParam("text", newProp, "newText()");
    validateOpacity(prop.opacity);
    validateRotation(prop.rotation);
    validateLayoutOrder(prop.layoutOrder);

    if (typeof prop.text !== "string")
        throw new Error(`Text must be a string, got ${typeof prop.text}.`);

    if (typeof prop.italic !== "boolean")
        throw new Error(`italic must be a boolean, got ${JSON.stringify(prop.italic)}.`);

    prop.id = normalizeIds(prop.id) ?? [nextAutoId()];
    const end = resolveDuration(prop.duration);

    // Wrap while preserving style state across line breaks.
    let lines = wrapTextSegments(prop);

    // Count contiguous runs of text segments separated by "wait" markers.
    let partCount = 0;
    let inPart = false;
    for (const line of lines) {
        for (const seg of line) {
            if (typeof seg === "object") {
                if (!inPart) {
                    partCount++;
                    inPart = true;
                }
            } else {
                inPart = false;
            }
        }
    }

    const multiSegment = partCount >= 2;
    const partIds = [];
    currentPartId = null;

    for (const idKey of prop.id) textProp[idKey] = prop;

    const lineHeight = prop.fontSize;
    const lineGap = prop.lineGap;
    const totalHeight = lines.length * lineHeight + Math.max(lines.length - 1, 0) * lineGap;

    // Get y-position at the center of the text
    let posY = prop.posY - totalHeight / 2 + lineHeight / 2;
    // Adjust y-position depending of `prop.alignY`
    posY += totalHeight * prop.alignY / 2;

    let totalWidth = 0;
    // Distinct automatic id for the current segment part; null between parts.
    for (let i = 0; i < lines.length; i++) {
        const lineSegments = lines[i];
        const lineWidth = pushTextLine(prop, lineSegments, posY, end, multiSegment, partIds);
        totalWidth = Math.max(totalWidth, lineWidth);
        posY += lineHeight + lineGap;
    }

    if (prop.autoSetPosX) Param.text.posX = effectiveParam("text", "posX") + totalWidth;
    if (prop.autoSetPosY) Param.text.posY = effectiveParam("text", "posY") + totalHeight;

    // Strips hold from props; advances the cursor when set.
    const {hold = 0} = prop;
    validateDuration(hold);
    advanceTime(hold);

    if (multiSegment) return {id: prop.id, seg: partIds};
    return prop.id;
}

// Batch-create multiple text events from an array of config objects.
// Each config is passed to newText() with automatic vertical spacing:
// if a config omits posY, it is placed `lineGap` below the previous text.
// Returns an array of ids, one per created text.
export function newTexts(texts, configs) {
    if (!Array.isArray(texts))
        throw new Error(`newTexts() expects an array of text configs, got ${JSON.stringify(texts)}.`);

    const {textGap, posY} = configs;
    delete configs.textGap;
    delete configs.posY;

    const ids = [];
    let cursorY = posY;

    for (const text of texts) {
        if (typeof text !== "object" || text === null || Array.isArray(text))
            throw new Error(`newTexts() each config must be an object, got ${JSON.stringify(text)}.`);

        const merged = {...text, ...configs};

        // Auto-space: if posY is not set, place below previous text.
        if (merged.posY === undefined) {
            merged.posY = cursorY;
        }

        const id = newText(merged);
        ids.push(id);

        // Advance cursorY by fontSize + lineGap so the next text stacks below.
        // Use the merged config's fontSize (defaults resolve inside newText).
        const fontSize = merged.fontSize ?? Param.text.fontSize;
        const lineGap = merged.lineGap ?? Param.text.lineGap;
        const lineCount = wrapTextSegments(mergeParam("text", merged, "newTexts()")).length
        const textHeight = fontSize * lineCount + lineGap * (lineCount - 1);
        cursorY += (textHeight + fontSize) / 2 + textGap;
    }

    return ids;
}
