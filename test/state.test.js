import {test} from "node:test";
import assert from "node:assert/strict";
import {getTime, setTime, advanceTime, visual, audio} from "../Engine/state.js";
import {Engine as _} from "../Engine/engine.js";

test("time cursor advances and resets", () => {
    _.reset();
    assert.equal(getTime(), 0);
    advanceTime(2.5);
    assert.equal(getTime(), 2.5);
    setTime(1);
    assert.equal(getTime(), 1);
    _.reset();
    assert.equal(getTime(), 0);
    assert.equal(visual.length, 0);
    assert.equal(audio.length, 0);
});