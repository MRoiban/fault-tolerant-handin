/**
 * Short interface sounds (Kenney "Interface Sounds", CC0; see sounds/LICENSE-Kenney-CC0.txt).
 * The MP3s are inlined into the single-file build. They are decoded once, after the
 * first click or key press (browsers only start audio after a user gesture), and
 * each play varies the pitch by ±4% so repeats don't sound machine-made.
 */
import clickUrl from "./sounds/click.mp3";
import dropUrl from "./sounds/drop.mp3";
import goalUrl from "./sounds/goal.mp3";
import liftUrl from "./sounds/lift.mp3";
import { settings } from "./progress";

/**
 * Four sounds, each meaning one thing: every interface click (buttons, answers,
 * houses, breaking a charger) sounds the same; picking up and putting down a
 * charger have their own; reaching a goal has its own. All low and soft.
 */
const SOUNDS = {
    click: { url: clickUrl, gain: 0.3 }, // bong_001: a soft, low ping
    lift: { url: liftUrl, gain: 0.22 }, // maximize_008
    drop: { url: dropUrl, gain: 0.45 }, // drop_003
    goal: { url: goalUrl, gain: 0.4 }, // confirmation_001
} as const;

export type SoundName = keyof typeof SOUNDS;

let ctx: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer>();

/** A data: URL (the build) or a file URL (dev server) → bytes. */
async function bytes(url: string): Promise<ArrayBuffer> {
    if (url.startsWith("data:")) {
        const raw = atob(url.slice(url.indexOf(",") + 1));
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out.buffer;
    }
    return (await fetch(url)).arrayBuffer();
}

/** Create the audio context and decode every sound (once, on the first gesture). */
function start(): void {
    if (ctx) return;
    try {
        ctx = new AudioContext();
    } catch {
        return; // no Web Audio: the game stays silent
    }
    for (const [name, s] of Object.entries(SOUNDS) as [
        SoundName,
        (typeof SOUNDS)[SoundName],
    ][])
        bytes(s.url)
            .then((b) => ctx!.decodeAudioData(b))
            .then((buf) => buffers.set(name, buf))
            .catch(() => {}); // a sound that won't decode is simply skipped
}
window.addEventListener("pointerdown", start, { once: true, capture: true });
window.addEventListener("keydown", start, { once: true, capture: true });

/** For the debug handle and browser checks: sounds decoded, and the last plays. */
export const soundDebug = {
    loaded: () => buffers.size,
    played: [] as SoundName[],
};

/** Play a sound, unless muted or not loaded yet. */
export function play(name: SoundName): void {
    if (settings.muted || !ctx) return;
    soundDebug.played.push(name);
    if (soundDebug.played.length > 50) soundDebug.played.shift();
    const buf = buffers.get(name);
    if (!buf) return;
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.04;
    const gain = ctx.createGain();
    gain.gain.value = SOUNDS[name].gain;
    src.connect(gain).connect(ctx.destination);
    src.start();
}
