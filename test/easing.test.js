import {test} from "node:test";
import assert from "node:assert/strict";
import {Easing, getEasing} from "../Engine/easing.js";

test("getEasing resolves names and directions", () => {
    const linearOut = getEasing("linear", "out");
    assert.equal(linearOut(0.25), 0.25);
    const quadInOut = getEasing("quad", "inOut");
    assert.equal(quadInOut(0), 0);
    assert.equal(quadInOut(1), 1);
    assert.throws(() => getEasing("nope"));
    assert.throws(() => getEasing("linear", "sideways"));
});

test("Easing.linear identity", () => {
    assert.equal(Easing.linear(0.5), 0.5);
});