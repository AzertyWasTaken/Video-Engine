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
    },

    text: {
        text: "Hello, world!",
        fontSize: 80,
        fontColor: "#FFFFFF",
        fontFamily: "Arial",
        fontWeight: 400, // Normal; bold segments use 700

        lineGap: 0, // Extra space between lines (pixels)

        maxWidth: Infinity, // Line-wrap threshold (pixels)
        balancedWidth: false, // Balanced text width
        autoSize: false, // Fit text on one line within maxWidth
        fontSizeStep: 1, // Font-size rounding step for autoSize (pixels)

        styleSymbol: [], // Style markup entries [{openSymbol, closeSymbol?, color?, fontWeight?}]
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
export const GLOBAL_KEYS = ["id", "posX", "posY", "rotation", "alignX", "alignY", "fadeIn", "fadeOut", "opacity", "duration"];

// Effective default for one key: the type's value, or the global when undefined.
export function effectiveParam(type, key) {
    const value = Param[type][key];
    return value === undefined && GLOBAL_KEYS.includes(key) ? Param.global[key] : value;
}

// Merge newProp over the type defaults, then fill global-backed keys left undefined.
export function mergeParam(type, newProp) {
    const prop = {...Param[type], ...newProp};

    for (const key of GLOBAL_KEYS) {
        if (prop[key] === undefined) prop[key] = Param.global[key];
    }

    return prop;
}
