import {test} from "node:test";
import assert from "node:assert/strict";
import {Param, effectiveParam, mergeParam, assertKnownKeys, suggestSimilar} from "../Engine/param.js";
import {Engine as _} from "../Engine/engine.js";

test("effectiveParam inherits global when undefined", () => {
    _.reset();
    assert.equal(effectiveParam("text", "posX"), Param.global.posX);
});

test("assertKnownKeys rejects typos with suggestion", () => {
    assert.throws(() => assertKnownKeys("text", {maxwidth: 10}, "newText()"), /did you mean "maxWidth"/);
    assert.doesNotThrow(() => assertKnownKeys("addon", {anything: 1}, "x"));
});

test("mergeParam fills global keys", () => {
    _.reset();
    const prop = mergeParam("text", {text: "hi"}, "newText()");
    assert.equal(prop.text, "hi");
    assert.equal(prop.opacity, Param.global.opacity);
    assert.equal(prop.posX, Param.global.posX);
});

test("suggestSimilar returns close match", () => {
    assert.equal(suggestSimilar("maxwidth", ["maxWidth", "posX"]), "maxWidth");
});
test("unknown keys name the type that owns them", () => {
    assert.throws(() => assertKnownKeys("global", {fontSize: 10}, "setProp()"), /It is a "text" property/);
    assert.throws(() => assertKnownKeys("global", {fontSize: 10}, "newText()"), /unknown property/);
});
