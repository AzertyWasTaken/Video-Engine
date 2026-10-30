"use strict";
import {Engine as _} from "../Engine/engine.js";
import {renderVideo} from "../Engine/pipeline.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12,
    SCALE: 360/1080
};

// Sounds and images use the short names registered here
_.setAssets({
    click: "./Sounds/click.wav"
});

_.wait(1);
_.playSound("click", 1);
_.wait(1);
_.playSound("click", 0.5);
_.wait(0.5);
_.playSound("click", 0.25);
_.wait(1);

const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: true});
console.log(`Duration: ${duration}s`);
