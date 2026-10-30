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
    favicon: "./Images/favicon.png"
});

// Defaults
_.setProp({
    fontSize: 80,
    segmentSymbol: ";",
    escapeSymbol: "\\",
    styleSymbol: [
        {openSymbol: "*", fontWeight: 700},
        {openSymbol: "_", color: "#FF4040"},
        {openSymbol: "/", italic: true},
    ],
}, "text");

// Temporary background: fades in over navy and fades back out after 2s
_.setBackgroundColor("#400080", {fadeIn: 0.5, fadeOut: 0.5, duration: 2});

_.newText({text: "Fading in and out…", fadeIn: 1, fadeOut: 1, duration: 3});
_.waitUntilIdle();

// Fade in / fade out text with a crossfade via setText
const fading = _.newText({text: "Another fading in and out…", fadeIn: 1, fadeOut: 1});
_.wait(3);
_.setText(fading, "Smooth crossfading text.", {fade: 1, hold: 2});
_.clear(fading);

// Animation: tweens chain continuously and never overlap
const title = _.newText({text: "Animating text", posY: -200});
_.wait(0.5);

_.moveTo(title, {posX: 0, posY: 0}, 1, {easing: "back", direction: "out"});
_.wait(1);

_.animate(title, {posX: -300}, 1, {easing: "cubic", direction: "inOut"});
_.wait(1);

_.moveTo(title, {fontSize: 100}, 1, {easing: "quad", direction: "inOut"});
_.wait(1);

_.recolor(title, "#FF4040", 1);
_.wait(1);

_.animate(title, {fontSize: 40}, 0.5, {easing: "quad", direction: "out", reverse: true, reverseDelay: 0.5});
_.wait(2);

_.moveTo(title, {posX: 0, posY: -200}, 1, {easing: "quad", direction: "inOut"});
_.wait(1);
_.clear(title);

// Resize: the whole layout scales, so segments and line spacing follow
const resizable = _.newText({text: "Resize; this *text*\nand this; line", posY: 200});
_.wait(0.5);
_.moveTo(resizable.id, {fontSize: 40}, 1, {easing: "quad", direction: "inOut"});
_.wait(1);
_.moveTo(resizable.id, {fontSize: 80}, 1, {easing: "quad", direction: "inOut"});
_.wait(1);
_.clear(resizable.id);

// Opacity is tweenable too: relative dimming, then an absolute target
const ghost = _.newText({text: "Tweened opacity", posY: 260});
_.wait(0.5);
_.animate(ghost, {opacity: -0.5}, 1);
_.wait(1);
_.moveTo(ghost, {opacity: 1}, 1, {easing: "quad", direction: "inOut"});
_.wait(1);
_.clear(ghost);

// Rotation is tweenable as well: a relative spin, then an absolute angle
const spinner = _.newRect({width: 300, height: 300, posY: 240, strokeColor: "#FFE040", strokeWidth: 10, color: "#000040"});
_.wait(0.5);
_.animate(spinner, {rotation: 180}, 1, {easing: "quad", direction: "inOut"});
_.wait(1);
_.moveTo(spinner, {rotation: 360}, 1, {easing: "quad", direction: "inOut"});
_.wait(1);
_.clear(spinner);

// Orbit: the group sweeps an arc around a pivot and spins with it
_.newCircle({id: "orbit", posX: -300, diameter: 80, color: "#FFE040"});
_.newCircle({id: "orbit", posX: 300, diameter: 80, color: "#FF6060"});
_.wait(0.5);
_.rotateAround("orbit", {x: 0, y: 0}, 360, 2, {easing: "sin", direction: "inOut"});
_.wait(2);
_.clear("orbit");

const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: false});
console.log(`Duration: ${duration}s`);
