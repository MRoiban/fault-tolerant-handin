/**
 * UI icons: Kenney "Game Icons" (CC0; see icons/LICENSE-Kenney-CC0.txt). Each is drawn
 * as a CSS mask, so it takes the colour of the text around it (pressed, disabled and
 * the teal Next button all just work). The PNGs are inlined into the single-file build.
 */
const files = import.meta.glob<string>("./icons/*.png", {
    eager: true,
    import: "default",
});

function url(name: string): string {
    const u = files[`./icons/${name}.png`];
    if (!u) throw new Error(`no icon "${name}"`);
    return u;
}

/** An icon element, e.g. for the level grid. */
export function icon(name: string, className = "icon"): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = className;
    span.setAttribute("aria-hidden", "true");
    span.style.setProperty("--icon", `url("${url(name)}")`);
    return span;
}

/** Give an element its icon (first, or last with `after`), replacing an older one. */
export function setIcon(el: HTMLElement, name: string, after = false): void {
    el.querySelector(":scope > .icon")?.remove();
    const span = icon(name);
    if (after) el.append(span);
    else el.prepend(span);
}

/** Change an element's text without losing its icon. */
export function setLabel(el: HTMLElement, text: string): void {
    let label = el.querySelector<HTMLElement>(":scope > .label");
    if (!label) {
        label = document.createElement("span");
        label.className = "label";
        // Keep the text where it was: before an icon placed after it.
        const iconAfter = el.lastElementChild?.classList.contains("icon")
            ? el.lastElementChild
            : null;
        el.insertBefore(label, iconAfter);
        for (const n of [...el.childNodes])
            if (n.nodeType === Node.TEXT_NODE) n.remove();
    }
    if (label.textContent !== text) label.textContent = text;
}

/** Every element with `data-icon="name"` (and `data-icon-after` to place it last). */
export function applyIcons(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
        const text = el.textContent?.trim() ?? "";
        el.textContent = "";
        if (text) setLabel(el, text);
        setIcon(el, el.dataset.icon!, el.hasAttribute("data-icon-after"));
    });
}
