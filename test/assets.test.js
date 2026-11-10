import {test} from "node:test";
import assert from "node:assert/strict";
import path from "path";
import {resolveAsset, setAssets, getAssets} from "../Engine/assets.js";
import {Engine as _} from "../Engine/engine.js";

test("resolveAsset precedence", () => {
    _.reset();
    setAssets({click: "./Sounds/click.wav"});
    assert.equal(resolveAsset("click", "/base"), "./Sounds/click.wav");
    assert.equal(resolveAsset("/abs/file.wav", "/base"), "/abs/file.wav");
    assert.equal(resolveAsset("rel.wav", "/base"), path.join("/base", "rel.wav"));
    getAssets().clear();
});