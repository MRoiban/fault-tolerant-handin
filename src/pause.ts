/**
 * The pause screen (Esc or the ≡ button): Resume, Levels, Settings, and the
 * legend. Settings are stored by progress.ts.
 */
import { resetProgress, setSetting, settings } from "./progress";

export interface PauseActions {
    resume(): void;
    levels(): void;
}

export function createPause(actions: PauseActions) {
    const root = document.getElementById("pause")!;
    const main = document.getElementById("pause-menu")!;
    const panel = document.getElementById("settings")!;
    const briefing = document.getElementById(
        "set-briefing",
    ) as HTMLInputElement;
    const unlock = document.getElementById("set-unlock") as HTMLInputElement;
    const resetBtn = document.getElementById("set-reset") as HTMLButtonElement;

    document
        .getElementById("resume")!
        .addEventListener("click", actions.resume);
    document
        .getElementById("levels")!
        .addEventListener("click", actions.levels);
    document
        .getElementById("settings-open")!
        .addEventListener("click", () => showSettings(true));
    document
        .getElementById("settings-back")!
        .addEventListener("click", () => showSettings(false));
    briefing.addEventListener("change", () =>
        setSetting("briefing", briefing.checked),
    );
    unlock.addEventListener("change", () =>
        setSetting("unlockAll", unlock.checked),
    );
    resetBtn.addEventListener("click", () => {
        resetProgress();
        resetBtn.textContent = "Progress reset ✓";
    });

    function showSettings(on: boolean): void {
        main.hidden = on;
        panel.hidden = !on;
        briefing.checked = settings.briefing;
        unlock.checked = settings.unlockAll;
        resetBtn.textContent = "Reset progress";
        (on ? briefing : document.getElementById("resume")!).focus();
    }

    function open(): void {
        root.hidden = false;
        document.body.classList.add("paused");
        showSettings(false);
    }

    function close(): void {
        root.hidden = true;
        document.body.classList.remove("paused");
    }

    /** Esc inside the pause screen: Settings → menu → back to the game. */
    function back(): void {
        if (!panel.hidden) showSettings(false);
        else actions.resume();
    }

    return { open, close, back, isOpen: () => !root.hidden };
}
