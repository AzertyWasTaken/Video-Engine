"use strict";
import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const ffmpegPath = process.env.FFMPEG_PATH ?? "C:/ffmpeg/bin/ffmpeg.exe";
const scriptPath = fileURLToPath(import.meta.url);
const videosDir = path.dirname(path.dirname(scriptPath));

const videoFile = path.join(videosDir, "visual.mp4");
const outputFile = path.join(videosDir, "audio.mp4");

// If no valid audio events, just remux the video.
function remuxVideo() {
    const args = [
        "-y",
        "-i", videoFile,
        "-c:v", "copy",
        "-c:a", "aac",
        outputFile
    ];

    console.log("Processing (no audio events)...");
    execFileSync(ffmpegPath, args, {stdio: "inherit"});

    console.log("Completed");
    process.exit(0);
}

// Build filter_complex by creating one delayed stream per *valid* audio event.
// Use the same `events` ordering for both: (1) filter input indices and (2) `-i` inputs.
function buildFilter(events) {
    const filterParts = [];
    const mixInputs = [];

    for (let i = 0; i < events.length; i++) {
        const obj = events[i];
        const startMs = Math.max(0, Math.floor((obj.start ?? 0) * 1000));

        // Inputs: 0 = video, then 1..N = each audio file (same events index order)
        const inputIndex = i + 1;
        const outLabel = `a${i}`;

        // adelay expects a channel delay list; :all=1 applies same delay to all channels.
        filterParts.push(`[${inputIndex}:a]adelay=${startMs}:all=1,volume=${obj.volume ?? 1}[${outLabel}]`);
        mixInputs.push(`[${outLabel}]`);
    }

    return [filterParts, mixInputs];
}

// Always output an [audio] label (ffmpeg -map "[audio]" depends on it).
function getAmix(mixInputs, videoDurationExpr) {
    return videoDurationExpr
    ? `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0:normalize=0,atrim=0:${videoDurationExpr},asetpts=PTS-STARTPTS[audio]`
    : `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0:normalize=0[audio]`;
}

function getSoundPath(sound) {
    if (typeof sound !== "string") {
        throw new TypeError(
            `addSounds.js: Invalid sound value — expected a string, got ${typeof sound}. ` +
            `Value: ${JSON.stringify(sound)}`
        );
    }

    // If the caller provided an absolute or relative path, resolve relative to script dir.
    if (sound.startsWith("./") || sound.includes("/")) {
        const resolved = path.isAbsolute(sound) ? sound : path.join(videosDir, sound);
        if (!fs.existsSync(resolved)) {
            throw new Error(
                `addSounds.js: Missing audio file at resolved path: ${resolved}`
            );
        }
        return resolved;
    }

    // Bare filename (no directory separator): try videosDir.
    const directPath = path.join(videosDir, sound);
    if (fs.existsSync(directPath)) return directPath;

    throw new Error(
        `addSounds.js: Missing audio file "${sound}". ` +
        `Looked in: ${directPath}`
    );
}

function getArgs(events, filter) {
    const args = ["-y", "-i", videoFile];

    // Add one -i per audio event that has a sound path (same ordering as `events` above).
    for (const obj of events) {
        // Resolve relative to this script so execution cwd doesn't matter.
        const sound = obj.sound;
        const soundPath = getSoundPath(sound);

        if (!fs.existsSync(soundPath)) {
            const base = typeof sound === "string" ? path.basename(sound) : String(sound);
            const hint = `Hint: if you're referencing "${base}" try putting it under "${path.join(videosDir, "Sounds")}".`;

            throw new Error(
                `addSounds.js: Missing audio file for event: sound="${sound}".\n` +
                `Resolved path: ${soundPath}\n` +
                `${hint}`
            );
        }

        args.push("-i", soundPath);
    }

    args.push(
        "-filter_complex", filter,
        "-map", "0:v",
        "-map", "[audio]",
        "-c:v", "copy",
        "-c:a", "aac",
        outputFile
    );

    return args;
}

export function addSounds(audio, duration) {
    const events = Array.isArray(audio)
    ? audio.filter(e => e && e.sound) : [];

    if (events.length === 0) return remuxVideo();

    const [filterParts, mixInputs] = buildFilter(events);

    // Ensure the resulting audio stream length never exceeds the video duration.
    // Mix with "duration = longest" so all delayed events are heard.
    // If we know the duration, trim the final mix to the video duration via "atrim".
    const videoDurationSec = duration ?? null;
    const videoDurationExpr = videoDurationSec != null ? String(videoDurationSec) : null;

    let amix = getAmix(mixInputs, videoDurationExpr);

    const filter = [filterParts.join(";"), amix].filter(Boolean).join(";");
    const args = getArgs(events, filter);

    console.log("Processing...");

    try {
        execFileSync(ffmpegPath, args, {stdio: "inherit"});
        console.log("Completed");
    }
    catch (error) {
        console.error("Failed:", error.message || error);
        console.log("Args:", args);
        process.exit(error.status || 1);
    }
}
