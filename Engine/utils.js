"use strict";
import {fileURLToPath} from "url";

export const ffmpegPath = process.env.FFMPEG_PATH ?? "C:/ffmpeg/bin/ffmpeg.exe";

// callerPath may be an import.meta.url (e.g. "file:///d:/VSC/Anim/anim.js")
// or an already-resolved file path. Handle both.
export function resolveCallerPath(callerPath) {
    if (!callerPath) return process.cwd();
    if (callerPath.startsWith("file:")) return fileURLToPath(callerPath);
    return callerPath;
}
