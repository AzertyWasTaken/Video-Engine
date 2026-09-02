"use strict";
export const Param = {
    text: {
        id: null, // Integer or string group identifier (auto-assigned when omitted)

        text: "Hello, world!",
        fontSize: 80,
        fontColor: "#FFFFFF",
        fontFamily: "Arial",
        fontWeight: 400, // Normal; bold segments use 700

        posX: 0, // Horizontal offset from center
        posY: 0, // Vertical offset from center (before alignment)
        alignY: 0, // Vertical alignment: -1 (top), 0 (center), 1 (bottom)
        maxWidth: Infinity, // Line-wrap threshold (pixels)
        balancedWidth: false, // Balanced text width

        boldSymbol: null, // Enable bold markup parsing with selected symbol
        colorSymbol: [], // Enable color markup parsing with selected symbol
        segmentSymbol: null, // Enable segment splitting with selected symbol
        escapeSymbol: null, // Enable escaping special characters with selected symbol

        fadeIn: 0, // Fade-in duration (seconds) from transparent to full opacity
        fadeOut: 0, // Fade-out duration (seconds) from full opacity to transparent
        duration: null, // Seconds until the event auto-ends (null = until cleared)
        autoSetPosX: false, // Auto-increment posX for chained texts
        autoSetPosY: false, // Auto-increment posY for chained texts

        flashDuration: 0, // Flash duration on newly spawned text (disabled if 0)
        flashColor: "#FFFF60", // Flash color on newly spawned text

        onTextSegment: () => {}, // Callback per segment (textLength) => void
    },

    line: {
        id: null, // Integer or string group identifier (auto-assigned when omitted)

        lengthX: 0,
        lengthY: 0,
        lineWidth: 16,
        color: "#FFFFFF",

        posX: 0, // Horizontal offset from center
        posY: 0, // Vertical offset from center (before alignment)

        fadeIn: 0, // Fade-in duration (seconds) from transparent to full opacity
        fadeOut: 0, // Fade-out duration (seconds) from full opacity to transparent
        duration: null, // Seconds until the event auto-ends (null = until cleared)
    },

    rect: {
        id: null, // Integer or string group identifier (auto-assigned when omitted)

        width: 256,
        height: 256,
        color: "#FFFFFF",

        posX: 0, // Horizontal offset from center
        posY: 0, // Vertical offset from center (before alignment)

        fadeIn: 0, // Fade-in duration (seconds) from transparent to full opacity
        fadeOut: 0, // Fade-out duration (seconds) from full opacity to transparent
        duration: null, // Seconds until the event auto-ends (null = until cleared)
    },

    circle: {
        id: null, // Integer or string group identifier (auto-assigned when omitted)

        diameter: 40,
        color: "#FFFFFF",

        posX: 0, // Horizontal offset from center
        posY: 0, // Vertical offset from center (before alignment)

        fadeIn: 0, // Fade-in duration (seconds) from transparent to full opacity
        fadeOut: 0, // Fade-out duration (seconds) from full opacity to transparent
        duration: null, // Seconds until the event auto-ends (null = until cleared)
    },

    image: {
        id: null, // Integer or string group identifier (auto-assigned when omitted)

        width: 256,
        height: 256,
        src: "",

        posX: 0, // Horizontal offset from center
        posY: 0, // Vertical offset from center (before alignment)

        fadeIn: 0, // Fade-in duration (seconds) from transparent to full opacity
        fadeOut: 0, // Fade-out duration (seconds) from full opacity to transparent
        duration: null, // Seconds until the event auto-ends (null = until cleared)
    },

    addon: {}
};
