"use strict";
import path from "path";
import {fileURLToPath} from "url";
import {Engine as _} from "./Engine/engine.js";
import {renderVideo} from "./Engine/pipeline.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12
};

function textDelay(length) {
    return Math.floor(length / 10 + 1) / 2;
}

function onTextSegment(textLength) {
    _.playSound("Sounds/click.wav", 2);
    _.wait(Math.floor(textLength / 12 + 2) / 2);
}

// Sounds resolve relative to this script
_.setAudioFile(path.dirname(fileURLToPath(import.meta.url)));

_.setBackgroundColor("#000080");

// Defaults
_.setProp({
    fontSize: 80,
    maxWidth: 960,
    segmentSymbol: ";",
    escapeSymbol: "\\",
    styleSymbol: [
        {symbol: "*", fontWeight: 700},
        {symbol: "_", color: "#FF6060"},
    ],
});

function testText() {
    // `duration` ends the event automatically (no clear needed)
    _.newText({text: "Text example with yellow flash effect.", flashDuration: 0.5, duration: 1});
    _.waitUntilIdle();

    // Creators return the group id (auto-assigned when omitted)
    const boldText = _.newText({text: "Text with *a bold* segment."});
    _.wait(1);
    _.clear(boldText);

    // Scoped defaults: withProp saves and restores automatically
    _.withProp({id: "segments"}, () => {
        _.newText({text: "This text is so long it; takes multiple lines and; has two segments.", onTextSegment});
        _.wait(2);
        _.clear("segments");
    });

    _.withProp({id: "colors", autoSetPosY: true}, () => {
        _.newText({text: "Font color.", fontColor: "#FFE040"});
        _.changeProp({posY: 80});
        _.wait(1);

        _.newText({text: "Font family.", fontFamily: "Times New Roman"});
        _.changeProp({posY: 160});
        _.wait(1);

        _.newText({text: "Just a long _text_ block; for *testing* purposes.", segmentSymbol: null, maxWidth: 800, onTextSegment});
        _.wait(2);

        _.centerText("colors", 0, 0);
        _.clear("colors");
    });

    // Text section with delays computed from text length automatically
    _.withProp({id: "auto", onTextSegment: (n) => {_.wait(textDelay(n))}}, () => {
        _.newText({text: "Auto delay entry one.", posY: -120, onTextSegment, autoSetPosY: true});
        _.newText({text: "Auto delay entry two with at least twice more text.", posY: 120, onTextSegment, autoSetPosY: true});
        _.wait(1);
        _.clear("auto");
    });

    // Escape text
    const escape = _.newText({text: "Use \\\\ to *escape*; special characters (like \\* or \\;).", onTextSegment});
    _.wait(1);
    _.clear(escape);

    // Balanced width
    _.withProp({id: "width"}, () => {
        _.newText({text: "This multiline text serves to test balanced wrapping option.", posY: -160});
        _.wait(1);

        _.newText({text: "This multiline text serves to test balanced wrapping option.", posY: 160, balancedWidth: true});
        _.wait(1);

        _.clear("width");
    });

    // Hard line breaks with \n (style state carries across breaks)
    const breaks = _.newText({text: "Hard break *demo*:\nfirst line,\n*second styled* line."});
    _.wait(1);
    _.clear(breaks);
}

function testVisual() {
    // Image
    _.newImage({src: "Images/favicon.png", width: 256, height: 256, duration: 1});
    _.wait(1);

    // Shapes: one shared group id, self-clearing via duration
    _.newRect({id: "shape", posX: 0, posY: 0, width: 800, height: 480, color: "#FF6060", duration: 1});
    _.wait(1);

    _.newCircle({id: "shape", posX: 0, posY: -120, diameter: 40, duration: 1});
    _.wait(1);

    _.newLine({id: "shape", posX: 0, posY: 120, lengthX: 480, duration: 1});
    _.wait(1);

    _.newLine({id: "shape", posX: 0, posY: 120, lengthY: 120, duration: 1});
    _.wait(1);

    // Strokes: strokeColor enables the stroke
    _.newRect({id: "strokes", posX: -140, posY: 0, width: 240, height: 160, color: "#202040", strokeColor: "#FFE040", strokeWidth: 8, duration: 1});
    _.newCircle({id: "strokes", posX: 140, posY: 0, diameter: 90, color: "#402060", strokeColor: "#FF6060", strokeWidth: 6, duration: 1});
    _.wait(1);
}

function testAnim() {
    // Temporary background: fades in over navy and fades back out after 2s
    _.setBackgroundColor("#400080", {fadeIn: 0.5, fadeOut: 0.5, duration: 2});

    _.withProp({maxWidth: Infinity}, () => {
        _.newText({text: "Fading in and out…", fadeIn: 1, fadeOut: 1, duration: 3});
        _.waitUntilIdle();

        // Fade in / fade out text with a crossfade via setText
        const fading = _.newText({text: "Another fading in and out…", fadeIn: 1, fadeOut: 1});
        _.wait(3);
        _.setText(fading, "Smooth crossfading text.", {fade: 1, hold: 2});
        _.clear(fading);
    });

    // Animation: tweens chain continuously and never overlap
    const title = _.newText({text: "Animating text", posY: -200});
    _.wait(0.5);

    _.moveTo(title, {posX: 0, posY: 0}, 1, {easing: "backOut"});
    _.wait(1);

    _.animate(title, {posX: -300}, 1, {easing: "cubicInOut"});
    _.wait(1);

    _.moveTo(title, {fontSize: 100}, 1, {easing: "quadInOut"});
    _.wait(1);

    _.recolor(title, "#FF6060", 1);
    _.wait(1);

    _.moveTo(title, {posX: 0, posY: -200}, 1, {easing: "quadInOut"});
    _.wait(1);

    _.clear(title, 1);

    // Multi-type scoped defaults: text and circle change and restore together
    _.withProp({text: {fontSize: 60}, circle: {color: "#FFE040", diameter: 60}}, () => {
        _.newText({text: "Multi-type scoped defaults.", posY: -160});
        _.newCircle({posY: 160, duration: 1});
        _.wait(1);
    });
}

// Scenes: named chapters with recorded boundaries (optional leading pad)
function testScenes() {
    const intro = _.scene("intro", () => {
        _.newText({text: "Chapter one.", duration: 1});
        _.waitUntilIdle();
    }, {pad: 1});

    // chapter() marks boundaries in inline code
    _.chapter("outro");
    _.newText({text: "Chapter two.", duration: 1});
    _.waitUntilIdle();

    console.log(_.getChapters());
    return intro;
}

// seek() jumps the time cursor directly
// _.seek(_.getDuration() + 1);

// testText();
// testVisual();
// testAnim();
testScenes();

// Render video and audio
const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: true});
console.log(`Duration: ${duration}s`);
