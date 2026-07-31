"use strict";
const filename = import.meta.url;
import {Engine as _} from "./Engine/engine.js";
import {record} from "../Anim/Engine/record.js";
import {addSounds} from "../Anim/Engine/addSounds.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12
};

// Defaults
_.setProp({fontSize: 80, maxWidth: 960, richText: true});
_.setBackgroundColor("#402040");

// Text with yellow flash effect
_.newText({text: "Text example with effect.", posY: -300, effect: true});
_.wait(1);

// Rich text with bold segments
_.newText({text: "Rich text *with bold* segments.", posY: -60});
_.wait(1);

// Image
_.newImage(0, "Images/favicon.png", 0, 240, 256, 256);
_.wait(1);

// Clear and switch to a new id
_.clear(0);
_.setProp({id: 1});

// Segmented text with sound on each segment
_.newText({
    text: "This text is so long it; takes multiple lines and; has two segments.",
    segmentedText: true,
    onTextSegment: (textLength) => {
        _.sound("Sounds/click.wav", 2);
        _.wait(Math.floor(textLength / 12 + 2) / 2);
    }
});
_.wait(2);

_.clear(1);
_.setProp({id: 2});

// Text section with shared properties
_.newTextSection({alignY: 1, autoSetPosY: true}, [
    [{text: "Font color", fontColor: "#FFE040"}, 40, 1],
    [{text: "Font family", fontFamily: "Times New Roman"}, 80],
    [{text: "Just a long text block; for *testing* purposes.", maxWidth: 800}, 80, 3],
]);

// Fade in / fade out text
_.setProp({id: 3, fadeIn: 1, fadeOut: 1});
_.newText({text: "Fading in and out...", posX: -400, posY: -320});
_.wait(3);

// Circle visual
_.setProp({id: 4});
_.newCircle(4, -600, 0);
_.wait(1);

_.clear(0);

// Render video and audio
const visual = _.getVisualTimeline();
const audio = _.getAudioTimeline();
const duration = _.getDuration();

console.log(`Duration: ${duration}s`);
await record(CONFIG, visual, duration, filename);
addSounds(audio, duration, filename);
