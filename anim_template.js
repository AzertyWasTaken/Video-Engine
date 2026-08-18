"use strict";
const filename = import.meta.url;
import path from "path";
import {fileURLToPath} from "url";
import {Engine as _} from "./Engine/engine.js";
import {record} from "../Anim/Engine/record.js";
import {addSounds} from "../Anim/Engine/addSounds.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 6
};

function textDelay(length) {
    return Math.floor(length / 12 + 2) / 2;
}

function onTextSegment(textLength) {
    _.playSound("Sounds/click.wav", 2);
    _.wait(Math.floor(textLength / 12 + 2) / 2);
}

// Defaults
_.setProp({
    fontSize: 80,
    maxWidth: 960,
    boldSymbol: "*",
    segmentSymbol: ";",
    escapeSymbol: "\\",
    colorSymbol: [
        {color: "#FF6060", symbol: "_"},
    ],
});

_.setBackgroundColor("#000080");

_.setAudioFile(path.dirname(fileURLToPath(import.meta.url)));

// Text with yellow flash effect
_.newText({text: "Text example with yellow flash effect.", posY: -300, flashDuration: 0.5});
_.wait(1);

// Text with a bold segment
_.newText({text: "Text with *a bold* segment.", posY: -60});
_.wait(1);

// Image
_.newImage({src: "Images/favicon.png", posX: 0, posY: 240, width: 256, height: 256});
_.wait(1);

// Clear and switch to a new id
_.clear(0);
_.setProp({id: 1});

// Segmented text with sound on each segment
_.newText({text: "This text is so long it; takes multiple lines and; has two segments.", onTextSegment});
_.wait(2);

_.clear(1);
_.setProp({id: 2, posY: 0});

_.newText({text: "Font color", fontColor: "#FFE040", autoSetPosY: true});
_.changeProp({posY: 40});
_.wait(1);

_.newText({text: "Font family", fontFamily: "Times New Roman", autoSetPosY: true});
_.changeProp({posY: 80});
_.wait(2);

_.newText({text: "Just a long _text_ block; for *testing* purposes.", autoSetPosY: true, segmentSymbol: null, maxWidth: 800, onTextSegment});
_.wait(3);

_.centerText(2, 0, 0);
_.clear(2);

// Text section with delays computed from text length automatically
_.setProp({id: 5});

_.newText({text: "Auto delay entry one", posY: -120, onTextSegment: (n) => {_.wait(textDelay(n))}, autoSetPosY: true});
_.newText({text: "Auto delay entry two with at least twice more text", posY: 120, onTextSegment: (n) => {_.wait(textDelay(n))}, autoSetPosY: true});

_.clear(5);
_.setProp({id: 3});

// Fade in / fade out text
_.newText({id: "text", text: "Fading in and out...", fadeIn: 1, fadeOut: 1, posY: -120});
_.wait(3);
_.setText("text", "Smooth crossfading text.", 1);
_.wait(2);

// Escape text
_.newText({text: "Use \\\\ to *escape*; special characters (like \\* or \\;).", posY: 120, onTextSegment});
_.wait(2);

_.clear(new Set([3, "text"]), 1);

// Circle visual
_.setProp({id: "shape"});
_.newCircle({id: "shape", posX: 0, posY: -120, diameter: 40});
_.wait(1);

// Line visual
_.newLine({id: "shape", posX: 0, posY: 120, lengthX: 480});
_.wait(1);
_.newLine({id: "shape", posX: 0, posY: 120, lengthY: 120});
_.wait(1);

_.clear("shape", 1);

// Balanced width
_.setProp({id: 6});
_.newText({text: "This multiline text serves to test balanced wrapping option.", posY: -160});
_.wait(1);

_.setProp({id: 6});
_.newText({text: "This multiline text serves to test balanced wrapping option.", posY: 160, balancedWidth: true});
_.wait(1);

// Render video and audio
const visual = _.getVisualTimeline();
const audio = _.getAudioTimeline();
const duration = _.getDuration();

console.log(`Duration: ${duration}s`);
await record(CONFIG, visual, duration, filename);
// addSounds(audio, duration, filename);
