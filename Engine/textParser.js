"use strict";
import {Canvas} from "skia-canvas";

const canvas = new Canvas(1, 1);
canvas.gpu = true;
const ctx = canvas.getContext("2d");

// Style state a styleSymbol entry may override; `null` means "inherit the text default".
const STYLE_KEYS = ["color", "fontWeight", "fontFamily", "italic", "fontSize", "offsetY"];

// Innermost style stack entry that defines a field wins, so an entry with
// `italic: false` still turns italic off inside italic text.
function resolveStyle(styleStack) {
    const style = {};
    for (const key of STYLE_KEYS) {
        const entry = styleStack.findLast((layer) => layer[key] !== undefined);
        style[key] = entry === undefined ? null : entry[key];
    }
    return style;
}

// Copy the style state a token or chunk carries onto a new segment.
function pickStyle(source) {
    const style = {};
    for (const key of STYLE_KEYS) style[key] = source[key];
    return style;
}

function validateStyleDef(def) {
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
    if (def.fontFamily !== undefined && (typeof def.fontFamily !== "string" || def.fontFamily.length === 0))
        throw new Error(`styleSymbol fontFamily must be a non-empty string, got ${JSON.stringify(def.fontFamily)}.`);
    if (def.italic !== undefined && typeof def.italic !== "boolean")
        throw new Error(`styleSymbol italic must be a boolean, got ${JSON.stringify(def.italic)}.`);
    if (def.fontSize !== undefined && (typeof def.fontSize !== "number" || !Number.isFinite(def.fontSize) || def.fontSize <= 0))
        throw new Error(`styleSymbol fontSize must be a finite number greater than 0 (relative to the text fontSize), got ${JSON.stringify(def.fontSize)}.`);
    if (def.offsetY !== undefined && (typeof def.offsetY !== "number" || !Number.isFinite(def.offsetY)))
        throw new Error(`styleSymbol offsetY must be a finite number (relative to the text fontSize), got ${JSON.stringify(def.offsetY)}.`);
}

// Split text into styled tokens with style state applied across the whole input text.
// Each token has the form `{text, color, fontWeight, fontFamily, italic, fontSize, offsetY}`;
// `fontSize` and `offsetY` are multipliers relative to the text's base `fontSize`, resolved
// during measurement (textParser.js) and event creation (textEvents.js).
// Each entry matches its own `openSymbol` / `closeSymbol` strings, so a symbol can be any
// number of characters; `closeSymbol` defaults to `openSymbol` (toggle on / off).
// Special characters (style symbols and the escape character) can be escaped.
function tokenizeText(text, styleDefs, escapeCh) {
    const tokens = [];
    const styleStack = [];
    let current = "";

    // Index symbols by their first character, longest symbol first so a multi-symbol
    // match wins over a shorter one at the same position.
    const symbolMap = new Map();
    for (const def of styleDefs ?? []) {
        validateStyleDef(def);

        // A repeated open/close pair behaves exactly like a single toggle symbol.
        const toggle = def.closeSymbol === undefined || def.closeSymbol === def.openSymbol;
        const symbols = toggle
            ? [{symbol: def.openSymbol, role: "toggle"}]
            : [{symbol: def.openSymbol, role: "open"}, {symbol: def.closeSymbol, role: "close"}];

        for (const {symbol, role} of symbols) {
            const matchers = symbolMap.get(symbol[0]) ?? [];
            if (role !== "close" && matchers.some((matcher) => matcher.symbol === symbol))
                throw new Error(`Duplicate styleSymbol symbol ${JSON.stringify(symbol)}.`);
            matchers.push({symbol, role, def});
            symbolMap.set(symbol[0], matchers);
        }
    }

    for (const matchers of symbolMap.values())
        matchers.sort((a, b) => b.symbol.length - a.symbol.length);

    // Push the buffered text with the style state that was active while it was read.
    const flush = () => {
        if (current.length === 0) return;
        tokens.push({text: current, ...resolveStyle(styleStack)});
        current = "";
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        // A close symbol with no open region stays literal text.
        const match = symbolMap.get(ch)?.find((matcher) => text.startsWith(matcher.symbol, i));
        if (match !== undefined && !(match.role === "close" && styleStack.length === 0)) {
            // Close the buffered text with the pre-toggle style first.
            flush();

            // Open pushes, close pops the innermost region, toggle flips.
            if (match.role === "close" || (match.role === "toggle" && styleStack.at(-1) === match.def))
                styleStack.pop();
            else
                styleStack.push(match.def);

            i += match.symbol.length - 1;
            continue;
        }

        // Keep the escape in the output for segTextLine(), but copy the next character
        // verbatim so it cannot open, close or split anything.
        if (ch === escapeCh) {
            current += ch;
            const next = text[i + 1];
            if (next !== undefined) {
                current += next;
                i++;
            }
            continue;
        }

        current += ch;
    }

    flush();
    return tokens;
}

