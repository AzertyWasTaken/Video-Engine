"use strict";
import {createCanvas} from "@napi-rs/canvas";

const canvas = createCanvas(1, 1);
const ctx = canvas.getContext("2d");

// Produces an ordered list of segments with bold and color state applied across the whole input text.
// Each returned segment has the form `{text: <string>, bold: <bool>, color: <rgb|null>}`.
// Special characters (bold toggle, color toggle, and escape) can be escaped.
function tokenizeBoldText(text, boldCh, colorCh, escapeCh) {
    const tokens = [];
    let bold = false;
    const colorStack = [];
    let current = "";

    // Flush the accumulated character buffer into a new token (if non-empty),
    // capturing the current bold and color state, then reset the buffer.
    const flush = () => {
        if (current.length > 0) {
            const color = colorStack.at(-1) ?? null;
            tokens.push({text: current, bold, color});
        }
        current = "";
    };

    // Build a lookup map for O(1) per-character color-symbol matching.
    const colorMap = new Map();
    for (const {color, symbol} of colorCh) {
        colorMap.set(symbol, color);
    }

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        // ---- Color symbols ----
        // Toggle the corresponding color on / off the stack.
        const color = colorMap.get(ch);
        if (color !== undefined) {
            // Flush the buffer with the *current* (pre-toggle) color first.
            flush();

            const topColor = colorStack.at(-1) ?? null;
            if (topColor === color) {
                // Same color on top → pop (turn off).
                colorStack.pop();
            } else {
                // Different color → push (turn on).
                colorStack.push(color);
            }
            continue;
        }

        // ---- Bold symbol ----
        if (ch === boldCh) {
            flush();
            bold = !bold;
            continue;
        }

        // Escape symbol: keep it in the output for downstream parsing (segTextLine),
        // and copy the next character verbatim so it skips bold / color parsing here.
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
    const weight = chunk.bold ? 700 : prop.fontWeight;
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
function chunkTokens(tokens) {
    const chunks = [];

    for (const seg of tokens) {
        const words = seg.text.split(" ");

        for (let i = 0; i < words.length; i++) {
            const word = words[i];

            if (i > 0)
                chunks.push({text: " ", bold: seg.bold, color: seg.color});

            if (word.length > 0)
                chunks.push({text: word, bold: seg.bold, color: seg.color});
        }
    }

    return chunks;
}

function isSpace(text) {
    return text.trim().length === 0;
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
                    result.push({text: current, bold: seg.bold, color: seg.color});
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
            result.push({text: current, bold: seg.bold, color: seg.color});
    }

    return result;
}

// Wrap while preserving bold state across line breaks.
// This must match the vertical positioning behavior of getWrappedTextPos().
function wrapBoldTextSegments(prop) {
    let text = prop.text;

    // Build word/space chunks with bold state preserved.
    let tokens = prop.boldSymbol === null
    ? [{text, bold: false}]
    : tokenizeBoldText(text, prop.boldSymbol, prop.colorSymbol, prop.escapeSymbol);

    tokens = chunkTokens(tokens);
    tokens = splitLines(tokens, prop);

    if (prop.segmentSymbol !== null) {
        tokens = tokens.map((i) =>
            segTextLine(i, prop.segmentSymbol, prop.escapeSymbol)
        );
    }

    return tokens;
}

export function balancedText(prop) {
    let lines = wrapBoldTextSegments(prop);

    if (prop.balancedWidth && lines.length > 1) {
        let add = prop.maxWidth;

        while (add >= 40) {
            add /= 2;
            prop.maxWidth -= add;
            let newLines = wrapBoldTextSegments(prop);

            if (newLines.length !== lines.length) {
                prop.maxWidth += add;
            } else {
                lines = newLines;
            }
        }
    }

    return lines;
}
