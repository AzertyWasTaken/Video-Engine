"use strict";
import {Engine as _} from "./Engine/engine.js";
import {renderVideo} from "./Engine/pipeline.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12,
    SCALE: 720/1080
};

function textDelay(length) {
    return Math.floor(length / 10 + 1) / 2;
}

function onTextSegment(textLength) {
    _.playSound("click", 2);
    _.wait(Math.floor(textLength / 12 + 2) / 2);
}

// Sounds and images use the short names registered here
_.setAssets({
    click: "./Sounds/click.wav",
    favicon: "./Images/favicon.png"
});

_.setBackgroundColor("#000080");

// Defaults
_.setProp({
    fontSize: 80,
    maxWidth: 960,
    segmentSymbol: ";",
    escapeSymbol: "\\",
    styleSymbol: [
        {openSymbol: "*", fontWeight: 700},
        {openSymbol: "_", color: "#FF4040"},
        {openSymbol: "{y ", closeSymbol: "}", color: "#FFE040"},
        {openSymbol: "<<", closeSymbol: ">>", color: "#60FF60"},
    ],
});

function testGlobal() {
    // Wait
    const wait = _.newText({text: "Wait"});
    _.wait(1);
    _.clear(wait);

    // Duration
    const duration = _.newText({text: "Duration", duration: 1});
    _.waitUntilIdle();
    _.clear(duration);

    // Hold
    const hold = _.newText({text: "Hold", hold: 1});
    _.clear(hold);

    // Multiple ids
    _.newCircle({id: ["shape", "white"], posX: -200, diameter: 80});
    _.newCircle({id: ["shape", "red"], posX: 200, diameter: 80});
    _.wait(1);
    _.recolor("red", "#FF4040");
    _.wait(1);
    _.playSound("click", 2);
    _.animate("shape", {posY: 160}, 1);
    _.wait(1);
    _.clear("shape");

    // Multi-type scoped defaults: text and circle change and restore together
    _.withProp({text: {fontSize: 60}, circle: {color: "#FFE040", diameter: 60}}, () => {
        _.newText({id: "multi", text: "Multi-type scoped defaults.", posY: -160});
        _.newCircle({id: "multi", posY: 160, duration: 1});
        _.wait(1);
        _.clear("multi");
    });
}

function testText() {
    // `duration` ends the event automatically (no clear needed)
    _.newText({text: "Text example with yellow flash effect.", flashDuration: 0.5, duration: 1});
    _.wait(1);

    // Creators return the group id (auto-assigned when omitted)
    const boldText = _.newText({text: "Text with *a bold* segment."});
    _.wait(1);
    _.clear(boldText);

    // Scoped defaults: withProp saves and restores automatically
    _.withProp({id: "segments"}, () => {
        _.newText({text: "This text is so long it; takes multiple lines and; has two segments.", onTextSegment, hold: 2});
        _.clear("segments");
    });

    _.withProp({id: "colors", autoSetPosY: true}, () => {
        _.newText({text: "Font color.", fontColor: "#FFE040"});
        _.changeProp({posY: 80});
        _.wait(1);

        _.newText({text: "Font family.", fontFamily: "Times New Roman"});
        _.changeProp({posY: 160});
        _.wait(1);

        _.newText({text: "Just a long text block; for *testing* purposes.", segmentSymbol: null, maxWidth: 800, onTextSegment, hold: 1});
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
        _.newText({text: "This multiline text serves to test balanced wrapping option.", posY: 160, balancedWidth: true});
        _.wait(1);
        _.clear("width");
    });

    // Hard line breaks with \n (style state carries across breaks)
    const breaks = _.newText({text: "Hard break *demo*:\nfirst line,\n*second styled* line.", hold: 1});
    _.clear(breaks);

    // Opening and closing symbols are chosen per entry; both can span several characters
    const style = _.newText({text: "Placeholder _red_ text", hold: 1});
    _.setText(style, "Placeholder {y yellow} text", {hold: 1});
    _.setText(style, "Placeholder <<green>> text", {hold: 1});
    _.clear(style);

    _.newText({text: "Automatic size text", maxWidth: 960, autoSize: true, fontSizeStep: 20, hold: 1});
}

function testVisual() {
    // Image
    _.newImage({src: "favicon", width: 256, height: 256, duration: 1});
    _.wait(1);

    // Shapes: one shared group id, self-clearing via duration
    _.newRect({id: "shape", posX: 0, posY: 120, width: 800, height: 480, color: "#FF4040"});
    _.newCircle({id: "shape", posY: -120, diameter: 80});
    _.wait(1);

    _.clear("shape");

    _.newLine({id: "shape", posX: 0, posY: 120, scaleX: 480, scaleY: 0, duration: 1});
    _.wait(1);

    const path = _.newLine({id: "shape", posX: 0, posY: 0, positions: [{x: -160, y: -60}, {x: 0, y: 60}, {x: 160, y: -60}], duration: 2});
    _.animate(path, {scaleY: 1}, 1);
    _.wait(2);

    // Closed shape: loop strokes back to the first vertex, and an omitted axis defaults to 0
    _.newLine({id: "shape", positions: [{x: -160, y: 120}, {x: 160, y: 120}, {y: -140}], loop: true, lineWidth: 12, duration: 2});
    _.wait(2);

    // Strokes: strokeColor enables the stroke
    _.newRect({id: "strokes", posX: -200, posY: 0, width: 320, height: 240, color: "#000040", strokeColor: "#FFE040", strokeWidth: 8});
    _.newCircle({id: "strokes", posX: 200, posY: 0, diameter: 80, color: "#400000", strokeColor: "#FF4040", strokeWidth: 6});
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

    _.moveTo(title, {posX: 0, posY: 0}, 1, {easing: "back", direction: "out"});
    _.wait(1);

    _.animate(title, {posX: -300}, 1, {easing: "cubic", direction: "inOut"});
    _.wait(1);

    _.moveTo(title, {fontSize: 100}, 1, {easing: "quad", direction: "inOut"});
    _.wait(1);

    _.recolor(title, "#FF4040", 1);
    _.wait(1);

    _.moveTo(title, {posX: 0, posY: -200}, 1, {easing: "quad", direction: "inOut"});
    _.wait(1);

    _.clear(title, 1);

    // Resize: the whole layout scales, so segments and line spacing follow
    const resizable = _.newText({text: "Resize; this *text*\nand this; line", posY: 200});
    _.wait(0.5);
    _.moveTo(resizable, {fontSize: 40}, 1, {easing: "quad", direction: "inOut"});
    _.wait(1);
    _.moveTo(resizable, {fontSize: 80}, 1, {easing: "quad", direction: "inOut"});
    _.wait(1);
    _.clear(resizable, 1);

    // Opacity is tweenable too: relative dimming, then an absolute target
    const ghost = _.newText({text: "Tweened opacity", posY: 260});
    _.wait(0.5);
    _.animate(ghost, {opacity: -0.5}, 1);
    _.wait(1);
    _.moveTo(ghost, {opacity: 1}, 1, {easing: "quad", direction: "inOut"});
    _.wait(1);
    _.clear(ghost, 1);
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

// testGlobal();
// testText();
testVisual();
// testAnim();
// testScenes();

// Render video and audio
// Or render one chapter only (writes visual_<name>.mp4 / audio_<name>.mp4):
// renderVideo(CONFIG, import.meta.url, {audio: true, chapter: "intro"});
const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: true});
console.log(`Duration: ${duration}s`);
