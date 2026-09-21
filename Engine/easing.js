"use strict";

// Back-overshoot constants.
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;

// Elastic period constants.
const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;

// Easing functions map progress t (0..1) to an eased value in 0..1.
export const Easing = {
    linear: (t) => t,

    quadIn: (t) => t**2,
    quadOut: (t) => 1 - (1 - t)**2,
    quadInOut: (t) => (t < 0.5 ? 2 * t**2 : 1 - 2 * (1 - t)**2),

    cubicIn: (t) => t**3,
    cubicOut: (t) => 1 - (1 - t)**3,
    cubicInOut: (t) => (t < 0.5 ? 4 * t**3 : 1 - (-2 * t + 2)**3 / 2),

    sinIn: (t) => 1 - Math.cos(t * Math.PI / 2),
    sinOut: (t) => Math.sin(t * Math.PI / 2),
    sinInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

    expoIn: (t) => (t === 0 ? 0 : 2**(10 * (t - 1))),
    expoOut: (t) => (t === 1 ? 1 : 1 - 2**(-10 * t)),
    expoInOut: (t) => (t === 0 || t === 1 ? t : t < 0.5 ? 2**(20 * t - 10) / 2 : (2 - 2**(-20 * t + 10)) / 2),

    circIn: (t) => 1 - Math.sqrt(1 - t**2),
    circOut: (t) => Math.sqrt(1 - (1 - t)**2),
    circInOut: (t) => (t < 0.5 ? (1 - Math.sqrt(1 - (2 * t)**2)) / 2 : (Math.sqrt(1 - (-2 * t + 2)**2) + 1) / 2),

    backIn: (t) => c3 * t**3 - c1 * t**2,
    backOut: (t) => 1 + c3 * (t - 1)**3 + c1 * (t - 1)**2,
    backInOut: (t) => (t < 0.5 ? ((2 * t)**2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2)**2 * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2),

    elasticIn: (t) => (t === 0 || t === 1 ? t : -(2**(10 * t - 10)) * Math.sin((10 * t - 10.75) * c4)),
    elasticOut: (t) => (t === 0 || t === 1 ? t : 2**(-10 * t) * Math.sin((10 * t - 0.75) * c4) + 1),
    elasticInOut: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5
        ? -(2**(20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
        : (2**(-20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1)
};

// Resolve an easing option: a name from Easing or a custom (t) => eased function.
export function getEasing(easing) {
    if (typeof easing === "function") return easing;

    const fn = Easing[easing];
    if (!fn)
        throw new Error(`Unknown easing "${easing}". Available: ${Object.keys(Easing).join(", ")}.`);

    return fn;
}
