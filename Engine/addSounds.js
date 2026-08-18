"use strict";
import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const ffmpegExecutablePath = process.env.FFMPEG_PATH ?? "C:/ffmpeg/bin/ffmpeg.exe";

function resolveCallerPath(callerPath) {
    if (!callerPath) return process.cwd();
    // callerPath may be an import.meta.url (e.g. "file:///d:/VSC/Anim/anim.js")
    // or an already-resolved file path. Handle both.
    if (callerPath.startsWith("file:")) {
        return fileURLToPath(callerPath);
    }
    return callerPath;
}

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
    execFileSync(ffmpegExecutablePath, ffmpegArgs, {stdio: "inherit"});

    console.log("Completed");
    process.exit(0);
}

// Build filter_complex by creating one delayed stream per *valid* audio event.
// Use the same `audioEvents` ordering for both: (1) filter input indices and (2) `-i` inputs.
function buildAudioFilterComplex(audioEvents) {
    const filterPartStrings = [];
    const mixInputLabels = [];

    for (let i = 0; i < audioEvents.length; i++) {
        const audioEvent = audioEvents[i];
        const startDelayMs = Math.max(0, Math.floor((audioEvent.start ?? 0) * 1000));

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

function resolveSoundFilePath(soundName) {
    if (typeof soundName !== "string") {
        throw new TypeError(
            `addSounds.js: Invalid sound value — expected a string, got ${typeof soundName}. ` +
            `Value: ${JSON.stringify(soundName)}`
        );
    }

    return soundName;
}

function appendAudioInputArgs(ffmpegArgs, audioEvents, filterComplex, videoDirectory) {
    // Add one -i per audio event that has a sound path (same ordering as `audioEvents` above).
    for (const audioEvent of audioEvents) {
        // Resolve relative to this script so execution cwd doesn't matter.
        const soundName = audioEvent.sound;
        const resolvedSoundPath = resolveSoundFilePath(soundName, videoDirectory);

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

export function addSounds(rawAudioEvents, videoDuration, callerFilePath) {
    const resolvedPath = resolveCallerPath(callerFilePath);
    const videoDirectory = path.dirname(resolvedPath);
    const videoFilePath = path.join(videoDirectory, "visual.mp4");
    const outputFilePath = path.join(videoDirectory, "audio.mp4");

    const audioEvents = Array.isArray(rawAudioEvents)
    ? rawAudioEvents.filter(event => event && event.sound) : [];

    if (audioEvents.length === 0)
        return remuxVideoWithoutAudio(videoFilePath, outputFilePath);

    const [filterPartStrings, mixInputLabels] = buildAudioFilterComplex(audioEvents);

    const amixFilter = buildAmixFilter(mixInputLabels, videoDuration);
    const filterComplex = [filterPartStrings.join(";"), amixFilter].filter(Boolean).join(";");

    const ffmpegArgs = ["-y", "-i", videoFilePath];
    appendAudioInputArgs(ffmpegArgs, audioEvents, filterComplex, videoDirectory);
    appendOutputArgs(ffmpegArgs, filterComplex, outputFilePath);

    console.log("Processing...");

    try {
        execFileSync(ffmpegExecutablePath, ffmpegArgs, {stdio: "inherit"});
        console.log("Completed");
    }
    catch (error) {
        console.error("Failed:", error.message || error);
        console.log("Args:", ffmpegArgs);
        process.exit(error.status || 1);
    }
}
