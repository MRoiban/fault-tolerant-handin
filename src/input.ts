/**
 * Mouse (via Pointer Events) and keyboard shortcuts.
 * A press that barely moves is a tap; a press that moves is a drag.
 */
import type { Point } from "./geometry";
import type { KCentreScene } from "./scene";

export interface PointerHandlers {
    position(i: number): Point;
    onDragStart(i: number): void;
    /** `to` is where the charger should go (already offset so it doesn't jump to the finger). */
    onDrag(i: number, to: Point): void;
    onDragEnd(): void;
    onTap(i: number): void;
    /** A click on a house (not on a charger). */
    onHouseClick(house: number): void;
    /** The mouse rests over a house (-1: over none), at this point of the canvas. */
    onHoverHouse?(house: number, at: { x: number; y: number }): void;
}

export function attachPointer(
    scene: KCentreScene,
    handlers: PointerHandlers,
): void {
    const canvas = scene.canvas;
    let press: {
        id: number;
        charger: number;
        startX: number;
        startY: number;
        offset: Point;
        dragging: boolean;
    } | null = null;

    /** Pointer position in CSS px inside the canvas. */
    const local = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvas.addEventListener("pointerdown", (e) => {
        if (press || e.button > 0) return;
        const p = local(e);
        const charger = scene.pickFacility(p.x, p.y);
        if (charger < 0) {
            const house = scene.pickHouse(p.x, p.y);
            if (house >= 0) handlers.onHouseClick(house);
            return;
        }
        e.preventDefault();
        // Keep the grab point under the finger instead of jumping the charger's centre there.
        const ground = scene.groundPoint(p.x, p.y);
        const pos = handlers.position(charger);
        const offset = ground
            ? { x: pos.x - ground.x, y: pos.y - ground.y }
            : { x: 0, y: 0 };
        press = {
            id: e.pointerId,
            charger,
            startX: p.x,
            startY: p.y,
            offset,
            dragging: false,
        };
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
    });

    canvas.addEventListener("pointermove", (e) => {
        const p = local(e);
        if (!press || e.pointerId !== press.id) {
            // Mouse hover: a hand over chargers; a house reports itself.
            if (!press) {
                const charger = scene.pickFacility(p.x, p.y);
                canvas.style.cursor = charger >= 0 ? "grab" : "";
                handlers.onHoverHouse?.(
                    charger >= 0 ? -1 : scene.pickHouse(p.x, p.y),
                    p,
                );
            }
            return;
        }
        if (!press.dragging) {
            // Moving less than 4 px still counts as a click, not a drag.
            if (Math.hypot(p.x - press.startX, p.y - press.startY) < 4) return;
            press.dragging = true;
            handlers.onDragStart(press.charger);
        }
        const ground = scene.groundPoint(p.x, p.y);
        if (ground)
            handlers.onDrag(press.charger, {
                x: ground.x + press.offset.x,
                y: ground.y + press.offset.y,
            });
    });

    const end = (e: PointerEvent, cancelled: boolean) => {
        if (!press || e.pointerId !== press.id) return;
        const { charger, dragging } = press;
        press = null;
        if (canvas.hasPointerCapture(e.pointerId))
            canvas.releasePointerCapture(e.pointerId);
        canvas.style.cursor = "";
        if (dragging) handlers.onDragEnd();
        else if (!cancelled) handlers.onTap(charger);
    };
    canvas.addEventListener("pointerup", (e) => end(e, false));
    canvas.addEventListener("pointercancel", (e) => end(e, true));
    canvas.addEventListener("lostpointercapture", (e) => end(e, true));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerleave", () =>
        handlers.onHoverHouse?.(-1, { x: 0, y: 0 }),
    );
}

/** Single-key shortcuts, e.g. { r: reset }. Ignored while typing in a form control. */
export function attachKeys(keys: Record<string, () => void>): void {
    window.addEventListener("keydown", (e) => {
        if (
            e.metaKey ||
            e.ctrlKey ||
            e.altKey ||
            e.target instanceof HTMLSelectElement
        )
            return;
        const action = keys[e.key.toLowerCase()];
        if (!action) return;
        e.preventDefault();
        action();
    });
}
