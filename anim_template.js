"use strict";
const filename = import.meta.filename;
import {Engine as _} from "./Engine/engine.js";
import {record} from "./Engine/record.js";
import {addSounds} from "./Engine/addSounds.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 30
};

_.setProp({fontSize: 80, fontColor: "#FFE040", maxWidth: 960});
_.setBackgroundColor("#402040");

_.newText({text: "Text example.", posY: -200});
_.wait(2);

_.newText({text: "Rich text *with a bold* segment.", richText: true, posY: 200});
_.wait(2);

_.clear(0);

_.newText({text: "Some text here. Make this sentence long enough so it takes multiple lines and; has a segment.", segmentedText: true});
_.sound("Sounds/click.wav", 1);
_.wait(4);

const visual = _.getVisualTimeline();
const audio = _.getAudioTimeline();
const duration = _.getDuration();

console.log(duration);
await record(CONFIG, visual, duration, filename);
addSounds(audio, duration, filename);
