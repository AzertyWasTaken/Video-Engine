"use strict";
import {
    getSegmentsWidth,
    wrapRichTextSegments
} from "./textParser.js";

const visual = [];
const audio = [];

const textConfig = {
    id: 0,

    text: "Hello, world!",
    fontSize: 80,
    fontColor: "#FFFFFF",
    fontFamily: "Arial",
    fontWeight: 400,

    posX: 0,
    posY: 0,
    alignY: 0,
    maxWidth: Infinity,

    richText: false,
    segmentedText: false,
    effect: false,

    autoSetPosY: false,
    onTextSegment: () => {},
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
        time += sec;
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
            posX:
            posX,
            posY: posY,
            start: time
        });
    },

    newText(newProp) {
        const prop = {...textConfig, ...newProp};
        textLength = 0;

        // Wrap while preserving bold state across line breaks.
        const lines = wrapRichTextSegments(prop, textConfig);
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

    setText(id, text) {
        this.clear(id);
        this.newText({
            ...textProp[id],
            text,
            effect: false,
            autoSetPosY: false,
            textDelay: () => 0
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

    clear(id) {
        visual.forEach((value) => {
            if (value.id === id) {
                value.end ??= time;
            }
        });
    },

    getVisualTimeline() {return visual;},
    getAudioTimeline() {return audio;},
    getDuration() {return time;}
}
