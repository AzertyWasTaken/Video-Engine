"use strict";
import {Canvas} from "skia-canvas";

const canvas = new Canvas(1, 1);
canvas.gpu = true;
const ctx = canvas.getContext("2d");

// Produces an ordered list of segments with style state applied across the whole input text.
// Each returned segment has the form `{text: <string>, color: <string|null>, fontWeight: <number|null>}`.
// Every entry is matched on its own `openSymbol` / `closeSymbol` strings, so it can require any
// number of symbols in a row. `closeSymbol` defaults to `openSymbol` (toggle on / off).
// Special characters (style open and close symbols, and escape) can be escaped.
function tokenizeText(text, styleDefs, escapeCh) {
    const tokens = [];
    const styleStack = [];
    let current = "";

    // Validate style definitions once per call and index them by their first character,
    // longest symbol first so a multi-symbol match wins over a shorter one.
    const symbolMap = new Map();
    for (const def of styleDefs ?? []) {
        if (!def || typeof def !== "object")
            throw new Error(`styleSymbol entries must be objects, got ${JSON.stringify(def)}.`);
        if (typeof def.openSymbol !== "string" || def.openSymbol.length === 0)
            throw new Error(`styleSymbol entry needs a non-empty openSymbol string, got ${JSON.stringify(def.openSymbol)}.`);
        if (def.closeSymbol !== undefined && (typeof def.closeSymbol !== "string" || def.closeSymbol.length === 0))
            throw new Error(`styleSymbol closeSymbol must be a non-empty string, got ${JSON.stringify(def.closeSymbol)}.`);
        if (def.color !== undefined && typeof def.color !== "string")
            throw new Error(`styleSymbol color must be a string, got ${JSON.stringify(def.color)}.`);
        if (def.fontWeight !== undefined && (typeof def.fontWeight !== "number" || !Number.isFinite(def.fontWeight)))
            throw new Error(`styleSymbol fontWeight must be a finite number, got ${JSON.stringify(def.fontWeight)}.`);

        // A repeated open/close pair behaves exactly like a single toggle symbol.
        const toggle = def.closeSymbol === undefined || def.closeSymbol === def.openSymbol;
        for (const symbol of toggle ? [def.openSymbol] : [def.openSymbol, def.closeSymbol]) {
            const role = toggle ? "toggle" : (symbol === def.openSymbol ? "open" : "close");
            const matchers = symbolMap.get(symbol[0]) ?? [];
            if (role !== "close" && matchers.some((m) => m.symbol === symbol))
                throw new Error(`Duplicate styleSymbol symbol ${JSON.stringify(symbol)}.`);
            matchers.push({symbol, def, role});
            matchers.sort((a, b) => b.symbol.length - a.symbol.length);
            symbolMap.set(symbol[0], matchers);
        }
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
        // The longest symbol matching here wins, so a multi-symbol entry beats a shorter
        // one starting with the same character.
        const match = symbolMap.get(ch)?.find((m) => text.startsWith(m.symbol, i));
        if (match !== undefined && !(match.role === "close" && styleStack.length === 0)) {
            // Flush the buffer with the *current* (pre-toggle) style first.
            flush();

            // Open and toggle turn on (or off when already on top); close turns off.
            const top = styleStack.at(-1);
            if (match.role === "open" || (match.role === "toggle" && top !== match.def))
                styleStack.push(match.def);
            else
                styleStack.pop();

            i += match.symbol.length - 1;
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

// Measure the total width of chunks laid out on one line.
function measureChunksWidth(chunks, prop) {
    let totalWidth = 0;

    for (const chunk of chunks) {
        if (typeof chunk === "object" && !chunk.break)
            totalWidth += measureChunkWidth(chunk, prop);
    }

    return totalWidth;
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

// Auto-sizing uses an option and a positive width limit.
function validateAutoSize(prop) {
    if (typeof prop.autoSize !== "boolean")
        throw new Error(`autoSize must be a boolean, got ${JSON.stringify(prop.autoSize)}.`);

    if (typeof prop.maxWidth !== "number" || !Number.isFinite(prop.maxWidth) || prop.maxWidth <= 0) {
        throw new Error(
            `autoSize requires a finite maxWidth greater than 0, got ${JSON.stringify(prop.maxWidth)}.`
        );
    }

    if (
        typeof prop.fontSizeStep !== "number"
        || !Number.isFinite(prop.fontSizeStep)
        || prop.fontSizeStep <= 0
    ) {
        throw new Error(
            `fontSizeStep must be a finite number greater than 0, got ${JSON.stringify(prop.fontSizeStep)}.`
        );
    }
}

// Fit all text on one line, ignoring hard breaks, and update prop.fontSize.
// A binary search handles font metrics that do not scale exactly linearly.
function fitTextFontSize(prop, chunks) {
    const oneLineChunks = chunks.filter((chunk) => !chunk.break);
    const segments = prop.segmentSymbol === null
        ? oneLineChunks
        : segTextLine(oneLineChunks, prop.segmentSymbol, prop.escapeSymbol);
    const hasText = segments.some((segment) =>
        typeof segment === "object" && segment.text.trim().length > 0
    );

    if (!hasText)
        throw new Error("autoSize requires at least one non-whitespace text character.");

    const sizeFits = (fontSize) => {
        const measuringProp = {...prop, fontSize};
        const width = measureChunksWidth(segments, measuringProp);
        return Number.isFinite(width) && width <= prop.maxWidth;
    };

    if (!sizeFits(prop.fontSizeStep)) {
        throw new Error(
            `Text cannot fit maxWidth ${prop.maxWidth} at fontSizeStep ${prop.fontSizeStep}.`
        );
    }

    let low = 1;
    let high = 2;
    while (sizeFits(high * prop.fontSizeStep)) {
        low = high;
        high *= 2;
        if (!Number.isFinite(high)) {
            throw new Error(
                `Unable to find a finite autoSize for maxWidth ${prop.maxWidth}.`
            );
        }
    }

    while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (sizeFits(middle * prop.fontSizeStep))
            low = middle;
        else
            high = middle;
    }

    prop.fontSize = low * prop.fontSizeStep;
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
// Line positions are computed in newText() (textEvents.js).
export function wrapTextSegments(prop) {
    // Build word/space chunks with style state preserved.
    let chunks = chunkTokens(tokenizeText(
        prop.text,
        prop.styleSymbol,
        prop.escapeSymbol
    ));

    if (typeof prop.autoSize !== "boolean")
        throw new Error(`autoSize must be a boolean, got ${JSON.stringify(prop.autoSize)}.`);

    // Remove hard breaks: autoSize always renders all text on one line.
    if (prop.autoSize) {
        validateAutoSize(prop);
        fitTextFontSize(prop, chunks);
        chunks = chunks.filter((chunk) => !chunk.break);
    }

    // Auto-sized text is already verified to fit on one line.
    let lines = prop.autoSize ? [chunks] : splitLines(chunks, prop);

    if (prop.balancedWidth && lines.length > 1) {
        let add = prop.maxWidth;

        while (add >= 40) {
            add /= 2;
            prop.maxWidth -= add;
            const newLines = splitLines(chunks, prop);

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
