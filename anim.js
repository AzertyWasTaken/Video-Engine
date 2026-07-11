"use strict";
import {log} from "console";
import {Engine as _} from "./engine.js";

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 2;

function text(prop, offset = 80, delay = Math.floor(prop.text.length / 12 + 2) / 2) {
    _.sound("Sounds/click.wav", 1);
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

_.sound("Musics/background-music_ikoliks-aj.mp3", 0.5);

_.setProp({fontSize: 80, richText: true, effect: true});
_.setBackgroundColor("#101020");

text({text: "A number is *rational* if it can be expressed as the *division* of two *integers*,"}, 0);
text({text: "where the denominator is *not zero*."}, 80);
text({text: "Some rational numbers are not *integers*:"}, 0);
text({text: "they are called *fractions*."}, 80);
text({text: "Fraction are written in the form of a/b."}, 80);
text({text: "Is 3/2 is a fraction?"}, 80, 3);
text({text: "Yes, because 3 *cannot* be split into 2 parts."}, 80);

endScreen();
nextScreen();

text({text: "A fraction is *proper* if the *numerator* is strictly *less than* the *denominator*."}, 80);
text({text: "Other fractions are said to be *improper*."}, 80);
text({text: "Proper fractions are always less than 1."}, 80);
text({text: "Is the fraction 3/2 proper?"}, 80, 3);
text({text: "No, because 3 is greater than 2."}, 80);

endScreen();

export const visual = _.getVisualTimeline();
export const audio = _.getAudioTimeline();
export const duration = _.getDuration();
