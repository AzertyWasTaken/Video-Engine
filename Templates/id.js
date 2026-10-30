"use strict";
import {Engine as _} from "../Engine/engine.js";
import {renderVideo} from "../Engine/pipeline.js";

const CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 12,
    SCALE: 360/1080
};

_.setBackgroundColor("#000000");

_.newCircle({id: "singleId"});
_.wait(1);
_.recolor("singleId", "#FF4040");
_.wait(1);
_.clear("singleId");

_.newCircle({id: ["mulIds", "mulIds.0"], posX: -200});
_.newCircle({id: ["mulIds", "mulIds.1"], posX: 200});
_.wait(1);
_.recolor("mulIds.0", "#FF4040");
_.wait(1);
_.recolor("mulIds", "#FFE040");
_.wait(1);
_.clear("mulIds");

const auto = _.newText({text: "This text has no segment."});
_.wait(1);
console.log("Automatic id:", auto);
_.clear(auto);

const singleSeg = _.newText({id: "singleSeg", text: "This text has no segment."});
_.wait(1);
console.log("Single segment:", singleSeg);
_.clear(singleSeg);

const mulSegs = _.newText({id: "mulSegs", text: "This text is long.; It has\nmultiple lines; and two segments.", segmentSymbol: ";"});
_.wait(1);
_.recolor(mulSegs.seg[1], "#FF4040");
_.wait(1);
console.log("Multiple segments:", mulSegs);
_.clear(mulSegs);

const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: false});
console.log(`Duration: ${duration}s`);
