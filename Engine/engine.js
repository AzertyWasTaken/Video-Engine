"use strict";
import {
    getSegmentsWidth,
    wrapRichTextSegments
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

    richText: false, // Enable *bold* markup parsing
    segmentedText: false, // Enable ; segment splitting (delays between chunks)

    effect: false, // Enable yellow flash on newly spawned text (0.5s)
    fadeIn: 0, // Fade-in duration (seconds) from transparent to full opacity
    fadeOut: 0, // Fade-out duration (seconds) from full opacity to transparent
    autoSetPosY: false, // Auto-increment posY for chained texts
    autoDelay: false, // Auto-compute delay per entry in newTextSection based on text length

    onTextSegment: () => {}, // Callback per segment (textLength) => void
};

const textProp = {};

let time = 0;
let textLength = 0;

function getGroupCenter(id) {
    let minHeight = 0;
    let maxHeight = 0;

    visual.forEach((value) => {
        if (id.has(value.id)) {
            minHeight = Math.min(minHeight, value.posY);
            maxHeight = Math.max(maxHeight, value.posY);
        }
    });

    return (minHeight + maxHeight) / 2;
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
        fontColor: prop.fontColor,
        fontWeight: seg.bold ? 700 : prop.fontWeight,
        effect: prop.effect,
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
}

export const Engine = {
    wait(sec) {
        time += sec ?? 0;
    },

    sound(path, volume) {
        audio.push({sound: path, volume: volume ?? 1, start: time});
    },

    setBackgroundColor(color) {
        visual.push({type: "background", color: color, start: time});
    },

    setProp(newProp) {
        for (const key in newProp) {
            textConfig[key] = newProp[key];
        }
    },

    changeProp(key, value) {
        textConfig[key] += value;
    },

    newCircle(id, posX, posY) {
        visual.push({
            type: "circle",
            id: id,
            posX: posX,
            posY: posY,
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
            start: time
        });
    },

    newText(newProp) {
        const prop = {...textConfig, ...newProp};
        textLength = 0;

        // Wrap while preserving bold state across line breaks.
        const lines = wrapRichTextSegments(prop);
        const lineHeight = prop.fontSize;
        const totalHeight = lines.length * lineHeight;

        // Get y-position at the center of the text
        let posY = prop.posY - totalHeight / 2 + lineHeight / 2;
        // Adjust y-position depending of `prop.alignY`
        posY += totalHeight * prop.alignY / 2;

        if (prop.autoSetPosY) textConfig.posY += totalHeight;

        for (let i = 0; i < lines.length; i++) {
            const lineSegments = lines[i];
            pushTextLine(prop, lineSegments, posY);
            posY += lineHeight;
        }

        textProp[prop.id] = prop;
        prop.onTextSegment(textLength);
        textLength = 0;
    },

    newTextSection(newProp, textArray) {
        const prop = {...textConfig, ...newProp};
        const savedPosY = prop.posY;
        // Save textConfig.posY so we can restore it — newTextSection must not
        // leak posY mutations into the global textConfig (side-effect free).
        const savedConfigPosY = textConfig.posY;

        for (const entry of textArray) {
            // Object: {text: "...", offsetY: 40, delay: 1, ...textProps}
            const {offsetY = 0, delay = 0, ...entryConfig} = entry;

            // Auto-compute delay from text length when autoDelay is enabled
            // and no explicit delay was given.
            const delaySec = typeof delay === "function"
            ? delay(entryConfig.text.length) : delay;

            prop.posY = textConfig.posY;
            Engine.newText({...prop, ...entryConfig});
            Engine.changeProp("posY", offsetY);
            Engine.wait(delaySec);
        }

        Engine.centerText(prop.id, savedPosY);
        // Restore textConfig.posY to avoid side effects on subsequent calls.
        textConfig.posY = savedConfigPosY;
    },

    setText(id, text) {
        Engine.clear(id, true);

        Engine.newText({
            ...textProp[id],
            text,
            effect: false,
            autoSetPosY: false,
            fadeIn: 0,
        });
    },

    centerText(id, posY = 0) {
        if (typeof id !== "object") id = new Set([id]);

        const center = getGroupCenter(id);

        visual.forEach((value) => {
            if (id.has(value.id)) {
                value.posY += posY - center;
            }
        });
    },

    clear(id, noFadeOut) {
        visual.forEach((value) => {
            if (value.id === id) {
                value.end ??= time;
                if (noFadeOut) value.fadeOut = 0;
            }
        });
    },

    getVisualTimeline() {return visual;},
    getAudioTimeline() {return audio;},
    getDuration() {return time;}
};
