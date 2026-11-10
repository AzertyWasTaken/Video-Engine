import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {setCanvas, render} from "../Engine/render.js";
import {previewFrame} from "../Engine/pipeline.js";
import {Engine as _} from "../Engine/engine.js";

test("previewFrame writes a PNG", async () => {
    _.reset();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anim-preview-"));
    const out = path.join(dir, "preview.png");

    _.newText({text: "Preview", duration: 1});
    _.wait(1);

    const result = await previewFrame({WIDTH: 64, HEIGHT: 64, FPS: 12, SCALE: 1}, import.meta.url, {t: 0.5, out});
    assert.equal(result, out);
    assert.ok(fs.existsSync(out));
    assert.ok(fs.statSync(out).size > 0);

    fs.rmSync(dir, {recursive: true, force: true});
});