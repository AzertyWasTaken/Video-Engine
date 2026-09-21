"use strict";
import {Canvas} from "skia-canvas";

const canvas = new Canvas(1, 1);
canvas.gpu = true;
const ctx = canvas.getContext("2d");

// Produces an ordered list of segments with style state applied across the whole input text.
// Each returned segment has the form `{text: <string>, color: <string|null>, fontWeight: <number|null>}`.
// Special characters (style toggles and escape) can be escaped.
function tokenizeText(text, styleDefs, escapeCh) {
    const tokens = [];
    const styleStack = [];
    let current = "";

    // Validate style definitions once per call.
    const styleMap = new Map();
    for (const def of styleDefs ?? []) {
        if (!def || typeof def !== "object")
            throw new Error(`styleSymbol entries must be objects, got ${JSON.stringify(def)}.`);
        if (typeof def.symbol !== "string" || def.symbol.length !== 1)
            throw new Error(`styleSymbol entry needs a single-character symbol string, got ${JSON.stringify(def.symbol)}.`);
        if (def.color !== undefined && typeof def.color !== "string")
            throw new Error(`styleSymbol color must be a string, got ${JSON.stringify(def.color)}.`);
        if (def.fontWeight !== undefined && (typeof def.fontWeight !== "number" || !Number.isFinite(def.fontWeight)))
            throw new Error(`styleSymbol fontWeight must be a finite number, got ${JSON.stringify(def.fontWeight)}.`);
        if (styleMap.has(def.symbol))
            throw new Error(`Duplicate styleSymbol symbol ${JSON.stringify(def.symbol)}.`);
        styleMap.set(def.symbol, def);
    }

    // Flush the accumulated character buffer into a new token (if non-empty),
    // capturing the current style state, then reset the buffer.
    const flush = () => {
        if (current.length > 0) {
            let color = null;
            let fontWeight = null;
            for (let i = styleStack.length - 1; i >= 0; i--) {
                if (color === null && styleStack[i].color !== undefined)
                    color = styleStack[i].color;
                if (fontWeight === null && styleStack[i].fontWeight !== undefined)
                    fontWeight = styleStack[i].fontWeight;
                if (color !== null && fontWeight !== null) break;
            }
            tokens.push({text: current, color, fontWeight});
        }
        current = "";
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        // ---- Style symbols ----
        // Toggle the corresponding style on / off the stack.
        const def = styleMap.get(ch);
        if (def !== undefined) {
            // Flush the buffer with the *current* (pre-toggle) style first.
            flush();

            const top = styleStack.at(-1);
            if (top && top.symbol === def.symbol) {
                // Same symbol on top → pop (turn off).
                styleStack.pop();
            } else {
                // Different symbol → push (turn on).
                styleStack.push(def);
            }
            continue;
        }

        // ---- Escape character ----
        // Escape symbol: keep it in the output for downstream parsing (segTextLine),
        // and copy the next character verbatim so it skips style parsing here.
        if (ch === escapeCh) {
            current += ch;
            const next = text[i + 1];
            if (next) {
                current += next;
                i++;
            }
            continue;
        }

        // ---- Regular character ----
        current += ch;
    }

    // Flush any remaining characters.
    flush();

    return tokens;
}

function measureChunkWidth(chunk, prop) {
    const weight = chunk.fontWeight ?? prop.fontWeight;
    ctx.font = `${weight} ${prop.fontSize}px ${prop.fontFamily}`;
    return ctx.measureText(chunk.text).width;
}

export function measureTextWidth(item) {
    ctx.font = `${item.fontWeight} ${item.fontSize}px ${item.fontFamily}`;
    return ctx.measureText(item.text).width;
}

export function getSegmentsWidth(prop, segments) {
    let totalWidth = 0;

    const segWidths = segments.map((seg) => {
        if (typeof seg !== "object") return 0;

        const w = measureChunkWidth(seg, prop);
        totalWidth += w;
        return w;
    });

    return [totalWidth, segWidths];
}

// Flatten tokens into a stream of words and spaces.
// Newline characters emit `{break: true}` markers (hard line breaks).
function chunkTokens(tokens) {
    const chunks = [];

    for (const seg of tokens) {
        const parts = seg.text.split("\n");

        for (let p = 0; p < parts.length; p++) {
            if (p > 0) chunks.push({break: true});

            const words = parts[p].split(" ");

            for (let i = 0; i < words.length; i++) {
                const word = words[i];

                if (i > 0)
                    chunks.push({text: " ", color: seg.color, fontWeight: seg.fontWeight});

                if (word.length > 0)
                    chunks.push({text: word, color: seg.color, fontWeight: seg.fontWeight});
            }
        }
    }

    return chunks;
}

function isSpace(text) {
    return text.trim().length === 0;
}

// Wrap chunks by measuring line widths.
// Remove last character (space) at the end of each line.
// `{break: true}` markers from chunkTokens() force a hard line break.
function splitLines(chunks, prop) {
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;

    const flushLine = () => {
        if (isSpace(currentLine.at(-1).text)) currentLine.pop();

        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
    };

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Hard line break: flush the current line (blank lines collapse).
        if (chunk.break) {
            if (currentLine.length > 0) flushLine();
            continue;
        }

        const w = measureChunkWidth(chunk, prop);

        // End line if it reaches maximum allowed width.
        if (
            currentLine.length > 0
            && (currentWidth + w) > prop.maxWidth
            && isSpace(currentLine.at(-1).text)
        ) {
            // Remove trailing space at the end of each line.
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

// Split a line by the segment symbol while respecting backslash escapes.
// A backslash before the symbol (or another backslash) makes it literal
// text instead of a segment boundary.
function segTextLine(line, symbol, escape) {
    const result = [];

    for (const seg of line) {
        let current = "";
        for (let i = 0; i < seg.text.length; i++) {
            const ch = seg.text[i];

            if (ch === symbol) {
                if (current.length > 0)
                    result.push({text: current, color: seg.color, fontWeight: seg.fontWeight});

                current = "";
                result.push("wait");
                continue;
            }

            if (ch === escape) {
                const next = seg.text[i + 1];
                if (!next) continue;

                current += next;
                i++;
                continue;
            }

            current += ch;
        }

        if (current.length > 0)
            result.push({text: current, color: seg.color, fontWeight: seg.fontWeight});
    }

    return result;
}

// Wrap while preserving style state across line breaks.
// This must match the vertical positioning behavior of getWrappedTextPos().
export function wrapTextSegments(prop) {
    // Build word/space chunks with style state preserved.
    const tokens = chunkTokens(tokenizeText(
        prop.text,
        prop.styleSymbol,
        prop.escapeSymbol
    ));

    // Balance text width to prevent shorter last line
    let lines = splitLines(tokens, prop);

    if (prop.balancedWidth && lines.length > 1) {
        let add = prop.maxWidth;

        while (add >= 40) {
            add /= 2;
            prop.maxWidth -= add;
            const newLines = splitLines(tokens, prop);

            if (newLines.length === lines.length) {
                lines = newLines;
            } else {
                prop.maxWidth += add;
            }
        }
    }

    // Split text segments and remove used escape bars
    if (prop.segmentSymbol !== null) {
        lines = lines.map((i) =>
            segTextLine(i, prop.segmentSymbol, prop.escapeSymbol)
        );
    }

    return lines;
}
