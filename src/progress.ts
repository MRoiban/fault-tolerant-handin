/**
 * Which levels the player has finished, and the player's settings. Level 1 is always open; finishing a level
 * opens the next. Kept in localStorage so it survives a reload; if the browser
 * blocks storage (some file:// or private windows), progress lasts for the visit.
 */
import { LEVELS } from "./levels";

const KEY = "kcentre.completed";

function load(): Set<string> {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
        return new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch {
        return new Set();
    }
}

const completed = load();

export function isCompleted(id: string): boolean {
    return completed.has(id);
}

/** Open if it is the first level, the level before it is finished, or all are unlocked. */
export function isUnlocked(index: number): boolean {
    return (
        index === 0 ||
        settings.unlockAll ||
        isCompleted(LEVELS[index - 1]?.id ?? "")
    );
}

function save(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage blocked: keep it in memory for this visit.
    }
}

export function markCompleted(id: string): void {
    if (completed.has(id)) return;
    completed.add(id);
    save(KEY, [...completed]);
}

export function resetProgress(): void {
    completed.clear();
    save(KEY, []);
}

// ---------------------------------------------------------------------------
// Settings (the pause screen)

export interface Settings {
    /** Open a bubble with the level's task when a level starts. */
    briefing: boolean;
    /** Teachers: every level open. */
    unlockAll: boolean;
    /** No interface sounds. */
    muted: boolean;
}

const SETTINGS_KEY = "kcentre.settings";

function loadSettings(): Settings {
    const defaults: Settings = {
        briefing: true,
        unlockAll: false,
        muted: false,
    };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
        return { ...defaults, ...(typeof saved === "object" ? saved : {}) };
    } catch {
        return defaults;
    }
}

export const settings: Settings = loadSettings();

export function setSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K],
): void {
    settings[key] = value;
    save(SETTINGS_KEY, settings);
}
