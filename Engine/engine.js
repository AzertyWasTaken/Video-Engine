"use strict";
import path from 'path';
import {fileURLToPath} from "url";
import {
    getSegmentsWidth,
    balancedText,
    measureTextWidth
} from "./textParser.js";

const visual = [];
const audio = [];

const textConfig = {
    id: 0, // Integer or string group identifier (required)

    text: "Hello, world!",
    fontSize: 80,
    fontColor: "#FFFFFF",
    fontFamily: "Arial",
    fontWeight: 400, // Normal; bold segments use 700

    posX: 0, // Horizontal offset from center
    posY: 0, // Vertical offset from center (before alignment)
    alignY: 0, // Vertical alignment: -1 (top), 0 (center), 1 (bottom)
    maxWidth: Infinity, // Line-wrap threshold (pixels)
    balancedWidth: false, // Balanced text width

    boldSymbol: null, // Enable bold markup parsing with selected symbol
    colorSymbol: [], // Enable color markup parsing with selected symbol
    segmentSymbol: null, // Enable segment splitting with selected symbol
    escapeSymbol: null, // Enable escaping special characters with selected symbol

    fadeIn: 0, // Fade-in duration (seconds) from transparent to full opacity
    fadeOut: 0, // Fade-out duration (seconds) from full opacity to transparent
    autoSetPosX: false, // Auto-increment posX for chained texts
    autoSetPosY: false, // Auto-increment posY for chained texts

    flashDuration: 0, // Flash duration on newly spawned text (disabled if 0)
    flashColor: "#FFFF60", // Flash color on newly spawned text

    onTextSegment: () => {}, // Callback per segment (textLength) => void
};

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

    getProp(key) {
        return textConfig[key];
    },

    setProp(newProp) {
        for (const key in newProp) {
            textConfig[key] = newProp[key];
        }
    },

    changeProp(newProp) {
        for (const key in newProp) {
            const keyA = textConfig[key];
            const keyB = newProp[key];

            if (!isFinite(keyA) || !isFinite(keyB))
                throw new Error(`Nonnumber values are not accepted: ${keyA}, ${keyB}`);

            textConfig[key] += keyB;
        }
    },

    newCircle(id, posX, posY, diameter, color) {
        visual.push({
            type: "circle",
            id,
            posX,
            posY,
            diameter,
            color,
            fadeIn: textConfig.fadeIn,
            fadeOut: textConfig.fadeOut,
            start: time
        });
    },

    newLine(id, posX, posY, lengthX, lengthY, lineWidth, color) {
        visual.push({
            type: "line",
            id,
            posX,
            posY,
            lengthX,
            lengthY,
            lineWidth,
            color,
            fadeIn: textConfig.fadeIn,
            fadeOut: textConfig.fadeOut,
            start: time
        });
    },

    newImage(id, src, posX, posY, width, height) {
        visual.push({
            type: "image",
            id: id,
            src: src,
            posX: posX,
            posY: posY,
            width: width,
            height: height,
            fadeIn: textConfig.fadeIn,
            fadeOut: textConfig.fadeOut,
            start: time
        });
    },

    newText(newProp) {
        const prop = {...textConfig, ...newProp};
        textLength = 0;

        // Wrap while preserving bold state across line breaks.
        let lines = balancedText(prop);

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

        textProp[prop.id] = prop;
        prop.onTextSegment(textLength);
        textLength = 0;

        if (prop.autoSetPosX) textConfig.posX += totalWidth;
        if (prop.autoSetPosY) textConfig.posY += totalHeight;
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
