"use strict";
import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import {audio, duration} from "./anim.js";
import {log} from "console";

const ffmpegPath = "C:/ffmpeg/bin/ffmpeg.exe";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const videoFile = path.join(scriptDir, "anim.mp4");
const outputFile = path.join(scriptDir, "video.mp4");

const volume = 1;
const events = Array.isArray(audio) ? audio.filter(e => e && e.sound) : [];

// If no valid audio events, just remux the video.
if (events.length === 0) {
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
const filterParts = [];
const mixInputs = [];

for (let i = 0; i < events.length; i++) {
    const obj = events[i];
    const startMs = Math.max(0, Math.floor((obj.start ?? 0) * 1000));

    // Inputs: 0 = video, then 1..N = each audio file (same events index order)
    const inputIndex = i + 1;
    const outLabel = `a${i}`;

    // adelay expects a channel delay list; :all=1 applies same delay to all channels.
    filterParts.push(`[${inputIndex}:a]adelay=${startMs}:all=1,volume=${obj.volume ?? volume}[${outLabel}]`);
    mixInputs.push(`[${outLabel}]`);
}

// Ensure the resulting audio stream length never exceeds the video duration.
// We achieve this by:
// 1) mixing with "duration=first" (length = first input, i.e. the delayed streams start)
// 2) if we know the duration, trimming the final mix to the video duration via "atrim".
const videoDurationSec = duration ?? null;
const videoDurationExpr = videoDurationSec != null ? String(videoDurationSec) : null;

// Always output an [audio] label (ffmpeg -map "[audio]" depends on it).
let amix = `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0[audio]`;

if (videoDurationExpr) {
    amix = `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0,atrim=0:${videoDurationExpr},asetpts=PTS-STARTPTS[audio]`;
}

const filter = [filterParts.join(";"), amix].filter(Boolean).join(";");
const args = ["-y", "-i", videoFile];

// Add one -i per audio event that has a sound path (same ordering as `events` above).
for (const obj of events) {
    // Resolve relative to this script so execution cwd doesn't matter.
    let soundPath;
    if (typeof obj.sound === "string" && (obj.sound.startsWith("./") || obj.sound.includes("/"))) {
        // If the producer already gave a path, keep it (but still allow relative to script dir).
        soundPath = path.isAbsolute(obj.sound)
            ? obj.sound
            : path.join(scriptDir, obj.sound);
    } else {
        soundPath = path.join(scriptDir, obj.sound);
    }

    if (!fs.existsSync(soundPath)) {
        const attempted = soundPath;
        const base = typeof obj.sound === "string" ? path.basename(obj.sound) : String(obj.sound);
        const hint = `Hint: if you're referencing "${base}" try putting it under "${path.join(scriptDir, "Sounds")}".`;
        throw new Error(
            `addSounds.js: Missing audio file for event: sound="${obj.sound}".\n` +
            `Resolved path: ${attempted}\n` +
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
