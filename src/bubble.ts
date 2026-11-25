/**
 * The speech bubble: a card whose tail points at a house or charger, saying one
 * step of an explanation or lesson, with answer buttons on "choose" steps and
 * Back / Next. `render` gets the resolved step and screen points from main.ts;
 * it never decides content.
 */

/** One step, resolved for display. */
export interface BubbleView {
    text: string;
    /** Under the text: a "choose" step's reply, or a "do" step's feedback. */
    feedback: string | null;
    index: number;
    total: number;
    /** Answer buttons of a "choose" step not answered yet. */
    choices: string[] | null;
    /** A "do" step: no Next; the tour moves on when the player has done it. */
    waiting: boolean;
    canBack: boolean;
}

export interface BubbleActions {
    next(): void;
    back(): void;
    close(): void;
    choose(i: number): void;
}

type Pt = { x: number; y: number };

/** Where the bubble may go, in CSS px. */
export interface Placement {
    /** Point to aim at from above or below (a roof, the top of a charger). */
    top: Pt;
    /** Point to aim at from the side (the middle of a charger), or null: never beside. */
    side: Pt | null;
    /** Try the side spots first (the target has chargers stacked on it). */
    preferSide: boolean;
    /** The card stays below this y: the goal box at the top. */
    minTop: number;
    /** Points the card must not cover: the red house, the other chargers in play. */
    keepVisible: readonly Pt[];
    /** Points worth keeping visible too, but less important (the other houses). */
    alsoVisible?: readonly Pt[];
    /** Sit in the bottom-left corner, off the board, with no tail. */
    dock?: boolean;
    /** If no spot keeps every kept point visible, dock instead (a "do" step). */
    dockIfCrowded?: boolean;
}

const GAP = 12; // keep the card this far from the window edges
const ABOVE = 14; // card bottom this far above the target; the tail bridges it
const BELOW = 40; // card top this far below the target, clear of the house itself
const BESIDE = 22; // card edge this far left or right of the target
const CLEAR = 22; // a kept-visible point stays this far outside the card

interface Spot {
    x: number; // the card's top-left corner
    y: number;
    tail: "down" | "up" | "left" | "right" | "none"; // where the tail points
    at: Pt; // what the tail points at
}

export function createBubble(actions: BubbleActions) {
    const root = document.getElementById("bubble")!;
    const card = root.querySelector<HTMLElement>(".bubble-card")!;
    const tail = root.querySelector<HTMLElement>(".bubble-tail")!;
    const text = document.getElementById("bubble-text")!;
    const count = document.getElementById("bubble-count")!;
    const back = document.getElementById("bubble-back") as HTMLButtonElement;
    const next = document.getElementById("bubble-next") as HTMLButtonElement;
    const feedback = document.getElementById("bubble-feedback")!;
    const choices = document.getElementById("bubble-choices")!;
    const doing = document.getElementById("bubble-do")!;
    document
        .getElementById("bubble-close")!
        .addEventListener("click", actions.close);
    back.addEventListener("click", actions.back);
    next.addEventListener("click", actions.next);

    let shownIndex = -1;
    let shownText = "";
    let shownChoices = "";

    function render(view: BubbleView | null, place: Placement | null): void {
        root.hidden = !view || !place;
        if (!view || !place) {
            shownIndex = -1;
            shownText = "";
            return;
        }
        if (view.index !== shownIndex || view.text !== shownText) {
            if (view.index !== shownIndex) {
                // Replay the pop-in animation for each new step.
                card.classList.remove("pop");
                void card.offsetWidth;
                card.classList.add("pop");
            }
            shownIndex = view.index;
            shownText = view.text;
            text.textContent = view.text;
        }
        feedback.hidden = !view.feedback;
        if (feedback.textContent !== (view.feedback ?? ""))
            feedback.textContent = view.feedback ?? "";
        const key = view.choices?.join("|") ?? "";
        if (key !== shownChoices) {
            shownChoices = key;
            choices.replaceChildren(
                ...(view.choices ?? []).map((label, i) => {
                    const b = document.createElement("button");
                    b.type = "button";
                    b.textContent = label;
                    b.addEventListener("click", () => actions.choose(i));
                    return b;
                }),
            );
        }
        choices.hidden = !view.choices;
        doing.hidden = !view.waiting;
        next.hidden = view.waiting || !!view.choices;
        count.textContent = `${view.index + 1} / ${view.total}`;
        back.disabled = !view.canBack;
        next.textContent = view.index === view.total - 1 ? "Done" : "Next";

        const w = card.offsetWidth;
        const h = card.offsetHeight;
        const spot = chooseSpot(place, w, h);
        // #bubble sits at the card's corner; the tail goes on the card's edge.
        root.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
        card.style.left = "0px";
        card.style.top = "0px";
        const tx = Math.min(Math.max(spot.at.x - spot.x, 18), w - 18);
        const ty = Math.min(Math.max(spot.at.y - spot.y, 18), h - 18);
        tail.hidden = spot.tail === "none";
        const [left, top, turn] = {
            down: [tx, h, 45],
            up: [tx, 0, -135],
            left: [0, ty, 135],
            right: [w, ty, -45],
            none: [0, 0, 0],
        }[spot.tail];
        tail.style.left = `${left}px`;
        tail.style.top = `${top}px`;
        tail.style.setProperty("--tail-turn", `${turn}deg`);
    }

    return { render };
}

