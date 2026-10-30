"use strict";
import {Engine as _} from "../Engine/engine.js";
import {renderVideo} from "../Engine/pipeline.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12,
    SCALE: 360/1080
};

const intro = _.scene("intro", () => {
    const text = _.newText({text: "Chapter One"});
    _.wait(1);
    _.clear(text);
}, {pad: 1});

const outro = _.chapter("outro");
_.newText({text: "Chapter Two"});
_.wait(1);

console.log("Intro:", intro);
console.log("Outro:", outro);
console.log(_.getChapters());

const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: false});
console.log(`Duration: ${duration}s`);

// Re-render a single chapter and splice it into the full video without re-encoding the rest:
const {duration: edited} = await renderVideo(CONFIG, import.meta.url, {audio: false, chapter: "intro", edit: true});
console.log(`Edited chapter into full video, total duration: ${edited}s`);
