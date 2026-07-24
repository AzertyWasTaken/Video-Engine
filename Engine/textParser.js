"use strict";
import {log} from "console";
import {createCanvas} from "@napi-rs/canvas";

const canvas = createCanvas(1, 1);
const ctx = canvas.getContext("2d");

// Produces an ordered list of segments with bold state applied across the whole input.
// Markup: *bold* (no nesting). Asterisks are not rendered.
// Each segment is on the form of {text: <string>, bold: <bool>}
export function tokenizeRichText(text) {
    const tokens = [];
    let bold = false;
    let current = "";

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === "*") {
            if (current.length > 0) tokens.push({text: current, bold});
            current = "";
            bold = !bold;
            continue;
        }

        current += ch;
    }

    if (current.length > 0) tokens.push({text: current, bold});
    return tokens;
}

export function getSegmentsWidth(prop, segments) {
    let totalWidth = 0;

    const segWidths = segments.map((seg) => {
        if (typeof seg !== "object") return 0;

        const weight = seg.bold ? 700 : prop.fontWeight;
        ctx.font = `${weight} ${prop.fontSize}px ${prop.fontFamily}`;
        const w = ctx.measureText(seg.text).width;
        totalWidth += w;
        return w;
    });

    return [totalWidth, segWidths];
}

function measureChunkWidth(chunk, prop) {
    const weight = chunk.bold ? 700 : prop.fontWeight;
    ctx.font = `${weight} ${prop.fontSize}px ${prop.fontFamily}`;
    return ctx.measureText(chunk.text).width;
}

// Flatten tokens into a stream of words and spaces.
function chunkTokens(tokens) {
    const chunks = [];

    for (const seg of tokens) {
        const words = seg.text.split(" ");

        for (let i = 0; i < words.length; i++) {
            const word = words[i];

            if (i > 0)
                chunks.push({text: " ", bold: seg.bold});

            if (word.length > 0)
                chunks.push({text: word, bold: seg.bold});
        }
    }

    return chunks;
}

// Wrap chunks by measuring line widths.
// Remove last character (space) at the end of each line.
function splitLines(chunks, prop) {
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const w = measureChunkWidth(chunk, prop);

        if (currentLine.length > 0 && (currentWidth + w) > prop.maxWidth) {
            // Remove trailing space at the end of each line.
            if (currentLine.at(-1).text.trim().length === 0)
                currentLine.pop();

            lines.push(currentLine);
            currentLine = [];
            currentWidth = 0;
        }

        currentLine.push(chunk);
        currentWidth += w;
    }

    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
}

// Wrap while preserving bold state across line breaks.
// This must match the vertical positioning behavior of getWrappedTextPos().
export function wrapRichTextSegments(prop, textConfig) {
    // Build word/space chunks with bold state preserved.
    const tokens = prop.richText
    ? tokenizeRichText(prop.text)
    : {text: prop.text, bold: false};

    const chunks = chunkTokens(tokens);
    const lines = splitLines(chunks, prop);
    const totalHeight = (lines.length - 1) * prop.fontSize;

    if (prop.autoSetPosY)
        textConfig.posY += totalHeight + prop.fontSize;

    return prop.segmentedText
    ? lines.map(segTextLine)
    : lines;
}

export function segTextLine(line) {
    const result = [];

    for (const seg of line) {
        const split = seg.text.split(";");

        for (let i = 0; i < split.length; i++) {
            if (i > 0) result.push("wait");

            if (split[i].length > 0)
                result.push({text: split[i], bold: seg.bold});
        }
    }

    return result;
}