/**
 * Try spots around the target (above, beside, below; centred or shifted) and take
 * the first that stays in the window, below the goal box, and off the kept points.
 */
function chooseSpot(p: Placement, w: number, h: number): Spot {
    const y0 = window.innerHeight - GAP - h;
    const docked: Spot = { x: GAP, y: y0, tail: "none", at: { x: GAP, y: y0 } };
    if (p.dock) return docked;
    const maxX = window.innerWidth - GAP - w;
    const maxY = window.innerHeight - GAP - h;
    const fitX = (x: number) => Math.min(Math.max(x, GAP), maxX);
    const fitY = (y: number) => Math.min(Math.max(y, p.minTop), maxY);
    const { top: t, side: s } = p;
    const shifts = [-w / 2, 36 - w, -36];
    const above = shifts.map((dx): Spot => ({
        x: fitX(t.x + dx),
        y: t.y - ABOVE - h,
        tail: "down",
        at: t,
    }));
    const below = shifts.map((dx): Spot => ({
        x: fitX(t.x + dx),
        y: t.y + BELOW,
        tail: "up",
        at: t,
    }));
    const beside: Spot[] = !s
        ? []
        : [
              { x: s.x + BESIDE, y: fitY(s.y - h / 2), tail: "left", at: s },
              {
                  x: s.x - BESIDE - w,
                  y: fitY(s.y - h / 2),
                  tail: "right",
                  at: s,
              },
          ];
    const order = p.preferSide
        ? [...beside, ...above, ...below]
        : [above[0], ...beside, ...above.slice(1), ...below];
    const inWindow = (o: Spot) =>
        o.x >= GAP - 0.5 &&
        o.x <= maxX + 0.5 &&
        o.y >= p.minTop - 0.5 &&
        o.y <= maxY + 0.5;
    const hidden = (o: Spot, pts: readonly Pt[]) =>
        pts.filter(
            (k) =>
                k.x > o.x - CLEAR &&
                k.x < o.x + w + CLEAR &&
                k.y > o.y - CLEAR &&
                k.y < o.y + h + CLEAR,
        ).length;
    // Hiding a kept point (a charger, the red house) costs far more than hiding
    // another house. Take the cheapest spot, earliest in order on ties.
    const cost = (o: Spot) =>
        100 * hidden(o, p.keepVisible) + hidden(o, p.alsoVisible ?? []);
    const fits = order.filter(inWindow);
    let best = fits[0] ?? below[0];
    for (const o of fits) if (cost(o) < cost(best)) best = o;
    // Nothing hidden: stay next to the target. Otherwise the corner dock wins if it
    // hides less (it usually hides nothing: it sits off the board).
    if (p.dockIfCrowded && cost(best) > 0 && cost(docked) < cost(best))
        return docked;
    return best;
}
