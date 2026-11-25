/**
 * The start menu: a grid of the levels. Locked levels can't be picked; finished
 * ones get a tick. `show()` redraws it from progress.ts each time it opens.
 */
import { icon } from "./icons";
import { LEVELS } from "./levels";
import { isCompleted, isUnlocked } from "./progress";

export function createMenu(onPick: (id: string) => void) {
    const root = document.getElementById("menu")!;
    const grid = document.getElementById("menu-grid")!;

    function show(): void {
        grid.replaceChildren(
            ...LEVELS.map((def, i) => {
                const open = isUnlocked(i);
                const done = isCompleted(def.id);
                const tile = document.createElement("button");
                tile.type = "button";
                tile.className = `tile${done ? " done" : ""}`;
                tile.disabled = !open;
                const name = def.title.replace(/^\d+\s*·\s*/, "");
                tile.setAttribute(
                    "aria-label",
                    `Level ${i + 1}: ${name}${open ? (done ? ", finished" : "") : ", locked"}`,
                );
                tile.innerHTML = `<span class="tile-n">${i + 1}</span><span class="tile-name"></span><span class="tile-mark"></span>`;
                tile.querySelector(".tile-name")!.textContent = name;
                if (!open || done)
                    tile.querySelector(".tile-mark")!.append(
                        icon(open ? "checkmark" : "locked"),
                    );
                tile.addEventListener("click", () => {
                    hide();
                    onPick(def.id);
                });
                return tile;
            }),
        );
        root.hidden = false;
        document.body.classList.add("menu-open"); // only the board shows behind the grid
        // Focus the level to play next: the first open one not yet finished.
        const next =
            grid.querySelector<HTMLElement>(
                ".tile:not(:disabled):not(.done)",
            ) ?? grid.querySelector<HTMLElement>(".tile");
        next?.focus();
    }

    function hide(): void {
        root.hidden = true;
        document.body.classList.remove("menu-open");
    }

    return { show, hide, isOpen: () => !root.hidden };
}
