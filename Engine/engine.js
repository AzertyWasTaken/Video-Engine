"use strict";
import {log} from "console";
import {
    tokenizeRichText,
    getSegmentsWidth,
    wrapRichTextSegments
} from "./textParser.js";

const visual = [];
const audio = [];

const textConfig = {
    id: 0,
    text: "Hello, world!",
    posX: 0,
    posY: 0,
    fontSize: 64,
    fontFamily: "Arial",
    fontColor: "#FFFFFF",
    fontWeight: 400,
    maxWidth: 960,
    autoSetPosY: true,
    effect: false,
    richText: false,
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

function pushTextSegments(prop, segments, linePosX, linePosY) {
    // If parsing removed everything (edge-case), throw an error.
    if (segments.length === 0)
        throw new Error("Rich text cannot contain nothing but formatting characters.");

    // Measure widths per segment so we can preserve centered alignment.
    const [totalWidth, segWidths] = getSegmentsWidth(prop, segments);

    // render.js draws at: WIDTH/2 + obj.posX, with ctx.textAlign="center"
    // So each segment's posX should represent its own center offset within the line.
    let cumWidth = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segWidth = segWidths[i];

        const segCenterOffset = cumWidth + segWidth / 2 - totalWidth / 2;
        const segPosX = linePosX + segCenterOffset;

        visual.push({
            type: "text",
            id: prop.id,
            text: seg.text,
            posX: segPosX,
            posY: linePosY,
            fontFamily: prop.fontFamily,
            fontSize: prop.fontSize,
            fontColor: prop.fontColor,
            fontWeight: seg.bold ? 700 : prop.fontWeight,
            effect: prop.effect,
            start: time
        });

        cumWidth += segWidth;
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

        // Rich text: wrap while preserving bold state across line breaks.
        const wrapped = wrapRichTextSegments(prop, textConfig);

        for (let i = 0; i < wrapped.lines.length; i++) {
            const lineSegments = wrapped.lines[i];
            const y = wrapped.lineYForIndex(i);
            pushTextSegments(prop, lineSegments, wrapped.linePosX, y);
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
