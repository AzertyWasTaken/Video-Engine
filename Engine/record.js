"use strict";
import path from "path";
import {fileURLToPath} from "url";
import {spawn} from "child_process";
import {render, setCanvas} from "./render.js";

const ffmpegPath = "C:/ffmpeg/bin/ffmpeg.exe";
const scriptPath = fileURLToPath(import.meta.url);
const videosDir = path.dirname(path.dirname(scriptPath));

const outputFile = path.join(videosDir, "visual.mp4");

function getFFMPEG(CONFIG) {
    return spawn(ffmpegPath, [
        "-y",
        "-f", "rawvideo",
        "-pixel_format", "rgba", 
        "-video_size", `${CONFIG.WIDTH}x${CONFIG.HEIGHT}`,
        "-r", String(CONFIG.FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-threads", "0",
        outputFile
    ])
}

export async function record(CONFIG, visual, duration) {
    const totalFrames = CONFIG.FPS * duration;

    const ffmpeg = getFFMPEG(CONFIG);
    setCanvas(CONFIG.WIDTH, CONFIG.HEIGHT);

    for (let f = 0; f < totalFrames; f++) {
        const t = f / CONFIG.FPS;

        const frame = render(visual, t);
        const buffer = Buffer.from(frame.data.buffer);

        if (!ffmpeg.stdin.write(buffer)) {
            await new Promise(resolve => ffmpeg.stdin.once("drain", resolve));
        }
    }

    ffmpeg.stdin.end();

    await new Promise((resolve, reject) => {
        ffmpeg.on("close", (code) => {
            if (code === 0) {
                console.log("Video complete");
                resolve();
            } else {
                reject(new Error(`ffmpeg exited with code ${code}`));
            }
        });
        ffmpeg.on("error", reject);
    });
}
