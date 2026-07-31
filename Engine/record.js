"use strict";
import path from "path";
import {fileURLToPath} from "url";
import {spawn} from "child_process";
import {render, setCanvas, loadImageAsset} from "./render.js";

const ffmpegPath = process.env.FFMPEG_PATH ?? "C:/ffmpeg/bin/ffmpeg.exe";

function resolveCallerPath(callerPath) {
    if (!callerPath) return process.cwd();
    // callerPath may be an import.meta.url (e.g. "file:///d:/VSC/Anim/anim.js")
    // or an already-resolved file path. Handle both.
    if (callerPath.startsWith("file:")) {
        return fileURLToPath(callerPath);
    }
    return callerPath;
}

function getFFMPEG(CONFIG, outputFile) {
    return spawn(ffmpegPath, [
        "-y",
        "-f", "rawvideo",
        "-pixel_format", "rgba",
        "-video_size", `${CONFIG.WIDTH}x${CONFIG.HEIGHT}`,
        "-r", String(CONFIG.FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-threads", "0",
        outputFile
    ]);
}

export async function record(CONFIG, visual, duration, callerPath) {
    const resolvedPath = resolveCallerPath(callerPath);
    const videoDir = path.dirname(resolvedPath);
    const outputFile = path.join(videoDir, "visual.mp4");

    const totalFrames = Math.ceil(CONFIG.FPS * duration);

    const ffmpeg = getFFMPEG(CONFIG, outputFile);
    setCanvas(CONFIG.WIDTH, CONFIG.HEIGHT);

    // Preload any image assets referenced in the visual timeline.
    // Resolve relative paths against the script directory (like sounds).
    const imageEvents = visual.filter(obj => obj.type === "image");

    for (const img of imageEvents) {
        const resolvedSrc = path.isAbsolute(img.src)
        ? img.src : path.join(videoDir, img.src);

        try {
            // Cache under the original src so render.js can look it up
            // with imageCache.get(obj.src).
            await loadImageAsset(resolvedSrc, img.src);
        } catch (e) {
            console.warn(`Failed to load image "${resolvedSrc}": ${e.message}`);
        }
    }

    for (let f = 0; f < totalFrames; f++) {
        const t = f / CONFIG.FPS;

        const frame = render(visual, t);
        const buffer = Buffer.from(frame.data.buffer);

        if (!ffmpeg.stdin.write(buffer)) {
            await new Promise(resolve => ffmpeg.stdin.once("drain", resolve));
        }
    }

    ffmpeg.stdin.end();

    await new Promise((resolve, reject) => {
        ffmpeg.on("close", (code) => {
            if (code === 0) {
                console.log("Video complete");
                resolve();
            } else {
                reject(new Error(`ffmpeg exited with code ${code}`));
            }
        });
        ffmpeg.on("error", reject);
    });

    return outputFile;
}
