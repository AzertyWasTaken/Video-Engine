"use strict";
import {getTime, advanceTime, chapters} from "./state.js";
import {validateDuration} from "./validate.js";

// Close the previous chapter at the current cursor time (if still open).
function closePrevious() {
    const prev = chapters.at(-1);
    if (prev && prev.end === null) prev.end = getTime();
}

// Mark a chapter boundary at the current time.
export function addChapter(name) {
    if (typeof name !== "string" || name.length === 0)
        throw new Error(`chapter() expects a non-empty name string, got ${JSON.stringify(name)}.`);

    if (chapters.some((chapter) => chapter.name === name))
        throw new Error(`chapter(): duplicate chapter name ${JSON.stringify(name)}.`);

    closePrevious();

    const chapter = {name, start: getTime(), end: null};
    chapters.push(chapter);
    return chapter;
}

// Mark a chapter, run fn(), then close the chapter at the cursor.
export function runScene(name, fn, opts = {}) {
    if (typeof fn !== "function")
        throw new Error("scene() expects a callback function.");
    if (typeof opts !== "object" || opts === null)
        throw new Error("scene() expects an options object.");

    const {pad = 0} = opts;
    validateDuration(pad);

    if (pad > 0) advanceTime(pad);

    const chapter = addChapter(name);
    try {
        fn();
    } finally {
        chapter.end = getTime();
    }
    return chapter;
}

export function getChapters() {return chapters;}

// Format seconds as mm:ss (or h:mm:ss past one hour) for chapter timestamps.
export function formatTimestamp(sec) {
    const total = Math.max(0, Math.floor(sec));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    const tail = `${String(minutes).padStart(hours > 0 ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`;
    return hours > 0 ? `${hours}:${tail}` : tail;
}

// Video-description style chapter list (e.g. "00:00 Intro").
// An open last chapter resolves against the current time cursor.
export function chapterTimestamps() {
    const now = getTime();
    return chapters.map((chapter) =>
        `${formatTimestamp(chapter.start)} ${chapter.name} - ${formatTimestamp(chapter.end ?? now)}`
    );
}

// Find a chapter by name; an open end (null) resolves to the total duration.
export function findChapter(name, duration) {
    const chapter = chapters.find((chapter) => chapter.name === name);
    if (!chapter) {
        const names = chapters.map((chapter) => JSON.stringify(chapter.name)).join(", ") || "none";
        throw new Error(`Unknown chapter ${JSON.stringify(name)}. Known chapters: ${names}.`);
    }

    return {name: chapter.name, start: chapter.start, end: chapter.end ?? duration};
}

// Filesystem-safe output file name for a chapter (names may contain spaces or ":").
export function chapterFileName(prefix, name) {
    const safe = name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
    return `${prefix}${safe || "chapter"}.mp4`;
}
