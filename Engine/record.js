"use strict";
import path from "path";
import os from "os";
import {spawn} from "child_process";
import fs from "fs";
import {execFileSync} from "child_process";
import {renderRawFrame, setCanvas, getPixelSize, loadImageAsset} from "./render.js";
import {ffmpegPath, resolveCallerPath, assertFFmpegExists} from "./utils.js";
import {resolveAsset} from "./assets.js";
import {findChapter, chapterFileName} from "./chapters.js";

// Parallel rendering splits the timeline across child processes of the same
// script. Below these limits a single process is faster than the startup cost.
const MIN_WORKER_WINDOW = 6;   // seconds of video
const MIN_FRAMES_PER_WORKER = 120;
const MAX_AUTO_WORKERS = 4;
// Set on a worker child to pick its slice: "index/count".
const SEGMENT_ENV = "ANIM_SEGMENT";

// `pixelWIDTH`/`pixelHEIGHT` are the encoded resolution: FFmpeg's -video_size
// and the frame readback both work in device pixels, not the logical design space.
// `CONFIG.PRESET` / `CONFIG.CRF` are optional; encoding is not the bottleneck,
// they exist for quality control.
function getFFMPEG(CONFIG, pixelWIDTH, pixelHEIGHT, outputFile) {
    const encode = ["-c:v", "libx264", "-preset", CONFIG.PRESET ?? "ultrafast"];

    if (CONFIG.CRF !== undefined) encode.push("-crf", String(CONFIG.CRF));
    encode.push("-pix_fmt", "yuv420p", "-threads", "0");

    return spawn(ffmpegPath, [
        "-y",
        "-f", "rawvideo",
        "-pixel_format", "rgba",
        "-video_size", `${pixelWIDTH}x${pixelHEIGHT}`,
        "-r", String(CONFIG.FPS),
        "-i", "-",
        ...encode,
        outputFile
    ]);
}

// Split a frame count into `count` contiguous chunks (the first `extra` chunks
// are one frame longer). Frame counts, not time windows: the parts must add up
// to exactly the frames a single-process render would produce.
export function splitFrames(totalFrames, count) {
    const base = Math.floor(totalFrames / count);
    const extra = totalFrames - base * count;
    return Array.from({length: count}, (_, index) => base + (index < extra ? 1 : 0));
}

// Parse the worker slice env var ("index/count"); null when not a worker.
export function parseSegmentEnv(value) {
    if (typeof value !== "string") return null;

    const match = /^(\d+)\/(\d+)$/.exec(value.trim());
    if (match === null) return null;

    const index = Number(match[1]);
    const count = Number(match[2]);
    if (count < 2 || index >= count) return null;

    return {index, count};
}

// The concat demuxer list for the rendered parts. Single quotes are escaped and
// paths use forward slashes so Windows paths parse the same way.
export function buildConcatList(files) {
    const lines = files.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
    return lines.join("\n") + "\n";
}

function partFileName(index, count) {
    return `visual_part${index + 1}of${count}.mp4`;
}

function availableCores() {
    return os.availableParallelism?.() ?? os.cpus().length;
}

// How many processes should render this window. `requested` is CONFIG.WORKERS /
// opts.workers ("auto" or undefined = pick from the core count); `disabled` is
// set for chapter/edit renders, where a single process keeps the splice simple.
export function resolveWorkers(requested, totalFrames, windowSeconds, disabled = false) {
    if (disabled) return 1;

    let count;
    if (requested === undefined || requested === null || requested === "auto") {
        count = Math.min(MAX_AUTO_WORKERS, Math.max(1, Math.floor(availableCores() / 4)));
    } else {
        if (!Number.isInteger(requested) || requested < 1)
            throw new Error(`Cannot record: workers must be a positive integer or "auto", got ${JSON.stringify(requested)}.`);
        count = Math.min(requested, Math.max(1, availableCores()));
    }

    if (windowSeconds < MIN_WORKER_WINDOW || totalFrames < MIN_FRAMES_PER_WORKER) return 1;

    return Math.max(1, Math.min(count, Math.floor(totalFrames / MIN_FRAMES_PER_WORKER)));
}

// ~1 line per encoded second: enough to watch a long render without flooding.
function createProgress(label, totalFrames, fps) {
    const step = Math.max(1, Math.round(fps));
    const startedAt = Date.now();

    return (done) => {
        if (done % step !== 0 && done !== totalFrames) return;

        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = elapsed > 0 ? done / elapsed : 0;
        const percent = totalFrames > 0 ? (done / totalFrames) * 100 : 100;
        console.log(`${label}frame ${done}/${totalFrames} (${percent.toFixed(0)}%) - ${rate.toFixed(1)} fps`);
    };
}

// Stream `frames` consecutive frames from `start` into one FFmpeg process.
async function renderFrames(CONFIG, visual, start, frames, outputFile, label = "") {
    const {FPS} = CONFIG;
    const pixel = getPixelSize();
    const ffmpeg = getFFMPEG(CONFIG, pixel.WIDTH, pixel.HEIGHT, outputFile);
    const progress = createProgress(label, frames, FPS);

    // Subscribed before the loop: a write failure must not leave the await hanging.
    const closed = new Promise((resolve, reject) => {
        ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
        });
        ffmpeg.on("error", reject);
    });
    ffmpeg.stdin.on("error", () => {});

    try {
        for (let f = 0; f < frames; f++) {
            const buffer = renderRawFrame(visual, start + f / FPS);

            if (!ffmpeg.stdin.write(buffer)) {
                await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
            }

            progress(f + 1);
        }

        ffmpeg.stdin.end();
    } catch (error) {
        ffmpeg.kill();
        throw error;
    }

    await closed;
}

