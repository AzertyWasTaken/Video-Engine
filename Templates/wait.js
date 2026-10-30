"use strict";
import {Engine as _} from "../Engine/engine.js";
import {renderVideo} from "../Engine/pipeline.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12,
    SCALE: 360/1080
};

const wait = _.newText({text: "Wait"});
_.wait(1);
_.clear(wait);

const fixed = _.newText({text: "Duration", duration: 1});
_.waitUntilIdle();
_.clear(fixed);

const hold = _.newText({text: "Hold", hold: 1});
_.clear(hold);

_.seek(0.5);
const seek = _.newText({text: "Seek", posY: 200});
_.wait(1);
_.clear(seek);

_.wait(2);

const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: false});
console.log(`Duration: ${duration}s`);
