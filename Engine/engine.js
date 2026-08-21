"use strict";
import path from 'path';
import {fileURLToPath} from "url";
import {Param} from "./param.js";
import {
    getSegmentsWidth,
    wrapTextSegments,
    measureTextWidth
} from "./textParser.js";

const visual = [];
const audio = [];

let audioFile = fileURLToPath(import.meta.url);

const textProp = {};

let time = 0;
let textLength = 0;

function getItemSize(item) {
    switch (item.type) {
        case "text": return {x: measureTextWidth(item), y: item.fontSize};

        case "circle": return {x: item.diameter, y: item.diameter};

        case "line": return {x: item.lengthX + item.lineWidth, y: item.lengthY + item.lineWidth};

        case "image": return {x: item.width, y: item.height};

        default: throw new Error(`Invalid item type ${item.type}`);
    }
}

// Get the center point of grouped `id` items
function getGroupCenter(id) {
    const minSize = {x: 0, y: 0};
    const maxSize = {x: 0, y: 0};

    visual.forEach((value) => {
        if (id.has(value.id)) {
            const itemSize = getItemSize(value);

            minSize.x = Math.min(minSize.x, value.posX - itemSize.x / 2);
            minSize.y = Math.min(minSize.y, value.posY - itemSize.y / 2);

            maxSize.x = Math.max(maxSize.x, value.posX + itemSize.x / 2);
            maxSize.y = Math.max(maxSize.y, value.posY + itemSize.y / 2);
        }
    });

    return {x: (minSize.x + maxSize.x) / 2, y: (minSize.y + maxSize.y) / 2};
}

function pushTextSegment(prop, seg, posX, posY) {
    visual.push({
        type: "text",
        id: prop.id,
        text: seg.text,
        posX,
        posY,
        fontFamily: prop.fontFamily,
        fontSize: prop.fontSize,
        fontColor: seg.color ?? prop.fontColor,
        fontWeight: seg.bold ? 700 : prop.fontWeight,
        flashDuration: prop.flashDuration,
        flashColor: prop.flashColor,
        fadeIn: prop.fadeIn,
        fadeOut: prop.fadeOut,
        start: time
    });
}

function pushTextLine(prop, segments, linePosY) {
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

            pushTextSegment(prop, seg, segPosX, linePosY);

            currWidth += segWidth;
        } else {
            prop.onTextSegment(textLength);
            textLength = 0;
        }
    }

    return totalWidth;
}

export const Engine = {
    wait(sec) {
        time += sec ?? 0;
    },

    playSound(filePath, volume) {        
        audio.push({
            sound: path.join(audioFile, filePath),
            volume: volume ?? 1,
            start: time
        });
    },

    setAudioFile(filePath) {
        audioFile = filePath;
    },

    setBackgroundColor(color) {
        visual.push({type: "background", color: color, start: time});
    },

    getProp(key, type = "text") {
        return Param[type][key];
    },

    setProp(newProp, type = "text") {
        for (const key in newProp) {
            Param[type][key] = newProp[key];
        }
    },

    changeProp(newProp, type = "text") {
        for (const key in newProp) {
            const keyA = Param[type][key];
            const keyB = newProp[key];

            if (!isFinite(keyA) || !isFinite(keyB))
                throw new Error(`Nonnumber values are not accepted: ${keyA}, ${keyB}`);

            Param[type][key] += keyB;
        }
    },

    newLine(newProp) {
        const prop = {...Param.line, ...newProp};
        visual.push({
            type: "line",
            id: prop.id,
            posX: prop.posX,
            posY: prop.posY,
            lengthX: prop.lengthX,
            lengthY: prop.lengthY,
            lineWidth: prop.lineWidth,
            color: prop.color,
            fadeIn: prop.fadeIn,
            fadeOut: prop.fadeOut,
            start: time
        });
    },

    newRect(newProp) {
        const prop = {...Param.rect, ...newProp};
        visual.push({
            type: "rect",
            id: prop.id,
            posX: prop.posX,
            posY: prop.posY,
            width: prop.width,
            height: prop.height,
            color: prop.color,
            fadeIn: prop.fadeIn,
            fadeOut: prop.fadeOut,
            start: time
        });
    },

    newCircle(newProp) {
        const prop = {...Param.circle, ...newProp};
        visual.push({
            type: "circle",
            id: prop.id,
            posX: prop.posX,
            posY: prop.posY,
            diameter: prop.diameter,
            color: prop.color,
            fadeIn: prop.fadeIn,
            fadeOut: prop.fadeOut,
            start: time
        });
    },

    newImage(newProp) {
        const prop = {...Param.image, ...newProp};
        visual.push({
            type: "image",
            id: prop.id,
            src: prop.src,
            posX: prop.posX,
            posY: prop.posY,
            width: prop.width,
            height: prop.height,
            fadeIn: prop.fadeIn,
            fadeOut: prop.fadeOut,
            start: time
        });
    },

    newText(newProp) {
        const prop = {...Param.text, ...newProp};
        textProp[prop.id] = prop;
        textLength = 0;

        // Wrap while preserving bold state across line breaks.
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
            const lineWidth = pushTextLine(prop, lineSegments, posY);
            totalWidth = Math.max(totalWidth, lineWidth);
            posY += lineHeight;
        }

        prop.onTextSegment(textLength);
        textLength = 0;

        if (prop.autoSetPosX) Param.text.posX += totalWidth;
        if (prop.autoSetPosY) Param.text.posY += totalHeight;
    },

    setText(id, text, fade = 0) {
        Engine.clear(id, fade);
        Engine.wait(-fade);

        Engine.newText({
            ...textProp[id],
            text,
            flashDuration: 0,
            autoSetPosX: false,
            autoSetPosY: false,
            fadeIn: fade,
        });

        Engine.wait(fade);
    },

    centerText(id, posX = null, posY = null) {
        if (typeof id !== "object") id = new Set([id]);

        const center = getGroupCenter(id);

        visual.forEach((value) => {
            if (id.has(value.id)) {
                if (posX !== null) value.posX += posX - center.x;
                if (posY !== null) value.posY += posY - center.y;
            }
        });
    },

    clear(id, fadeOut) {
        if (typeof id !== "object") id = new Set([id]);

        visual.forEach((value) => {
            if (id.has(value.id)) {
                value.end ??= time;
                if (fadeOut) value.fadeOut = fadeOut;
            }
        });
    },

    getVisualTimeline() {return visual;},
    getAudioTimeline() {return audio;},
    getDuration() {return time;}
};
