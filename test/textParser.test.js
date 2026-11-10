import {test} from "node:test";
import assert from "node:assert/strict";
import {fontString, getSegmentsWidth, wrapTextSegments} from "../Engine/textParser.js";
import {Param} from "../Engine/param.js";
import {Engine as _} from "../Engine/engine.js";

const BACKSLASH = "\\";

// Merge one text config over the defaults, like newText() does.
function textProp(newProp) {
    return {...Param.text, ...Param.global, ...newProp};
}

// Flatten wrapped lines to the text that gets rendered ("wait" markers add nothing).
function rendered(lines) {
    return lines
        .map((line) => line.map((segment) =>
            typeof segment === "object" && !segment.break ? segment.text : ""
        ).join(""))
        .join("\n");
}

test("fontString builds shorthand", () => {
    assert.equal(fontString(true, 700, 40, "Arial"), "italic 700 40px Arial");
});

test("wrapTextSegments returns lines", () => {
    _.reset();
    const prop = {...Param.text, ...Param.global, text: "Hello world", maxWidth: 1000, segmentSymbol: null};
    const lines = wrapTextSegments(prop);
    assert.ok(Array.isArray(lines));
    assert.ok(lines.length >= 1);
});

test("escape characters are consumed without segmentSymbol", () => {
    const lines = wrapTextSegments(textProp({
        text: String.raw`Use \\ to escape \* and \;.`,
        escapeSymbol: BACKSLASH,
        styleSymbol: [{openSymbol: "*", fontWeight: 700}],
        segmentSymbol: null
    }));

    assert.equal(rendered(lines), String.raw`Use \ to escape * and ;.`);
    // The escaped style symbol must not open a styled region.
    assert.equal(lines.flat().some((segment) => segment.fontWeight === 700), false);
});

test("escaped segment symbol does not split", () => {
    const lines = wrapTextSegments(textProp({
        text: "a;b\\;c",
        escapeSymbol: BACKSLASH,
        segmentSymbol: ";"
    }));

    assert.deepEqual(lines, [[
        {text: "a", color: null, fontWeight: null, fontFamily: null, italic: null, fontSize: null, offsetY: null},
        "wait",
        {text: "b;c", color: null, fontWeight: null, fontFamily: null, italic: null, fontSize: null, offsetY: null}
    ]]);
});

test("escape characters are not measured", () => {
    const escaped = wrapTextSegments(textProp({text: "\\*", escapeSymbol: BACKSLASH}));
    const plain = wrapTextSegments(textProp({text: "*"}));

    assert.equal(rendered(escaped), "*");
    assert.equal(getSegmentsWidth(textProp({}), escaped[0])[0], getSegmentsWidth(textProp({}), plain[0])[0]);
});

test("dangling escape is dropped", () => {
    const lines = wrapTextSegments(textProp({text: "abc" + BACKSLASH, escapeSymbol: BACKSLASH}));

    assert.equal(rendered(lines), "abc");
});

test("trailing spaces are not measured", () => {
    const spaced = textProp({text: "abc ", segmentSymbol: null});
    const plain = textProp({text: "abc", segmentSymbol: null});

    assert.equal(rendered(wrapTextSegments(spaced)), "abc");
    assert.equal(
        getSegmentsWidth(spaced, wrapTextSegments(spaced)[0])[0],
        getSegmentsWidth(plain, wrapTextSegments(plain)[0])[0]
    );
});

test("wrapping never emits an empty line", () => {
    // A lone leading space used to be flushed as an empty line.
    const lines = wrapTextSegments(textProp({text: " a", maxWidth: 30, segmentSymbol: null}));

    assert.deepEqual(lines.map((line) => line.length), [1]);
    assert.equal(rendered(lines), "a");
});

test("balancedWidth rejects bounds that cannot converge", () => {
    assert.throws(
        () => wrapTextSegments(textProp({text: "aa\nbb", balancedWidth: true, segmentSymbol: null})),
        /balancedWidth requires a finite maxWidth/
    );
    assert.throws(
        () => wrapTextSegments(textProp({
            text: "one two three four five six",
            maxWidth: 200,
            balancedWidth: true,
            widthStep: 0,
            segmentSymbol: null
        })),
        /widthStep must be a finite number greater than 0/
    );
});
