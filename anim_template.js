"use strict";
import {Engine as _} from "./Engine/engine.js";
import {renderVideo} from "./Engine/pipeline.js";

// Starter animation script. Copy this file, build a timeline with `_.` calls,
// then encode it with one renderVideo() call.
// Optional CONFIG knobs: SCALE (resolution), WORKERS (parallel processes,
// "auto" by default), PRESET / CRF (x264 quality) - see Docs/recording.md.

const CONFIG = {WIDTH: 1920, HEIGHT: 1080, FPS: 30}; // add SCALE: 2 to record 3840x2160

_.setBackgroundColor("#000080");

const title = _.newText({text: "Hello, world!", duration: 2});
_.wait(2);

// Tweens keep the duration you pass (0 = instant), so pass the seconds.
_.moveTo(title, {posY: -200}, 1, {easing: "quad", direction: "out"});
_.wait(1);

// One call writes visual.mp4 (always) and audio.mp4 (when audio: true).
const {duration} = await renderVideo(CONFIG, import.meta.url, {audio: true});
console.log(`Duration: ${duration}s`);
