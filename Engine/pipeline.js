"use strict";
import fs from "fs";
import path from "path";
import {getTime, audio, visual, chapters} from "./state.js";
import {record, preloadImages, validateTimeline} from "./record.js";
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

    // Optional encode/render knobs.
    if (CONFIG.WORKERS !== undefined && CONFIG.WORKERS !== "auto"
        && (!Number.isInteger(CONFIG.WORKERS) || CONFIG.WORKERS < 1))
        throw new Error(`CONFIG.WORKERS must be a positive integer or "auto", got ${JSON.stringify(CONFIG.WORKERS)}.`);

    if (CONFIG.PRESET !== undefined && (typeof CONFIG.PRESET !== "string" || CONFIG.PRESET.length === 0))
        throw new Error(`CONFIG.PRESET must be a non-empty x264 preset name, got ${JSON.stringify(CONFIG.PRESET)}.`);

    if (CONFIG.CRF !== undefined
        && (typeof CONFIG.CRF !== "number" || !Number.isFinite(CONFIG.CRF) || CONFIG.CRF < 0 || CONFIG.CRF > 51))
        throw new Error(`CONFIG.CRF must be a finite number between 0 and 51, got ${JSON.stringify(CONFIG.CRF)}.`);
}

function parsePreviewTimes(duration) {
    const times = [];

    if (process.env.ANIM_PREVIEW !== undefined) {
        const t = Number(process.env.ANIM_PREVIEW);
        if (Number.isFinite(t)) times.push(t);
    }

    if (process.env.ANIM_PREVIEW_FRAMES) {
        for (const part of process.env.ANIM_PREVIEW_FRAMES.split(",")) {
            const t = Number(part.trim());
            if (Number.isFinite(t)) times.push(t);
        }
    }

    const grid = Number(process.env.ANIM_PREVIEW_GRID);
    if (Number.isFinite(grid) && grid > 0) {
        const count = Math.max(1, Math.floor(grid));
        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0 : (duration * i) / (count - 1);
            times.push(Math.min(t, Math.max(0, duration - 1e-6)));
        }
    }

    // de-duplicate while preserving order
    const seen = new Set();
    return times.filter((t) => {
        const key = t.toFixed(6);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildSummary() {
    const byType = {};
    for (const event of visual) byType[event.type] = (byType[event.type] ?? 0) + 1;

    return {
        duration: getTime(),
        visualEvents: visual.length,
        audioEvents: audio.length,
        byType,
        chapters: chapters.map((chapter) => ({name: chapter.name, start: chapter.start, end: chapter.end})),
    };
}

export async function renderVideo(CONFIG, callerPath, opts = {}) {
    validateConfig(CONFIG);

    const duration = getTime();

    // Fast inspection mode: validate + summarize without invoking FFmpeg.
    const dryRun = process.env.ANIM_DRY_RUN === "1" || process.env.ANIM_INSPECT === "1";
    if (dryRun) {
        try {
            validateTimeline(visual, 0, duration, duration);
        } catch (error) {
            console.error(error.message);
            return {visualPath: null, audioResult: null, duration};
        }
        console.log(JSON.stringify(buildSummary(), null, 2));
        return {visualPath: null, audioResult: null, duration};
    }

    // Preview-only modes: render one or more PNG frames, skip encoding.
    const previewTimes = parsePreviewTimes(duration);
    if (previewTimes.length > 0) {
        const outName = process.env.ANIM_PREVIEW_OUT;
        const paths = [];
        for (const t of previewTimes) {
            const out = outName || `preview-${t.toFixed(2)}.png`;
            paths.push(await previewFrame(CONFIG, callerPath, {t, out}));
        }
        return {visualPath: paths[0] ?? null, audioResult: null, duration, previewPaths: paths};
    }

    const visualPath = await record(CONFIG, visual, duration, callerPath, opts);

    let audioResult = null;
    if (opts.audio === true)
        audioResult = addSounds(audio, duration, callerPath, opts);

    return {visualPath, audioResult, duration};
}

export async function previewFrames(CONFIG, callerPath, opts = {}) {
    validateConfig(CONFIG);

    const duration = getTime();
    let times = Array.isArray(opts.times) ? opts.times.slice() : null;

    if (!times) {
        const count = Number.isFinite(opts.count) && opts.count > 0 ? Math.floor(opts.count) : 4;
        times = [];
        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0 : (duration * i) / (count - 1);
            times.push(Math.min(t, Math.max(0, duration - 1e-6)));
        }
    }

    const paths = [];
    for (const t of times) {
        if (typeof t !== "number" || !Number.isFinite(t) || t < 0) continue;
        const out = opts.out || `preview-${t.toFixed(2)}.png`;
        paths.push(await previewFrame(CONFIG, callerPath, {t, out}));
    }

    return {duration, paths};
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
