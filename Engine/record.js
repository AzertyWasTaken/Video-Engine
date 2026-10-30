"use strict";
import path from "path";
import {spawn} from "child_process";
import fs from "fs";
import {execFileSync} from "child_process";
import {render, setCanvas, getPixelSize, loadImageAsset} from "./render.js";
import {ffmpegPath, resolveCallerPath, assertFFmpegExists} from "./utils.js";
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

// Resolve chapter name and edit flag from opts, accepting several spellings.
// - chapter / chapterName: which chapter to render (clip only, existing behavior)
// - editChapter / replaceChapter / patchChapter / updateChapter: chapter name + edit implied
// - edit / replace / patch / merge / splice / update (boolean true): enable splice mode
// - edit as a string: doubles as the chapter name (implies edit)
function resolveEditOpts(opts) {
    const nameKeys = ["chapter", "chapterName"];
    const editNameKeys = ["editChapter", "replaceChapter", "patchChapter", "updateChapter"];
    const flagKeys = ["edit", "replace", "patch", "merge", "splice", "update"];

    let chapterName = undefined;
    let edit = false;

    for (const key of nameKeys) {
        const value = opts[key];
        if (value !== undefined && typeof value === "string" && value.length > 0) {
            chapterName = value;
            break;
        }
    }

    for (const key of editNameKeys) {
        const value = opts[key];
        if (value !== undefined && typeof value === "string" && value.length > 0) {
            chapterName = value;
            edit = true;
            break;
        }
    }

    // A string `edit` doubles as the chapter name (implies edit).
    if (chapterName === undefined && typeof opts.edit === "string" && opts.edit.length > 0) {
        chapterName = opts.edit;
        edit = true;
    }

    for (const key of flagKeys) {
        if (opts[key] === true) {
            edit = true;
            break;
        }
    }

    return {chapterName, edit};
}

// Splice a chapter clip into the full video, replacing [start, end).
// Writes to a temp file then atomically replaces the full output file.
// Video-only: input 0 = full video, input 1 = chapter clip.
function spliceVideo(fullFilePath, insertFilePath, start, end, duration, outputFile) {
    if (!fs.existsSync(fullFilePath)) {
        throw new Error(
            `Cannot edit chapter: full video not found at "${fullFilePath}" - ` +
            "run a full render first."
        );
    }

    const tempFile = outputFile + ".tmp.mp4";
    const chapterDuration = end - start;

    const vParts = [];
    const vLabels = [];
    let partIndex = 0;

    // Head: [0, start)
    if (start > 0) {
        vParts.push(`[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[v${partIndex}]`);
        vLabels.push(`[v${partIndex}]`);
        partIndex++;
    }

    // Middle: chapter clip [0, chapterDuration)
    vParts.push(`[1:v]trim=start=0:end=${chapterDuration},setpts=PTS-STARTPTS[v${partIndex}]`);
    vLabels.push(`[v${partIndex}]`);
    partIndex++;

    // Tail: [end, duration)
    if (end < duration) {
        vParts.push(`[0:v]trim=start=${end},setpts=PTS-STARTPTS[v${partIndex}]`);
        vLabels.push(`[v${partIndex}]`);
        partIndex++;
    }

    const vConcat = vLabels.join("") + `concat=n=${vLabels.length}:v=1:a=0[v]`;
    const filterComplex = vParts.join(";") + ";" + vConcat;

    const ffmpegArgs = [
        "-y",
        "-i", fullFilePath,
        "-i", insertFilePath,
        "-filter_complex", filterComplex,
        "-map", "[v]",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-threads", "0",
        tempFile
    ];

    execFileSync(ffmpegPath, ffmpegArgs, {stdio: "inherit"});
    fs.renameSync(tempFile, outputFile);
    return outputFile;
}

