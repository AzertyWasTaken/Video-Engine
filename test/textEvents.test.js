import {test} from "node:test";
import assert from "node:assert/strict";
import {Engine as _} from "../Engine/engine.js";

function textEvents() {
    return _.getVisualTimeline().filter((event) => event.type === "text");
}

test("newTexts() accepts options and leaves them untouched", () => {
    _.reset();
    const configs = {duration: 1, textGap: 40, posY: -200};
    const ids = _.newTexts([{text: "one"}, {text: "two"}], configs);

    assert.deepEqual(configs, {duration: 1, textGap: 40, posY: -200});
    assert.equal(ids.length, 2);
    assert.deepEqual(textEvents().map((event) => event.posY), [-200, -80]);
    assert.deepEqual(textEvents().map((event) => event.end), [1, 1]);
});

test("newTexts() works without an options object", () => {
    _.reset();
    _.newTexts([{text: "a"}, {text: "b"}]);
    assert.deepEqual(textEvents().map((event) => event.posY), [0, 80]);
});

test("newTexts() rejects a non-object options argument", () => {
    _.reset();
    assert.throws(() => _.newTexts([{text: "a"}], 5), /options object/);
});

test("newText() returns {id, seg} for segment-split text", () => {
    _.reset();
    const result = _.newText({text: "one; two", segmentSymbol: ";"});
    assert.ok(Array.isArray(result.id));
    assert.equal(result.seg.length, 2);
});

test("newText() returns the ids array when there is one part", () => {
    _.reset();
    const result = _.newText({text: "one"});
    assert.ok(Array.isArray(result));
});

test("glow properties reach the text events", () => {
    _.reset();
    _.newText({text: "Glow", glowRange: 20, glowIntensity: 0.5, glowColor: "#FF0000"});
    const [event] = textEvents();
    assert.equal(event.glowRange, 20);
    assert.equal(event.glowIntensity, 0.5);
    assert.equal(event.glowColor, "#FF0000");
});

test("glow is disabled by default", () => {
    _.reset();
    _.newText({text: "Plain"});
    const [event] = textEvents();
    assert.equal(event.glowRange, 0);
    assert.equal(event.glowIntensity, 1);
    assert.equal(event.glowColor, "#FFFFFF");
});

test("newText() rejects invalid glow values", () => {
    _.reset();
    assert.throws(() => _.newText({text: "x", glowRange: -1}), /glowRange/);
    assert.throws(() => _.newText({text: "x", glowRange: Infinity}), /glowRange/);
    assert.throws(() => _.newText({text: "x", glowIntensity: 1.5}), /glowIntensity/);
    assert.throws(() => _.newText({text: "x", glowColor: null}), /glowColor/);
});

test("space chunks are flagged blank so render() skips them", () => {
    _.reset();
    _.newText({text: "a b"});
    assert.deepEqual(textEvents().map((event) => [event.text, event.blank]), [
        ["a", false],
        [" ", true],
        ["b", false],
    ]);
});
