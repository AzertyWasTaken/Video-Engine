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
