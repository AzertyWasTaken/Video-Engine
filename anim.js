"use strict";
import {log} from "console";
import {Engine as _} from "./Engine/engine.js";

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 2;

function text(prop, offset = 80, delay = Math.floor(prop.text.length / 12 + 2) / 2) {
    // _.sound("", 1);
    _.newText(prop);
    _.changeProp("posY", offset);
    _.wait(delay);
}

let currId = 0;

function endScreen() {
    _.centerText(currId);
    _.wait(1);
}

function nextScreen() {
    _.clear(currId);
    currId++;
    _.setProp({id: currId, posY: 0});
}

// _.sound("", 0.5);

_.setProp({fontSize: 80, richText: true, effect: true});
_.setBackgroundColor("#101020");

text({text: "Text example."}, 0);
text({text: "Rich text with a *bold part*."}, 80);

endScreen();
nextScreen();

text({text: "Some text here. Make this sentence long enough so it takes multiple lines."}, 80);

endScreen();

export const visual = _.getVisualTimeline();
export const audio = _.getAudioTimeline();
export const duration = _.getDuration();