// Single source of truth for the canvas font shorthand, shared with render.js so the
// measured width of a segment always matches the width actually drawn.
export function fontString(italic, fontWeight, fontSize, fontFamily) {
    return `${italic ? "italic " : ""}${fontWeight} ${fontSize}px ${fontFamily}`;
}

function measureChunkWidth(chunk, prop) {
    const weight = chunk.fontWeight ?? prop.fontWeight;
    const family = chunk.fontFamily ?? prop.fontFamily;
    const italic = chunk.italic ?? prop.italic;
    // `fontSize` is a styleSymbol multiplier (1 = base size); resolve to pixels so
    // auto-sizing (which swaps `prop.fontSize`) scales overrides correctly.
    ctx.font = fontString(italic, weight, (chunk.fontSize ?? 1) * prop.fontSize, family);
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
    ctx.font = fontString(item.italic, item.fontWeight, item.fontSize, item.fontFamily);
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

// Remove escape characters; a dangling escape is dropped.
// Returns the same string when nothing is escaped.
function stripEscapes(text, escapeCh) {
    if (!escapeCh || !text.includes(escapeCh)) return text;

    let out = "";
    for (let i = 0; i < text.length; i++) {
        if (text[i] === escapeCh) {
            const next = text[i + 1];
            if (next === undefined) break;

            out += next;
            i++;
            continue;
        }

        out += text[i];
    }

    return out;
}

// Flatten tokens into a stream of words and spaces.
// Newline characters emit `{break: true}` markers (hard line breaks).
// Escape characters are consumed here: `text` is measured and rendered, while `raw` keeps the
// escaped form for segTextLine(), which must not split at an escaped segment symbol.
function chunkTokens(tokens, escapeCh) {
    const chunks = [];

    const pushChunk = (text, seg) => {
        const shown = stripEscapes(text, escapeCh);
        if (shown.length === 0) return;

        chunks.push({text: shown, raw: text, ...pickStyle(seg)});
    };

    for (const seg of tokens) {
        const parts = seg.text.split("\n");

        for (let p = 0; p < parts.length; p++) {
            if (p > 0) chunks.push({break: true});

            const words = parts[p].split(" ");

            for (let i = 0; i < words.length; i++) {
                if (i > 0) pushChunk(" ", seg);
                if (words[i].length > 0) pushChunk(words[i], seg);
            }
        }
    }

    return chunks;
}

function isSpace(text) {
    return text.trim().length === 0;
}

// Auto-sizing needs a width limit and a positive size step.
// `autoSize` itself is checked by wrapTextSegments(), which calls this only when it is enabled.
function validateAutoSize(prop) {
    if (typeof prop.maxWidth !== "number" || !Number.isFinite(prop.maxWidth) || prop.maxWidth <= 0)
        throw new Error(`autoSize requires a finite maxWidth greater than 0, got ${JSON.stringify(prop.maxWidth)}.`);

    if (typeof prop.fontSizeStep !== "number" || !Number.isFinite(prop.fontSizeStep) || prop.fontSizeStep <= 0)
        throw new Error(`fontSizeStep must be a finite number greater than 0, got ${JSON.stringify(prop.fontSizeStep)}.`);
}

// Fit all text on one line, ignoring hard breaks, and update prop.fontSize.
// A binary search handles font metrics that do not scale exactly linearly.
function fitTextFontSize(prop, chunks) {
    // Break markers are already removed by wrapTextSegments().
    const segments = prop.segmentSymbol === null
        ? chunks
        : segTextLine(chunks, prop.segmentSymbol, prop.escapeSymbol);
    const hasText = segments.some((segment) => typeof segment === "object" && !isSpace(segment.text));

    if (!hasText)
        throw new Error("autoSize requires at least one non-whitespace text character.");

    const sizeFits = (fontSize) => {
        const measuringProp = {...prop, fontSize};
        const width = measureChunksWidth(segments, measuringProp);
        return Number.isFinite(width) && width <= prop.maxWidth;
    };

    if (!sizeFits(prop.fontSizeStep))
        throw new Error(`Text cannot fit maxWidth ${prop.maxWidth} at fontSizeStep ${prop.fontSizeStep}.`);

    let low = 1;
    let high = 2;
    while (sizeFits(high * prop.fontSizeStep)) {
        low = high;
        high *= 2;
        if (!Number.isFinite(high))
            throw new Error(`Unable to find a finite autoSize for maxWidth ${prop.maxWidth}.`);
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
// Every line drops its trailing space; blank lines collapse.
// `{break: true}` markers from chunkTokens() force a hard line break.
function splitLines(chunks, maxWidth, prop) {
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;

    // Finish the current line: drop its trailing space, skip it when nothing is left.
    const flushLine = () => {
        if (isSpace(currentLine.at(-1).text)) currentLine.pop();

        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
    };

    for (const chunk of chunks) {
        // Hard line break.
        if (chunk.break) {
            if (currentLine.length > 0) flushLine();
            continue;
        }

        const w = measureChunkWidth(chunk, prop);

        // End the line before this chunk when the next word would overflow.
        if (currentLine.length > 0 && (currentWidth + w) > maxWidth && isSpace(currentLine.at(-1).text))
            flushLine();

        currentLine.push(chunk);
        currentWidth += w;
    }

    if (currentLine.length > 0) flushLine();
    return lines;
}

// Split a line by the segment symbol while respecting escapes.
// An escaped symbol (or escape character) is literal text instead of a segment boundary.
function segTextLine(line, symbol, escape) {
    const result = [];

    for (const seg of line) {
        // Chunks already carry the visible text; `raw` still marks escaped segment symbols.
        const source = seg.raw ?? seg.text;
        const style = pickStyle(seg);
        let current = "";

        const flush = () => {
            if (current.length === 0) return;
            result.push({text: current, ...style});
            current = "";
        };

        for (let i = 0; i < source.length; i++) {
            const ch = source[i];

            if (ch === symbol) {
                flush();
                result.push("wait");
                continue;
            }

            if (ch === escape) {
                const next = source[i + 1];
                if (next === undefined) continue;

                current += next;
                i++;
                continue;
            }

            current += ch;
        }

        flush();
    }

    return result;
}

function preSplitLines(chunks, prop) {
    // Auto-sized text is already verified to fit on one line.
    if (prop.autoSize) return [chunks];

    let maxWidth = prop.maxWidth;
    let lines = splitLines(chunks, maxWidth, prop);
    if (!prop.balancedWidth || lines.length < 2) return lines;

    // Balancing shrinks maxWidth in halving steps, so both bounds must converge.
    if (!Number.isFinite(maxWidth))
        throw new Error(`balancedWidth requires a finite maxWidth, got ${JSON.stringify(maxWidth)}.`);
    if (typeof prop.widthStep !== "number" || !Number.isFinite(prop.widthStep) || prop.widthStep <= 0)
        throw new Error(`widthStep must be a finite number greater than 0, got ${JSON.stringify(prop.widthStep)}.`);

    let add = maxWidth;
    while (add >= prop.widthStep) {
        add /= 2;
        const reduced = splitLines(chunks, maxWidth - add, prop);

        // Keep the narrower layout while it still wraps into the same number of lines.
        if (reduced.length !== lines.length) continue;

        maxWidth -= add;
        lines = reduced;
    }

    return lines;
}

// Wrap while preserving style state across line breaks.
// Line positions are computed in newText() (textEvents.js).
export function wrapTextSegments(prop) {
    // Build word/space chunks with style state preserved.
    let chunks = chunkTokens(tokenizeText(prop.text, prop.styleSymbol, prop.escapeSymbol), prop.escapeSymbol);

    if (typeof prop.autoSize !== "boolean")
        throw new Error(`autoSize must be a boolean, got ${JSON.stringify(prop.autoSize)}.`);

    // Auto-sized text always renders on one line, so hard breaks are dropped first.
    if (prop.autoSize) {
        validateAutoSize(prop);
        chunks = chunks.filter((chunk) => !chunk.break);
        fitTextFontSize(prop, chunks);
    }

    const lines = preSplitLines(chunks, prop);
    if (prop.segmentSymbol === null) return lines;

    // Escape characters are already consumed by chunkTokens().
    return lines.map((line) => segTextLine(line, prop.segmentSymbol, prop.escapeSymbol));
}
