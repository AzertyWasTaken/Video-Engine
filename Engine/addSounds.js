"use strict";
import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";
import {ffmpegPath, resolveCallerPath, assertFFmpegExists} from "./utils.js";
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

// Resolve chapter name and edit flag from opts, accepting several spellings.
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

// Derive ffprobe path from ffmpeg path (same bin directory).
function getFfprobePath() {
    return path.join(path.dirname(ffmpegPath), "ffprobe.exe");
}

// Check if a file has an audio stream.
function hasAudioStream(filePath) {
    const ffprobe = getFfprobePath();
    try {
        const result = execFileSync(ffprobe, [
            "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            filePath
        ], {encoding: "utf8"});
        return result.trim().length > 0;
    } catch (e) {
        return false;
    }
}

// Ensure a file has an audio track: if it lacks one, mux in silence.
function ensureAudioTrack(filePath, durationSec) {
    if (hasAudioStream(filePath)) return filePath;

    const withAudio = filePath + ".audio.mp4";
    // Silence duration: chapter length + small margin so -shortest doesn't cut video.
    const silenceDur = durationSec + 0.5;

    const ffmpegArgs = [
        "-y",
        "-i", filePath,
        "-f", "lavfi",
        "-i", `anullsrc=duration=${silenceDur}`,
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        withAudio
    ];

    execFileSync(ffmpegPath, ffmpegArgs, {stdio: "inherit"});
    return withAudio;
}

// Splice a chapter clip (video + audio) into the full audio.mp4, replacing [start, end).
// Writes to a temp file then atomically replaces the full output file.
function spliceAudioVideo(fullFilePath, insertFilePath, start, end, duration, outputFile) {
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
    const aParts = [];
    const aLabels = [];
    let partIndex = 0;

    // Head: [0, start)
    if (start > 0) {
        vParts.push(`[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[v${partIndex}]`);
        vLabels.push(`[v${partIndex}]`);
        aParts.push(`[0:a]atrim=start=0:end=${start},asetpts=PTS-STARTPTS[a${partIndex}]`);
        aLabels.push(`[a${partIndex}]`);
        partIndex++;
    }

    // Middle: chapter clip [0, chapterDuration)
    vParts.push(`[1:v]trim=start=0:end=${chapterDuration},setpts=PTS-STARTPTS[v${partIndex}]`);
    vLabels.push(`[v${partIndex}]`);
    aParts.push(`[1:a]atrim=start=0:end=${chapterDuration},asetpts=PTS-STARTPTS[a${partIndex}]`);
    aLabels.push(`[a${partIndex}]`);
    partIndex++;

    // Tail: [end, duration)
    if (end < duration) {
        vParts.push(`[0:v]trim=start=${end},setpts=PTS-STARTPTS[v${partIndex}]`);
        vLabels.push(`[v${partIndex}]`);
        aParts.push(`[0:a]atrim=start=${end},asetpts=PTS-STARTPTS[a${partIndex}]`);
        aLabels.push(`[a${partIndex}]`);
        partIndex++;
    }

    const vConcat = vLabels.join("") + `concat=n=${vLabels.length}:v=1:a=0[v]`;
    const aConcat = aLabels.join("") + `concat=n=${aLabels.length}:v=0:a=1[a]`;
    const filterComplex = vParts.join(";") + ";" + aParts.join(";") + ";" + vConcat + ";" + aConcat;

    const ffmpegArgs = [
        "-y",
        "-i", fullFilePath,
        "-i", insertFilePath,
        "-filter_complex", filterComplex,
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-threads", "0",
        tempFile
    ];

    execFileSync(ffmpegPath, ffmpegArgs, {stdio: "inherit"});
    fs.renameSync(tempFile, outputFile);
    return outputFile;
}

export function addSounds(rawAudioEvents, videoDuration, callerFilePath, opts = {}) {
    const resolvedPath = resolveCallerPath(callerFilePath);
    const videoDirectory = path.dirname(resolvedPath);
    let videoFilePath = path.join(videoDirectory, "visual.mp4");
    let outputFilePath = path.join(videoDirectory, "audio.mp4");

    assertFFmpegExists();

    if (!fs.existsSync(videoFilePath))
        throw new Error(`addSounds(): video file not found at "${videoFilePath}" - call record() (or renderVideo()) first.`);

    // Resolve chapter name and edit flag from opts.
    const {chapterName, edit} = resolveEditOpts(opts);

    if (edit && chapterName === undefined) {
        throw new Error(
            "edit mode requires a chapter name (e.g. {chapter: \"intro\", edit: true} " +
            "or {editChapter: \"intro\"})."
        );
    }

    let start = 0;
    let end = videoDuration;
    let chapter = null;
    if (chapterName !== undefined) {
        chapter = findChapter(chapterName, videoDuration);
        start = chapter.start;
        end = chapter.end;
        videoFilePath = path.join(videoDirectory, chapterFileName("visual_", chapter.name));
        outputFilePath = path.join(videoDirectory, chapterFileName("audio_", chapter.name));
    }

    let audioEvents = Array.isArray(rawAudioEvents)
    ? rawAudioEvents.filter(event => event && event.sound) : [];

    // Chapter clips keep sounds that start inside the window, shifted to it.
    if (chapterName !== undefined)
        audioEvents = audioEvents.filter(event => (event.start ?? 0) >= start && (event.start ?? 0) < end);

    // Produce the chapter clip (with or without audio).
    if (audioEvents.length === 0) {
        remuxVideoWithoutAudio(videoFilePath, outputFilePath);
    } else {
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
    }

    // Edit mode: splice the chapter clip back into the full audio.mp4.
    if (edit && chapter !== null) {
        const fullAudioPath = path.join(videoDirectory, "audio.mp4");
        const insertPath = ensureAudioTrack(outputFilePath, end - start);
        spliceAudioVideo(fullAudioPath, insertPath, start, end, videoDuration, fullAudioPath);
        console.log(`Chapter "${chapter.name}" edited into ${fullAudioPath}`);
    }

    return {videoFilePath, outputFilePath, audioEvents: audioEvents.length};
}
