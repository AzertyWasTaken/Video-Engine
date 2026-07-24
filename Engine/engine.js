"use strict";
import {log} from "console";
import {
    getSegmentsWidth,
    wrapRichTextSegments
} from "./textParser.js";

const visual = [];
const audio = [];

const textConfig = {
    id: 0,

    text: "Hello, world!",
    fontSize: 64,
    fontColor: "#FFFFFF",
    fontFamily: "Arial",
    fontWeight: 400,

    posX: 0,
    posY: 0,
    maxWidth: 960,
    autoSetPosY: true,

    effect: false,
    richText: false,
    segmentedText: false
};

const textProp = {};

let time = 0;

function getGroupCenter(id) {
    let minHeight = 0;
    let maxHeight = 0;

    visual.forEach((value) => {
        if (value.id === id) {
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
            const segWidth = segWidths[i];

            const segCenterOffset = currWidth + segWidth / 2 - totalWidth / 2;
            const segPosX = prop.posX + segCenterOffset;

            pushTextSegment(prop, seg, segPosX, linePosY);

            currWidth += segWidth;
        } else {
            time += 2;
            Engine.sound("Sounds/click.wav", 4);
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
        visual.push({type: "circle", id: id, posX: posX, posY: posY, start: time});
    },

    newText(newProp) {
        const prop = {...textConfig, ...newProp};

        // Wrap while preserving bold state across line breaks.
        const lines = wrapRichTextSegments(prop, textConfig);

        let posY = prop.posY;
        if (!prop.autoSetPosY) posY -= totalHeight / 2;

        for (let i = 0; i < lines.length; i++) {
            const lineSegments = lines[i];
            pushTextLine(prop, lineSegments, posY);
            posY += prop.fontSize;
        }

        textProp[prop.id] = prop;
    },

    setText(id, text) {
        this.clear(id);
        this.newText({...textProp[id], text});
    },

    centerText(id, posY = 0) {
        const center = getGroupCenter(id);

        visual.forEach((value) => {
            if (value.id === id) {
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