// A worker child re-runs the calling script, so anything it prints while building
// the timeline (its own logs, the caller's progress messages) would repeat once
// per worker. Those channels are muted from module load - before the importing
// script's body runs - and record() unmutes just before the slice starts
// streaming, so the engine's own progress lines still reach the terminal.
// console.error stays open: real failures must survive the mute.
const MUTED_METHODS = ["log", "info", "debug", "trace", "warn", "dir", "table"];
const mutedConsole = new Map();

function muteScriptOutput() {
    for (const method of MUTED_METHODS) {
        const original = console[method];
        if (typeof original !== "function" || mutedConsole.has(method)) continue;

        mutedConsole.set(method, original);
        console[method] = () => {};
    }
}

function restoreScriptOutput() {
    for (const [method, original] of mutedConsole) console[method] = original;
    mutedConsole.clear();
}

// A worker child re-runs the calling script, so it must be a real path.
function canSpawnWorkers() {
    const scriptPath = process.argv[1];
    return typeof scriptPath === "string" && scriptPath.length > 0 && fs.existsSync(scriptPath);
}

// Spawn a child that renders one slice of the same timeline. Preview and
// dry-run switches are stripped so the child actually encodes.
function spawnWorker(index, count) {
    const env = {...process.env, [SEGMENT_ENV]: `${index}/${count}`};

    for (const key of ["ANIM_DRY_RUN", "ANIM_INSPECT", "ANIM_PREVIEW", "ANIM_PREVIEW_FRAMES", "ANIM_PREVIEW_GRID", "ANIM_PREVIEW_OUT"])
        delete env[key];

    return spawn(process.execPath, [process.argv[1]], {stdio: "inherit", env});
}

function waitForWorker(child, index) {
    return new Promise((resolve, reject) => {
        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Render worker ${index} exited with code ${code}.`));
        });
        child.on("error", reject);
    });
}

// Render `workers` frame slices concurrently (this process renders the first
// one) and join them with a stream-copy concat: identical encoder settings make
// the parts directly concatenable, so the join is a demux pass, not an encode.
async function renderParallel(CONFIG, visual, start, totalFrames, outputFile, videoDir, workers) {
    const parts = splitFrames(totalFrames, workers);
    const partFiles = parts.map((_, index) => path.join(videoDir, partFileName(index, workers)));
    const listFile = path.join(videoDir, "visual_parts.txt");
    const tempFile = outputFile + ".tmp.mp4";
    const children = [];

    console.log(`Rendering with ${workers} workers...`);

    try {
        for (let index = 1; index < workers; index++) children.push(spawnWorker(index, workers));

        // Each process preloads only the images its own slice shows.
        await preloadImages(visual, start, start + parts[0] / CONFIG.FPS, videoDir);

        await Promise.all([
            renderFrames(CONFIG, visual, start, parts[0], partFiles[0], `[part 1/${workers}] `),
            ...children.map((child, index) => waitForWorker(child, index + 1)),
        ]);

        fs.writeFileSync(listFile, buildConcatList(partFiles));
        execFileSync(ffmpegPath, [
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", listFile,
            "-c", "copy",
            tempFile,
        ], {stdio: "inherit"});

        fs.renameSync(tempFile, outputFile);
        console.log("Video complete");
        return outputFile;
    } catch (error) {
        for (const child of children) child.kill();
        throw error;
    } finally {
        for (const file of [...partFiles, listFile, tempFile]) fs.rmSync(file, {force: true});
    }
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

    // Worker child: render this slice, write the part file, and stop. Anything
    // after the render call (addSounds, uploads) belongs to the parent process.
    const segment = parseSegmentEnv(process.env[SEGMENT_ENV]);
    if (segment !== null) {
        const parts = splitFrames(totalFrames, segment.count);
        const firstFrame = parts.slice(0, segment.index).reduce((sum, size) => sum + size, 0);
        const partStart = start + firstFrame / FPS;
        const partFile = path.join(videoDir, partFileName(segment.index, segment.count));

        await preloadImages(visual, partStart, partStart + parts[segment.index] / FPS, videoDir);

        // Only this worker's progress lines belong in the log from here on.
        restoreScriptOutput();
        await renderFrames(CONFIG, visual, partStart, parts[segment.index], partFile,
            `[part ${segment.index + 1}/${segment.count}] `);
        process.exit(0);
    }

    // Chapter and edit renders stay single-process: the splice already re-reads
    // the full video, and short windows gain nothing from extra startup.
    const workers = canSpawnWorkers()
        ? resolveWorkers(opts.workers ?? CONFIG.WORKERS, totalFrames, end - start, chapterName !== undefined || edit)
        : 1;

    if (workers > 1) {
        await renderParallel(CONFIG, visual, start, totalFrames, outputFile, videoDir, workers);
    } else {
        await preloadImages(visual, start, end, videoDir);
        await renderFrames(CONFIG, visual, start, totalFrames, outputFile);
        console.log("Video complete");
    }

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

// Module-level: mute as early as possible, while the importing script is still
// building its timeline. record() restores it in the worker branch above.
if (parseSegmentEnv(process.env[SEGMENT_ENV]) !== null) muteScriptOutput();