export async function record(CONFIG, visual, duration, callerPath, opts = {}) {
    const {WIDTH, HEIGHT, FPS, SCALE = 1} = CONFIG;

    assertFFmpegExists();

    if (typeof FPS !== "number" || !(FPS > 0))
        throw new Error(`Cannot record: CONFIG.FPS must be a positive number of frames per second, got ${FPS}.`);

    const resolvedPath = resolveCallerPath(callerPath);
    const videoDir = path.dirname(resolvedPath);
    let outputFile = path.join(videoDir, "visual.mp4");

    // Resolve chapter name and edit flag from opts.
    const {chapterName, edit} = resolveEditOpts(opts);

    if (edit && chapterName === undefined) {
        throw new Error(
            "edit mode requires a chapter name (e.g. {chapter: \"intro\", edit: true} " +
            "or {editChapter: \"intro\"})."
        );
    }

    // Optional chapter window: render only the frames between its boundaries.
    let start = 0;
    let end = duration;
    let chapter = null;
    if (chapterName !== undefined) {
        chapter = findChapter(chapterName, duration);
        if (chapter.end <= chapter.start)
            throw new Error(`Chapter ${JSON.stringify(chapter.name)} has no length (start ${chapter.start}, end ${chapter.end}).`);
        start = chapter.start;
        end = chapter.end;
        outputFile = path.join(videoDir, chapterFileName("visual_", chapter.name));
    }

    validateTimeline(visual, start, end, duration, chapterName !== undefined);

    const totalFrames = Math.ceil(FPS * (end - start));

    // SCALE raises the encoded resolution only; the events keep their logical
    // WIDTH x HEIGHT coordinates, so the framing is identical.
    setCanvas(WIDTH, HEIGHT, SCALE);
    const pixel = getPixelSize();

    const ffmpeg = getFFMPEG(CONFIG, pixel.WIDTH, pixel.HEIGHT, outputFile);

    await preloadImages(visual, start, end, videoDir);

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

    // Edit mode: splice the chapter clip back into the full video.
    if (edit && chapter !== null) {
        const fullVideoPath = path.join(videoDir, "visual.mp4");
        spliceVideo(fullVideoPath, outputFile, start, end, duration, fullVideoPath);
        console.log(`Chapter "${chapter.name}" edited into ${fullVideoPath}`);
    }

    return outputFile;
}

// Fail fast on timelines that would encode nothing, and warn about events
// the recorded window never shows or cuts off. Chapter windows clip on
// purpose, so only the length check applies to them.
export function validateTimeline(visual, start, end, duration, chapter) {
    if (!(end > start))
        throw new Error(
            "Cannot record: the timeline is 0 seconds long, so there are no frames to encode. " +
            "Add a final _.wait(sec), give the last event a `duration`, or call _.waitUntilIdle()."
        );

    if (chapter !== undefined) return;

    const epsilon = 1e-6;
    const unseen = [];
    const cut = [];

    for (const event of visual) {
        const eventEnd = event.end ?? event.tweenEnd ?? null;

        if (event.start >= duration - epsilon && (eventEnd === null || eventEnd > event.start + epsilon))
            unseen.push(describeTimelineEvent(event));
        else if (eventEnd !== null && eventEnd > duration + epsilon)
            cut.push(describeTimelineEvent(event));
    }

    if (unseen.length > 0)
        console.warn(
            `Warning: ${unseen.length} event(s) start at or after the video end (${duration}s) and are never visible:\n` +
            `  ${unseen.slice(0, 3).join("\n  ")}` +
            (unseen.length > 3 ? `\n  ...and ${unseen.length - 3} more.` : "") +
            "\nAdd a final _.wait(sec), give the last event a `duration`, or call _.waitUntilIdle()."
        );

    if (cut.length > 0)
        console.warn(
            `Warning: ${cut.length} event(s) end after the video end (${duration}s) and are cut off:\n` +
            `  ${cut.slice(0, 3).join("\n  ")}` +
            (cut.length > 3 ? `\n  ...and ${cut.length - 3} more.` : "") +
            "\nAdvance the cursor with _.wait(sec) or _.waitUntilIdle()."
        );
}

function describeTimelineEvent(event) {
    const idPart = event.ids === undefined ? "" : ` id ${JSON.stringify(event.ids)}`;
    const end = event.end ?? event.tweenEnd;
    return `${event.type}${idPart} (start ${event.start ?? 0}s${end === undefined ? "" : `, end ${end}s`})`;
}

// Preload image assets active in a [start, end) window.
// `src` is stored as written: a registered shorthand or a path relative to
// the script directory, so both resolve here. Images are cached under the
// original src so render.js can look them up with imageCache.get(obj.src).
export async function preloadImages(visual, start, end, videoDir) {
    const imageEvents = visual.filter(obj => obj.type === "image"
        && obj.start < end && (obj.end ?? Infinity) > start);

    for (const img of imageEvents) {
        if (!img.src) {
            console.warn(`Skipping image event with an empty src (id ${JSON.stringify(img.ids)}).`);
            continue;
        }

        const resolvedSrc = resolveAsset(img.src, videoDir);

        try {
            await loadImageAsset(resolvedSrc, img.src);
        } catch (e) {
            console.warn(`Failed to load image "${resolvedSrc}": ${e.message}`);
        }
    }
}
