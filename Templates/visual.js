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

// Image
_.newImage({src: "favicon", width: 320, height: 320, duration: 1});
_.wait(1);

// Shapes: one shared group id, self-clearing via duration
_.newRect({id: "shape", posX: 0, posY: 120, width: 800, height: 480, color: "#FF4040"});
_.newCircle({id: "shape", posY: -120, diameter: 160});
_.wait(1);
_.clear("shape");

_.newLine({id: "shape", posX: 0, posY: 120, scaleX: 480, scaleY: 0, duration: 1});
_.wait(1);

const path = _.newLine({id: "shape", posX: 0, posY: 0, positions: [{x: -160, y: -60}, {x: 0, y: 60}, {x: 160, y: -60}], duration: 2});
_.wait(1);
_.moveTo(path, {scaleY: 2});
_.wait(1);

// Closed shape: newShape strokes back to the first vertex, and an omitted axis defaults to 0
_.newShape({id: "shape", positions: [{x: -160, y: 140}, {x: 160, y: 140}, {y: -140}], strokeWidth: 12, posX: -400, duration: 1});
_.newShape({id: "shape", positions: [{x: -160, y: 140}, {x: 160, y: 140}, {x: 160, y: -140}, {x: 0, y: -140}], strokeWidth: 12, posX: 400, duration: 1});
_.wait(1);

// Strokes: strokeColor enables the stroke
_.newRect({id: "strokes", posX: -300, posY: 0, width: 600, height: 400, color: "#000040", strokeColor: "#FFE040", strokeWidth: 12});
_.newCircle({id: "strokes", posX: 300, posY: 0, diameter: 160, color: "#400000", strokeColor: "#FF4040", strokeWidth: 8});
_.newCircle({id: "strokes", posX: 600, posY: 0, diameter: 160, arc: 225, color: "#400000", strokeColor: "#FF4040", strokeWidth: 8});

// Partial arcs: clockwise degrees from 12 o'clock, then grown to a full circle via animate
const wedge = _.newCircle({id: "arc", posX: -300, posY: 0, diameter: 160, arc: 90, color: "#FFE040"});
_.animate(wedge, {arc: 270}, 1);
_.wait(2);
_.clear(["strokes", "arc"]);

// Rotation: clockwise degrees about each object's anchor, applied to every object type
_.newRect({id: "rotation", posX: -360, posY: 0, width: 300, height: 60, rotation: 30, color: "#60FF60"});
_.newLine({id: "rotation", posX: 0, positions: [{x: -120, y: 120}, {x: 120, y: -120}], scaleX: 1.2, scaleY: 0.4, rotation: -25, color: "#FFE040", lineWidth: 12});
_.newImage({id: "rotation", posX: 360, width: 200, height: 200, src: "favicon", rotation: 45});
_.newText({id: "rotation", text: "Rotated", posY: -240, rotation: 15});
_.wait(1);
_.clear("rotation");

// Layout order: the later rect would normally draw on top of the circle,
// but a lower layoutOrder keeps it behind
_.newCircle({id: "layer", posX: 0, posY: 0, diameter: 400, color: "#FF4040", duration: 1});
_.newRect({id: "layer", posX: 0, posY: 0, width: 600, height: 200, color: "#4080FF", layoutOrder: -1, duration: 1});
_.wait(1);
_.clear("layer");

const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: false});
console.log(`Duration: ${duration}s`);
