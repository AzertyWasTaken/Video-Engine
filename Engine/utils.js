"use strict";
import {fileURLToPath} from "url";
import fs from "fs";

export const ffmpegPath = process.env.FFMPEG_PATH ?? "C:/ffmpeg/bin/ffmpeg.exe";

// Fail fast with an actionable message instead of a raw ENOENT from FFmpeg.
// Bare command names (no path separators) resolve via PATH, so only
// path-like values can be checked directly.
export function assertFFmpegExists() {
    if (!/[\\/]/.test(ffmpegPath) && !/^[A-Za-z]:/.test(ffmpegPath)) return;

    if (!fs.existsSync(ffmpegPath))
        throw new Error(`FFmpeg not found at "${ffmpegPath}". Set the FFMPEG_PATH environment variable to your ffmpeg executable - see Docs/recording.md.`);
}

// callerPath may be an import.meta.url (e.g. "file:///d:/VSC/Anim/anim.js")
// or an already-resolved file path. Handle both.
export function resolveCallerPath(callerPath) {
    if (!callerPath) return process.cwd();
    if (callerPath.startsWith("file:")) return fileURLToPath(callerPath);
    return callerPath;
}
