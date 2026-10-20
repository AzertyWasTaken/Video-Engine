"use strict";
// Per-type defaults; GLOBAL_KEYS inherit from Param.global while undefined.
export const Param = {
    global: {
        id: null, // Id or array of ids; a unique negative id is auto-assigned when omitted
        posX: 0, // Horizontal offset from center
        posY: 0, // Vertical offset from center (before alignment)
        rotation: 0, // Clockwise rotation in degrees about the object's anchor
        alignX: 0, // Horizontal alignment: -1 (left), 0 (center), 1 (right)
        alignY: 0, // Vertical alignment: -1 (top), 0 (center), 1 (bottom)
        fadeIn: 0, // Fade-in duration (seconds) from transparent to full opacity
        fadeOut: 0, // Fade-out duration (seconds) from full opacity to transparent
        opacity: 1, // Base opacity: 0 is invisible and 1 is opaque
        duration: null, // Seconds until the event auto-ends (null = until cleared)
        layoutOrder: 0, // Draw order: higher values draw on top; ties keep creation order
    },

    text: {
        text: "Hello, world!",
        fontSize: 80,
        fontColor: "#FFFFFF",
        fontFamily: "Arial",
        fontWeight: 400, // Normal; bold segments use 700
        italic: false, // Italic text; styled segments override it

        lineGap: 0, // Extra space between lines (pixels)

        maxWidth: Infinity, // Line-wrap threshold (pixels)
        balancedWidth: false, // Balanced text width
        autoSize: false, // Fit text on one line within maxWidth
        fontSizeStep: 1, // Font-size rounding step for autoSize (pixels)

        styleSymbol: [], // Style markup entries [{openSymbol, closeSymbol?, color?, fontWeight?, fontFamily?, italic?}]
        segmentSymbol: null, // Enable segment splitting with selected symbol
        escapeSymbol: null, // Enable escaping special characters with selected symbol

        autoSetPosX: false, // Auto-increment posX for chained texts
        autoSetPosY: false, // Auto-increment posY for chained texts

        flashDuration: 0, // Flash duration on newly spawned text (disabled if 0)
        flashColor: "#FFFF00", // Flash color on newly spawned text

        onTextSegment: () => {}, // Callback per segment (textLength) => void
    },

    line: {
        positions: [{x: -0.5, y: -0.5}, {x: 0.5, y: 0.5}],
        scaleX: 1,
        scaleY: 1,
        lineWidth: 16,
        loop: false, // Close the path: stroke back from the last vertex to the first
        color: "#FFFFFF",
    },

    rect: {
        width: 256,
        height: 256,
        color: "#FFFFFF",
        strokeColor: null, // Stroke color; null disables the stroke
        strokeWidth: 4, // Stroke width in pixels
    },

    circle: {
        diameter: 40,
        arc: 360, // Arc sweep in clockwise degrees from 12 o'clock (360 = full circle)
        color: "#FFFFFF",
        strokeColor: null, // Stroke color; null disables the stroke
        strokeWidth: 4, // Stroke width in pixels
    },

    image: {
        width: 256,
        height: 256,
        src: "",
    },

    addon: {}
};

// Keys backed by Param.global: a type value of undefined inherits the global one.
export const GLOBAL_KEYS = ["id", "posX", "posY", "rotation", "alignX", "alignY", "fadeIn", "fadeOut", "opacity", "duration", "layoutOrder"];

// Effective default for one key: the type's value, or the global when undefined.
export function effectiveParam(type, key) {
    const value = Param[type][key];
    return value === undefined && GLOBAL_KEYS.includes(key) ? Param.global[key] : value;
}

// Merge newProp over the type defaults, then fill global-backed keys left undefined.
// `source` names the caller for unknown-key errors (e.g. "newText()").
export function mergeParam(type, newProp, source = "newText()/pushVisual()") {
    assertKnownKeys(type, newProp, source);

    const prop = {...Param[type], ...newProp};

    for (const key of GLOBAL_KEYS) {
        if (prop[key] === undefined) prop[key] = Param.global[key];
    }

    return prop;
}

// Edit distance for "did you mean" suggestions on mistyped keys and ids.
function keyDistance(a, b) {
    const prev = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;

        for (let j = 1; j <= b.length; j++) {
            const next = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = next;
        }
    }

    return prev[b.length];
}

// Closest candidate within a small edit distance, or null.
export function suggestSimilar(input, candidates) {
    const word = String(input);
    let best = null;
    let bestScore = 3;

    for (const candidate of candidates) {
        const score = keyDistance(word, String(candidate));
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    }

    return best;
}

// Reject mistyped property keys with a helpful suggestion.
// The `addon` type is the extension point, so it skips validation.
export function assertKnownKeys(type, newProp, source) {
    if (type === "addon" || newProp === undefined || newProp === null || typeof newProp !== "object") return;

    const allowed = [...Object.keys(Param[type] ?? {}), ...GLOBAL_KEYS, "hold"];

    for (const key of Object.keys(newProp)) {
        if (allowed.includes(key)) continue;

        const suggestion = suggestSimilar(key, allowed);
        throw new Error(
            `${source}: unknown property ${JSON.stringify(key)} for type "${type}"` +
            (suggestion === null ? "." : ` - did you mean ${JSON.stringify(String(suggestion))}?`) +
            ` Valid keys: ${allowed.join(", ")}.`
        );
    }
}
