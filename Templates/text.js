"use strict";
import {Engine as _} from "../Engine/engine.js";
import {renderVideo} from "../Engine/pipeline.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12,
    SCALE: 360/1080
};

// Defaults
_.setProp({
    styleSymbol: [
        {openSymbol: "*", fontWeight: 700},
        {openSymbol: "/", italic: true},
        {openSymbol: "{f ", closeSymbol: "}", fontFamily: "Times New Roman"},
        {openSymbol: "_", color: "#FF4040"},
        {openSymbol: "{y ", closeSymbol: "}", color: "#FFE040"},
        {openSymbol: "{s ", closeSymbol: "}", fontSize: 1.5},
        {openSymbol: "{u ", closeSymbol: "}", offsetY: -0.25},
        {openSymbol: "{^ ", closeSymbol: "}", fontSize: 0.75, offsetY: -0.25},
        {openSymbol: "<<", closeSymbol: ">>", color: "#60FF60"},
    ],
}, "text");

_.newText({text: "Placeholder Text", duration: 1});
_.wait(1);
_.newText({text: "Rotated Text", rotation: 15, duration: 1});
_.wait(1);

// `duration` ends the event automatically (no clear needed)
_.newText({text: "Text example with flash effect.", flashDuration: 0.5, duration: 1});
_.wait(1);

_.withProp({text: {duration: 1}}, () => {
    _.newText({text: "Font Color", posY: -300, fontColor: "#FFE040"});
    _.newText({text: "Font Family", posY: -100, fontFamily: "Times New Roman"});
    _.newText({text: "Font Weight", posY: 100, fontWeight: 700});
    _.newText({text: "Font Italic", posY: 300, italic: true});
    _.wait(1);
});

_.newText({text: "Just a long text block with multiple lines and a maximum width.", segmentSymbol: null, maxWidth: 800, duration: 1});
_.wait(1);

// Hard line breaks with \n (style state carries across breaks)
_.newText({text: "Hard break demo:\nfirst line,\nsecond line.", duration: 1});
_.wait(1);

// Creators return the group id (auto-assigned when omitted)
_.newText({text: "Style colors: _red_ {y yellow} <<green>>", posY: -300, duration: 1});
_.newText({text: "Style font: *bold* /italic/ {f times new roman}", posY: 0, duration: 1});
_.newText({text: "Style font size: {s larger}; raised: {u higher}.", posY: 300, duration: 1});
_.wait(1);

_.newText({id: "exponent", text: "base{^ exponent} = exponentiation", duration: 1});
_.wait(0.5);
_.animate("exponent", {fontSize: 40});
_.wait(0.5);

_.withProp({text: {id: "colors", autoSetPosY: true}}, () => {
    _.newText({text: "Text 1"});
    _.newText({text: "Text 2"});
    _.newText({text: "Text 3"});
    _.clear("colors");
});

// Escape text
_.newText({text: "Use \\\\ to escape special characters like \\* or \\;.", duration: 1, escapeSymbol: "\\"});
_.wait(1);

// Balanced width
_.withProp({text: {maxWidth: 960}}, () => {
    _.newText({text: "This multiline text serves to test balanced wrapping option.", posY: -200, duration: 1});
    _.newText({text: "This multiline text serves to test balanced wrapping option.", posY: 200, balancedWidth: true, duration: 1});
    _.wait(1);
});

_.newText({text: "Automatic Size Text", posY: -200, maxWidth: 960, autoSize: true, fontSizeStep: 20, duration: 1});
_.newText({text: "Automatic Size Text", posY: 200, maxWidth: 600, autoSize: true, fontSizeStep: 20, duration: 1});
_.wait(1);

_.newTexts([{text: "Line #1\nwith multiple lines"}, {text: "Line #2", posX: -200}, {text: "Line #3"}], {duration: 1, textGap: 40, posY: -200});
_.wait(1);

const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: false});
console.log(`Duration: ${duration}s`);
