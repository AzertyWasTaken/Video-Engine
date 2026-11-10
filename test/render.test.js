import {test} from "node:test";
import assert from "node:assert/strict";
import {setCanvas, render, renderRawFrame, pickBackground} from "../Engine/render.js";
import {Engine as _} from "../Engine/engine.js";

// Glow-tinted pixels: the halo is red, the glyphs are white.
function countGlowPixels(canvas, width, height) {
    const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 20 && data[i + 1] < 10 && data[i + 2] < 10) count++;
    }
    return count;
}

// Active background plus the fade underlay, as a comparable shape.
function pick(backgrounds, t) {
    const {background, prevBackground} = pickBackground(backgrounds, t);
    return [background?.color ?? null, prevBackground?.color ?? null];
}

test("renderRawFrame returns RGBA bytes for the whole canvas", () => {
    _.reset();
    setCanvas(8, 4, 2); // 16x8 device pixels
    _.setBackgroundColor("#000080");
    _.wait(1);

    const buffer = renderRawFrame(_.getVisualTimeline(), 0.5);

    assert.equal(buffer.length, 16 * 8 * 4);
    assert.deepEqual([...buffer.subarray(0, 4)], [0, 0, 128, 255]);
});

test("pickBackground picks the newest active background", () => {
    const backgrounds = [
        {type: "background", color: "a", start: 0},
        {type: "background", color: "b", start: 2, end: 4},
        {type: "background", color: "c", start: 6},
    ];

    assert.deepEqual(pick(backgrounds, 0.5), ["a", null]);
    assert.deepEqual(pick(backgrounds, 2.5), ["b", "a"]);
    // `b` ended, so the newer event is skipped and the open `a` still wins.
    assert.deepEqual(pick(backgrounds, 4.5), ["a", null]);
    assert.deepEqual(pick(backgrounds, 6.5), ["c", "b"]);
    assert.deepEqual(pick([], 1), [null, null]);
});

test("text glow paints a halo around the glyphs", () => {
    _.reset();
    setCanvas(160, 160, 1);
    _.newText({text: "H", fontSize: 40, glowRange: 20, glowColor: "#FF0000", duration: 1});
    _.wait(1);
    const glowing = countGlowPixels(render(_.getVisualTimeline(), 0.5), 160, 160);

    _.reset();
    setCanvas(160, 160, 1);
    _.newText({text: "H", fontSize: 40, duration: 1});
    _.wait(1);
    const plain = countGlowPixels(render(_.getVisualTimeline(), 0.5), 160, 160);

    assert.equal(plain, 0);
    assert.ok(glowing > 0, `expected glow pixels, got ${glowing}`);
});

test("glowIntensity 0 renders like a non-glowing text", () => {
    _.reset();
    setCanvas(160, 160, 1);
    _.newText({text: "H", fontSize: 40, glowRange: 20, glowIntensity: 0, glowColor: "#FF0000", duration: 1});
    _.wait(1);
    const muted = countGlowPixels(render(_.getVisualTimeline(), 0.5), 160, 160);

    assert.equal(muted, 0);
});


test("text glow paints a halo around the glyphs", () => {
    _.reset();
    setCanvas(160, 160, 1);
    _.newText({text: "H", fontSize: 40, glowRange: 20, glowColor: "#FF0000", duration: 1});
    _.wait(1);
    const glowing = countGlowPixels(render(_.getVisualTimeline(), 0.5), 160, 160);

    _.reset();
    setCanvas(160, 160, 1);
    _.newText({text: "H", fontSize: 40, duration: 1});
    _.wait(1);
    const plain = countGlowPixels(render(_.getVisualTimeline(), 0.5), 160, 160);

    assert.equal(plain, 0);
    assert.ok(glowing > 0, `expected glow pixels, got ${glowing}`);
});

test("glowIntensity 0 renders like a non-glowing text", () => {
    _.reset();
    setCanvas(160, 160, 1);
    _.newText({text: "H", fontSize: 40, glowRange: 20, glowIntensity: 0, glowColor: "#FF0000", duration: 1});
    _.wait(1);
    const muted = countGlowPixels(render(_.getVisualTimeline(), 0.5), 160, 160);

    assert.equal(muted, 0);
});