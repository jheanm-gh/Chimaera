/**
 * @chimaera/audio — voices and a score, as data.
 *
 * Nothing in this package makes a sound. It produces specifications: what a
 * creature's call *is*, which layers of the theme are audible, what a stinger
 * plays. Building the Web Audio graph is the app's job, which keeps the
 * interesting half — the part where a genome becomes a voice — pure, testable
 * and reproducible.
 */

export * from "./voice.js";
export * from "./score.js";
export * from "./mixer.js";
