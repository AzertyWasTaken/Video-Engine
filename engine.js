"use strict";
import {log} from "console";
import {createCanvas} from "@napi-rs/canvas";

const canvas = createCanvas(1, 1);
const ctx = canvas.getContext("2d");

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

function getWrappedTextPos(prop) {
    ctx.font = `${prop.fontWeight} ${prop.fontSize}px ${prop.fontFamily}`;

    const linesPos = [];
    const words = prop.text.split(" ");
    let line = "";

    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        const metrics = ctx.measureText(testLine);

        if (metrics.width > prop.maxWidth && i > 0) {
            linesPos.push([line, prop.posX, prop.posY]);
            line = words[i] + " ";
            prop.posY += prop.fontSize;
        } else {
            line = testLine;
        }
    }

    linesPos.push([line, prop.posX, prop.posY]);

    const totalHeight = (linesPos.length - 1) * prop.fontSize;
    if (prop.autoSetPosY) {
        textConfig.posY += totalHeight + prop.fontSize;
    } else {
        for (let l of linesPos) l[2] -= totalHeight / 2;
    }

    return linesPos;
}

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

function parseBoldSegments(text, richTextEnabled) {
    // When richText is disabled, render the text as-is.
    if (!richTextEnabled) return [{text, bold: false}];

    // Supports *bold* markup (no nesting). Asterisks are not rendered.
    const segments = [];
    let bold = false;
    let current = "";

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === "*") {
            segments.push({text: current, bold});
            current = "";
            bold = !bold;
            continue;
        }
        current += ch;
    }

    segments.push({text: current, bold});
    return segments.filter((s) => s.text.length > 0);
}

function tokenizeRichText(text) {
    // Produces an ordered list of segments with bold state applied across the whole input.
    // Markup: *bold* (no nesting). Asterisks are not rendered.
    const tokens = [];
    let bold = false;
    let current = "";
    let currentBold = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === "*") {
            if (current.length > 0) tokens.push({text: current, bold: currentBold});
            current = "";
            bold = !bold;
            currentBold = bold;
            continue;
        }

        currentBold = bold;
        current += ch;
    }

    if (current.length > 0) tokens.push({text: current, bold: currentBold});
    return tokens;
}

function pushTextSegments(prop, segments, linePosX, linePosY) {
    // If parsing removed everything (edge-case), throw an error.
    if (segments.length === 0)
        throw new Error("Rich text cannot contain nothing but formatting characters.");

    // Measure widths per segment so we can preserve centered alignment.
    let totalWidth = 0;
    const segWidths = segments.map((seg) => {
        const weight = seg.bold ? 700 : prop.fontWeight;
        ctx.font = `${weight} ${prop.fontSize}px ${prop.fontFamily}`;
        const w = ctx.measureText(seg.text).width;
        totalWidth += w;
        return w;
    });

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

function wrapRichTextSegments(prop) {
    // Wrap while preserving bold state across line breaks.
    // This must match the vertical positioning behavior of getWrappedTextPos().

    const maxWidth = prop.maxWidth;
    const linePosX = prop.posX;

    // Build word/space chunks with bold state preserved.
    // IMPORTANT: mimic original wrapping that splits on spaces and always appends
    // a trailing space while building each line.
    const chunks = [];
    const tokens = tokenizeRichText(prop.text);

    // Flatten tokens into a stream of chars (excluding markup markers), tracking bold.
    // Then split by spaces but keep the trailing space behavior.
    for (const seg of tokens) {
        // Split by spaces but re-append a single space after each part except the last.
        // Leading spaces can happen just after closing bold markup, e.g. "*bold* text".
        // Keep them on the previous chunk so the visible gap after bold text survives.
        const parts = seg.text.split(" ");
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.length === 0) {
                if (i < parts.length - 1) {
                    const previous = chunks[chunks.length - 1];
                    if (previous) previous.text += " ";
                    else chunks.push({text: " ", bold: seg.bold});
                }
                continue;
            }
            // Preserve original behavior: old wrapper effectively appends a space after
            // each word while building a line. However, when measuring widths and then
            // centering segments, adding that trailing space to every chunk can shift
            // bold parts left.
            //
            // Fix: only append a space to the chunk if it is not the last "word" in the
            // source segment (so the space after a word still exists), but do NOT force
            // a trailing space at the end of the entire rich-text input.
            const needsSpace = i < parts.length - 1;
            chunks.push({text: needsSpace ? part + " " : part, bold: seg.bold});
        }
    }

    // Wrap chunks by measuring line widths.
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;

    const measureChunkWidth = (chunk) => {
        const weight = chunk.bold ? 700 : prop.fontWeight;
        ctx.font = `${weight} ${prop.fontSize}px ${prop.fontFamily}`;
        return ctx.measureText(chunk.text).width;
    };

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const w = measureChunkWidth(chunk);

        if (currentLine.length > 0 && (currentWidth + w) > maxWidth) {
            lines.push(currentLine);
            currentLine = [];
            currentWidth = 0;
        }

        currentLine.push(chunk);
        currentWidth += w;
    }

    if (currentLine.length > 0) lines.push(currentLine);

    const totalHeight = (lines.length - 1) * prop.fontSize;

    // Match getWrappedTextPos():
    // - When autoSetPosY=true: line y positions start at prop.posY + i*fontSize, and textConfig.posY advances.
    // - When autoSetPosY=false: line y positions are additionally centered by subtracting totalHeight/2.
    if (prop.autoSetPosY) {
        textConfig.posY += totalHeight + prop.fontSize;
    }

    const lineYForIndex = (idx) => {
        let y = prop.posY + idx * prop.fontSize;
        if (!prop.autoSetPosY) y -= totalHeight / 2;
        return y;
    };

    return {lines, lineYForIndex, linePosX};
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

    newCircle(posX, posY) {
        visual.push({type: "circle", posX: posX, posY: posY, start: time});
    },

    newText(newProp) {
        const prop = {...textConfig, ...newProp};

        // Rich text: wrap while preserving bold state across line breaks.
        if (prop.richText && prop.maxWidth !== Infinity) {
            const wrapped = wrapRichTextSegments(prop);

            for (let i = 0; i < wrapped.lines.length; i++) {
                const lineSegments = wrapped.lines[i];
                const y = wrapped.lineYForIndex(i);
                pushTextSegments(prop, lineSegments, wrapped.linePosX, y);
            }

            textProp[prop.id] = prop;
            return;
        }

        // Rich text single-line (or any case with no wrapping): still parse *bold* markup.
        if (prop.richText) {
            const segments = tokenizeRichText(prop.text);
            pushTextSegments(prop, segments, prop.posX, prop.posY);
            textProp[prop.id] = prop;
            return;
        }

        // Non-rich: original behavior.
        const linesPos = prop.maxWidth === Infinity
            ? [[prop.text, prop.posX, prop.posY]]
            : getWrappedTextPos(prop);

        for (const [lineText, linePosX, linePosY] of linesPos) {
            pushTextLineSegments(prop, lineText, linePosX, linePosY);
        }

        textProp[prop.id] = prop;
    },

    setText(id, text) {
        this.clear(id);
        this.newText({...textProp[id], text});
    },

    centerText(id) {
        const center = getGroupCenter(id);

        visual.forEach((value) => {
            if (value.id === id) {
                value.posY -= center;
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
