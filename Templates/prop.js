"use strict";
import {Engine as _} from "../Engine/engine.js";
import {renderVideo} from "../Engine/pipeline.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12,
    SCALE: 360/1080
};

const text = _.newText({text: "Text"});
_.wait(1);
_.setProp({fontColor: "#FF4040"}, "text");
_.newText({id: text, text: "Text", posY: 200});
_.wait(1);
_.clear(text);

console.log("Font color:", _.getProp("fontColor", "text"));

_.withProp({text: {fontSize: 120}}, () => {
    const scoped = _.newText({text: "Top", posY: -200});
    _.wait(1);
    _.newText({id: scoped, text: "Bottom", posY: 200});
    _.wait(1);
    _.clear(scoped);
});

_.changeProp({posX: -200}, "text");
_.setProp({fontColor: "#FFFFFF"}, "text");

const bottom = _.newText({text: "Bottom"});
_.wait(1);
_.clear(bottom);

const circle = _.newCircle({id: "circle"});
_.wait(1);
_.changeProp({posX: -200}, "global");
_.newCircle({id: circle});
_.wait(1);
_.clear(circle);

_.repeat(3, (i) => {
    _.newText({id: "repeat", text: `Line #${i}`, posY: (i - 1) * 200, duration: 1});
})
_.wait(1);

const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: false});
console.log(`Duration: ${duration}s`);
