"use strict";
import fs from "fs";
import path from "path";
import {getTime, audio, visual} from "./state.js";
import {record, preloadImages} from "./record.js";
import {setCanvas, render} from "./render.js";
import {addSounds} from "./addSounds.js";
import {ffmpegPath, resolveCallerPath} from "./utils.js";

export function getTimeline() {
    return {visual, audio, duration: getTime()};
}

function validateConfig(CONFIG) {
    if (!CONFIG || typeof CONFIG !== "object")
        throw new Error("renderVideo()/previewFrame() expect CONFIG {WIDTH, HEIGHT, FPS}.");

    const {WIDTH, HEIGHT, FPS, SCALE = 1} = CONFIG;
    for (const [key, value] of [["WIDTH", WIDTH], ["HEIGHT", HEIGHT], ["FPS", FPS], ["SCALE", SCALE]]) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
            throw new Error(`renderVideo()/previewFrame() expect a positive finite CONFIG.${key}, got ${value}.`);
    }
}

export async function renderVideo(CONFIG, callerPath, opts = {}) {
    validateConfig(CONFIG);

    const duration = getTime();
    const visualPath = await record(CONFIG, visual, duration, callerPath, opts);

    let audioResult = null;
    if (opts.audio === true)
        audioResult = addSounds(audio, duration, callerPath, opts);

    return {visualPath, audioResult, duration};
}

// Render one timeline frame to a PNG next to the calling script - no FFmpeg.
// Fast visual check while iterating: `await previewFrame(CONFIG, import.meta.url, {t: 1.5})`.
export async function previewFrame(CONFIG, callerPath, opts = {}) {
    validateConfig(CONFIG);

    const {WIDTH, HEIGHT, SCALE = 1} = CONFIG;
    const {t = 0, out = "preview.png"} = opts;

    if (typeof t !== "number" || !Number.isFinite(t) || t < 0)
        throw new Error(`previewFrame() expects a finite time t in seconds, got ${t}.`);

    let outPath = typeof out === "string" && out.length > 0 ? out : "preview.png";
    if (!path.isAbsolute(outPath))
        outPath = path.join(path.dirname(resolveCallerPath(callerPath)), outPath);

    setCanvas(WIDTH, HEIGHT, SCALE);
    await preloadImages(visual, t, t + 1e-6, path.dirname(outPath));

    const canvas = render(visual, t);
    const buffer = canvas.toBufferSync("png");
    await fs.promises.writeFile(outPath, buffer);

    console.log(`Preview frame at ${t}s written to ${outPath}`);
    return outPath;
}

export {ffmpegPath, resolveCallerPath};
