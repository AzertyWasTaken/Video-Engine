"use strict";
import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";
import {ffmpegPath, resolveCallerPath} from "./utils.js";
import {resolveAsset} from "./assets.js";
import {findChapter, chapterFileName} from "./chapters.js";

// If no valid audio events, just remux the video.
function remuxVideoWithoutAudio(videoFilePath, outputFilePath) {
    const ffmpegArgs = [
        "-y",
        "-i", videoFilePath,
        "-c:v", "copy",
        "-c:a", "aac",
        outputFilePath
    ];

    console.log("Processing (no audio events)...");
    execFileSync(ffmpegPath, ffmpegArgs, {stdio: "inherit"});

    console.log("Completed");
    return {videoFilePath, outputFilePath, audioEvents: 0};
}

// Build filter_complex by creating one delayed stream per *valid* audio event.
// Use the same `audioEvents` ordering for both: (1) filter input indices and (2) `-i` inputs.
function buildAudioFilterComplex(audioEvents, startOffset) {
    const filterPartStrings = [];
    const mixInputLabels = [];

    for (let i = 0; i < audioEvents.length; i++) {
        const audioEvent = audioEvents[i];
        const startDelayMs = Math.max(0, Math.floor(((audioEvent.start ?? 0) - startOffset) * 1000));

        // Inputs: 0 = video, then 1..N = each audio file (same audioEvents index order)
        const audioInputIndex = i + 1;
        const outputLabel = `a${i}`;

        // adelay expects a channel delay list; :all=1 applies same delay to all channels.
        filterPartStrings.push(`[${audioInputIndex}:a]adelay=${startDelayMs}:all=1,volume=${audioEvent.volume ?? 1}[${outputLabel}]`);
        mixInputLabels.push(`[${outputLabel}]`);
    }

    return [filterPartStrings, mixInputLabels];
}

// Always output an [audio] label (ffmpeg -map "[audio]" depends on it).
function buildAmixFilter(mixInputLabels, videoDuration) {
    const durationString = (videoDuration !== null && !Number.isNaN(videoDuration))
    ? String(videoDuration) : null;

    // Mix with "duration = longest" so all delayed events are heard.
    const mixInputs = mixInputLabels.join("");
    const inputCount = mixInputLabels.length;
    const amixBase = `${mixInputs}amix=inputs=${inputCount}:duration=longest:dropout_transition=0:normalize=0`;

    // If we know the duration, trim the final mix to the video duration via "atrim".
    if (durationString)
        return `${amixBase},atrim=0:${durationString},asetpts=PTS-STARTPTS[audio]`;

    return `${amixBase}[audio]`;
}

// `sound` is stored as written: a registered shorthand, an absolute path, or a
// path relative to the calling script, so all three resolve here.
function resolveSoundFilePath(soundName, baseDir) {
    if (typeof soundName !== "string") {
        throw new TypeError(
            `addSounds.js: Invalid sound value - expected a string, got ${typeof soundName}. ` +
            `Value: ${JSON.stringify(soundName)}`
        );
    }

    return resolveAsset(soundName, baseDir);
}

function appendAudioInputArgs(ffmpegArgs, audioEvents, baseDir) {
    // Add one -i per audio event that has a sound path (same ordering as `audioEvents` above).
    for (const audioEvent of audioEvents) {
        // Resolve shorthands and relative paths against this script so execution cwd doesn't matter.
        const soundName = audioEvent.sound;
        const resolvedSoundPath = resolveSoundFilePath(soundName, baseDir);

        if (!fs.existsSync(resolvedSoundPath)) {
            throw new Error(
                `addSounds.js: Missing audio file for event: sound="${soundName}".\n` +
                `Resolved path: ${resolvedSoundPath}`
            );
        }

        ffmpegArgs.push("-i", resolvedSoundPath);
    }
}

function appendOutputArgs(ffmpegArgs, filterComplex, outputFilePath) {
    ffmpegArgs.push(
        "-filter_complex", filterComplex,
        "-map", "0:v",
        "-map", "[audio]",
        "-c:v", "copy",
        "-c:a", "aac",
        outputFilePath
    );
}

export function addSounds(rawAudioEvents, videoDuration, callerFilePath, opts = {}) {
    const resolvedPath = resolveCallerPath(callerFilePath);
    const videoDirectory = path.dirname(resolvedPath);
    let videoFilePath = path.join(videoDirectory, "visual.mp4");
    let outputFilePath = path.join(videoDirectory, "audio.mp4");

    let start = 0;
    let end = videoDuration;
    if (opts.chapter !== undefined) {
        const chapter = findChapter(opts.chapter, videoDuration);
        start = chapter.start;
        end = chapter.end;
        videoFilePath = path.join(videoDirectory, chapterFileName("visual_", chapter.name));
        outputFilePath = path.join(videoDirectory, chapterFileName("audio_", chapter.name));
    }

    let audioEvents = Array.isArray(rawAudioEvents)
    ? rawAudioEvents.filter(event => event && event.sound) : [];

    // Chapter clips keep sounds that start inside the window, shifted to it.
    if (opts.chapter !== undefined)
        audioEvents = audioEvents.filter(event => (event.start ?? 0) >= start && (event.start ?? 0) < end);

    if (audioEvents.length === 0)
        return remuxVideoWithoutAudio(videoFilePath, outputFilePath);

    const [filterPartStrings, mixInputLabels] = buildAudioFilterComplex(audioEvents, start);

    const amixFilter = buildAmixFilter(mixInputLabels, end - start);
    const filterComplex = [filterPartStrings.join(";"), amixFilter].filter(Boolean).join(";");

    const ffmpegArgs = ["-y", "-i", videoFilePath];
    appendAudioInputArgs(ffmpegArgs, audioEvents, videoDirectory);
    appendOutputArgs(ffmpegArgs, filterComplex, outputFilePath);

    console.log("Processing...");

    try {
        execFileSync(ffmpegPath, ffmpegArgs, {stdio: "inherit"});
        console.log("Completed");
    }
    catch (error) {
        console.error("Failed:", error.message || error);
        console.log("Args:", ffmpegArgs);
        throw error;
    }
    return {videoFilePath, outputFilePath, audioEvents: audioEvents.length};
}
