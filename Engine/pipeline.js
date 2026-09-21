"use strict";
import {getTime, audio, visual} from "./state.js";
import {record} from "./record.js";
import {addSounds} from "./addSounds.js";
import {ffmpegPath, resolveCallerPath} from "./utils.js";

export function getTimeline() {
    return {visual, audio, duration: getTime()};
}

export async function renderVideo(CONFIG, callerPath, opts = {}) {
    if (!CONFIG || typeof CONFIG !== "object")
        throw new Error("renderVideo() expects CONFIG {WIDTH, HEIGHT, FPS}.");

    const {WIDTH, HEIGHT, FPS} = CONFIG;
    for (const [key, value] of [["WIDTH", WIDTH], ["HEIGHT", HEIGHT], ["FPS", FPS]]) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
            throw new Error(`renderVideo() expects positive finite CONFIG.${key}, got ${value}.`);
    }

    const duration = getTime();
    const visualPath = await record(CONFIG, visual, duration, callerPath);

    let audioResult = null;
    if (opts.audio === true)
        audioResult = addSounds(audio, duration, callerPath);

    return {visualPath, audioResult, duration};
}

export {ffmpegPath, resolveCallerPath};
