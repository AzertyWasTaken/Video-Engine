"use strict";
import path from "path";
import {spawn} from "child_process";
import {render, setCanvas, getPixelSize, loadImageAsset} from "./render.js";
import {ffmpegPath, resolveCallerPath} from "./utils.js";
import {resolveAsset} from "./assets.js";
import {findChapter, chapterFileName} from "./chapters.js";

// `pixelWIDTH`/`pixelHEIGHT` are the encoded resolution: FFmpeg's -video_size
// and the frame readback both work in device pixels, not the logical design space.
function getFFMPEG(CONFIG, pixelWIDTH, pixelHEIGHT, outputFile) {
    return spawn(ffmpegPath, [
        "-y",
        "-f", "rawvideo",
        "-pixel_format", "rgba",
        "-video_size", `${pixelWIDTH}x${pixelHEIGHT}`,
        "-r", String(CONFIG.FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-threads", "0",
        outputFile
    ]);
}

export async function record(CONFIG, visual, duration, callerPath, opts = {}) {
    const {WIDTH, HEIGHT, FPS, SCALE = 1} = CONFIG;

    const resolvedPath = resolveCallerPath(callerPath);
    const videoDir = path.dirname(resolvedPath);
    let outputFile = path.join(videoDir, "visual.mp4");

    // Optional chapter window: render only the frames between its boundaries.
    let start = 0;
    let end = duration;
    if (opts.chapter !== undefined) {
        const chapter = findChapter(opts.chapter, duration);
        if (chapter.end <= chapter.start)
            throw new Error(`Chapter ${JSON.stringify(chapter.name)} has no length (start ${chapter.start}, end ${chapter.end}).`);
        start = chapter.start;
        end = chapter.end;
        outputFile = path.join(videoDir, chapterFileName("visual_", chapter.name));
    }

    const totalFrames = Math.ceil(FPS * (end - start));

    // SCALE raises the encoded resolution only; the events keep their logical
    // WIDTH x HEIGHT coordinates, so the framing is identical.
    setCanvas(WIDTH, HEIGHT, SCALE);
    const pixel = getPixelSize();

    const ffmpeg = getFFMPEG(CONFIG, pixel.WIDTH, pixel.HEIGHT, outputFile);

    // Preload image assets active in the recorded window.
    // `src` is stored as written: a registered shorthand or a path relative to
    // the script directory, so both resolve here.
    const imageEvents = visual.filter(obj => obj.type === "image"
        && obj.start < end && (obj.end ?? Infinity) > start);

    for (const img of imageEvents) {
        if (!img.src) {
            console.warn(`Skipping image event with an empty src (id ${JSON.stringify(img.ids)}).`);
            continue;
        }

        const resolvedSrc = resolveAsset(img.src, videoDir);

        try {
            // Cache under the original src so render.js can look it up
            // with imageCache.get(obj.src).
            await loadImageAsset(resolvedSrc, img.src);
        } catch (e) {
            console.warn(`Failed to load image "${resolvedSrc}": ${e.message}`);
        }
    }

    for (let f = 0; f < totalFrames; f++) {
        const t = start + f / FPS;

        const canvas = render(visual, t);
        const frame = canvas.getContext("2d").getImageData(0, 0, pixel.WIDTH, pixel.HEIGHT);
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
