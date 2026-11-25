/**
 * Step-by-step explanations shown as speech bubbles on the board.
 * Pure: builds the steps (which house or charger to point at, and what it says)
 * from the geometry; bubble.ts draws them. No three.js, no DOM.
 */
import {
    dist,
    evaluate,
    lthNearestDist,
    lthNearestIndex,
    type Point,
} from "./geometry";

export interface Anchor {
    /**
     * "house" / "charger": point at it on the board. "panel": just under the goal
     * box. "dock": bottom-left corner, off the board, for steps that ask the player
     * to click houses or discs (a bubble on the board would hide them).
     */
    kind: "house" | "charger" | "panel" | "dock";
    index: number;
}

/**
 * What a lesson step can look at. main.ts builds it from its state each frame;
 * lessons.ts only reads it. The counters (`tapped`, `wrongHouse`, `drags`) restart
 * with every step.
 */
export interface TourView {
    clients: readonly Point[];
    facilities: readonly Point[];
    failed: readonly boolean[];
    l: number;
    /** The plan's radius r at the current ℓ, its worst house and that house's charger. */
    radius: number;
    worstClient: number;
    witnessFacility: number;
    /** With chargers broken: the nearest-working-charger result; else null. */
    after: { radius: number; worstClient: number } | null;
    /** Charger clicked during this step (-1: none yet). */
    tapped: number;
    /** House clicked during this step that was not the right one (-1: none). */
    wrongHouse: number;
    /** Drags finished during this step. */
    drags: number;
    /** Farthest-first placements done / possible. */
    steps: number;
    totalSteps: number;
    /** The answer picked at each "choose" step of this tour (by step index). */
    answers: readonly (number | undefined)[];
}

/** Something a step does to the game when it opens, or when an answer is picked. */
export interface TourEffect {
    /** Switch ℓ (level 2 starts at ℓ = 1, then asks for backups). */
    setL?: number;
    /** The failure walk reached its end: remember this placement as tested. */
    tested?: boolean;
    /** Put plain farthest-first singles down (k chargers on k houses). */
    singles?: boolean;
    /** Put the chargers back where the level started. */
    restart?: boolean;
    /** Place the next farthest-first charger (or pair) for the player. */
    showMe?: boolean;
    /** Show the proof's discs (radius r/2 around the farthest-first houses). */
    discs?: boolean;
    /** Show (true) or hide (false) the best placement as gold ghosts. */
    best?: boolean;
    /** The disc proof was worked through. */
    proofDone?: boolean;
    /** Reveal the bot (the twin rule's placement, as ghosts) and its radius. */
    revealBot?: boolean;
}

export interface Choice {
    label: string;
    /** Shown after picking. */
    reply: string;
    effect?: TourEffect;
}

export interface TourStep {
    /** What the bubble points at; a function decides when shown (e.g. the current worst house). */
    anchor: Anchor | ((v: TourView) => Anchor);
    text: string | ((v: TourView) => string);
    /** While this step shows: break only this charger (failure walk-through). */
    breaks?: number;
    /** While this step shows: the red house and red line are this house and charger. */
    highlight?: { house: number; charger: number };
    /**
     * A "do" step: no Next button; the tour moves on by itself once this returns
     * true. A string is feedback shown under the text (e.g. after a wrong click).
     * Checked only between drags, so the drag it asks for doesn't skip ahead.
     */
    waitFor?: (v: TourView) => boolean | string;
    /** A "choose" (predict) step: answer buttons; picking one shows its reply, then Next. */
    choices?: Choice[];
    /** Applied when the step opens. */
    enter?: TourEffect;
}

/** A step whose anchor and text are fixed when the tour is built. */
export type StaticTourStep = TourStep & { anchor: Anchor; text: string };

/** A tour with "do" or "choose" steps is a lesson: dragging doesn't close it. */
export function isInteractive(steps: readonly TourStep[]): boolean {
    return steps.some((s) => s.waitFor || s.choices);
}

const fmt = (r: number) => r.toFixed(2);
const MAX_HOUSES = 3; // bubbles for at most this many too-far houses

function nth(l: number): string {
    return l === 1 ? "my nearest charger" : "my 2nd-nearest charger";
}

/**
 * Why the player's placement lost to the bot: the too-far houses, worst first,
 * then (if it applies) why a better average doesn't count, then which charger to move.
 * Empty if the player did not lose.
 */
export function botLossSteps(
    clients: readonly Point[],
    mine: readonly Point[],
    bot: readonly Point[],
    l: number,
): StaticTourStep[] {
    const botR = evaluate(clients, bot, l).radius;
    const me = evaluate(clients, mine, l);
    if (!(me.radius > botR + 1e-9)) return [];

    const myTrip = clients.map((c) => lthNearestDist(c, mine, l));
    const botTrip = clients.map((c) => lthNearestDist(c, bot, l));
    const tooFar = clients
        .map((_, i) => i)
        .filter((i) => myTrip[i] > botR + 1e-9)
        .sort((a, b) => myTrip[b] - myTrip[a]);

    const steps: StaticTourStep[] = tooFar.slice(0, MAX_HOUSES).map((h, k) => ({
        anchor: { kind: "house", index: h },
        text:
            k === 0
                ? `I am your worst-off house: ${fmt(myTrip[h])} from ${nth(l)}, so your radius r is ${fmt(myTrip[h])}. The bot keeps every house within ${fmt(botR)}.`
                : `Fix the house before me and I set the radius r instead: ${fmt(myTrip[h])}, still more than the bot's ${fmt(botR)}.` +
                  (k === MAX_HOUSES - 1 && tooFar.length > MAX_HOUSES
                      ? ` (${tooFar.length - MAX_HOUSES} more houses are too far.)`
                      : ""),
    }));

    // A better average doesn't help: point at the house your plan serves best
    // compared with the bot's.
    const avg = (t: number[]) => t.reduce((a, b) => a + b, 0) / t.length;
    if (avg(myTrip) < avg(botTrip)) {
        let best = 0;
        clients.forEach((_, i) => {
            if (botTrip[i] - myTrip[i] > botTrip[best] - myTrip[best]) best = i;
        });
        steps.push({
            anchor: { kind: "house", index: best },
            text: `Your plan is better for me: my ${l === 1 ? "nearest" : "2nd-nearest"} charger is ${fmt(myTrip[best])} away, against ${fmt(botTrip[best])} with the bot's plan. On average your houses are closer too (${fmt(avg(myTrip))} vs ${fmt(avg(botTrip))}), but the radius r counts only the worst house.`,
        });
    }

    // The charger that serves the worst house: the one to move.
    steps.push({
        anchor: { kind: "charger", index: me.witnessFacility },
        text: `I am the worst house's ${l === 1 ? "nearest" : "2nd-nearest"} charger. Try moving me toward it, then check the radius r again.`,
    });
    return steps;
}

/**
 * Farthest-first, after clicking the wrong house: the clicked house says how far it
 * is, then the farthest house says it is farther.
 */
export function wrongHouseSteps(
    clients: readonly Point[],
    facilities: readonly Point[],
    l: number,
    clicked: number,
): StaticTourStep[] {
    const worst = evaluate(clients, facilities, l);
    const d = lthNearestDist(clients[clicked], facilities, l);
    return [
        {
            anchor: { kind: "house", index: clicked },
            text: `I am ${fmt(d)} from ${nth(l)}, but I am not the farthest house.`,
        },
        {
            anchor: { kind: "house", index: worst.worstClient },
            text: `I am ${fmt(worst.radius)} from ${nth(l)}: no house is farther. Click me to send the next ${l === 1 ? "charger" : "pair"} here.`,
        },
    ];
}

/**
 * Level 3: break each charger in turn. The broken charger speaks: what happens to
 * the houses it was closest to (the red line shows the farthest of them and the
 * charger it falls back to). Last, the house that sets the planned radius explains
 * why the worst single failure is exactly that radius.
 */
export function failureSteps(
    clients: readonly Point[],
    facilities: readonly Point[],
    l: number,
): StaticTourStep[] {
    const plan = evaluate(clients, facilities, l);
    if (plan.worstClient < 0 || facilities.length < 2) return [];
    const r = fmt(plan.radius);
    const steps: (StaticTourStep | null)[] = facilities.map((f, i) => {
        // A twin stack gets one step (breaking either twin is the same).
        if (facilities.some((g, j) => j < i && g.x === f.x && g.y === f.y))
            return null;
        const working = facilities.map((_, j) => j).filter((j) => j !== i);
        // Over all houses (the top box's "radius now"): nearest working charger.
        const now = fmt(
            evaluate(
                clients,
                working.map((j) => facilities[j]),
                1,
            ).radius,
        );
        // Houses that had this charger as (one of) their closest.
        const served = clients
            .map((_, h) => h)
            .filter(
                (h) =>
                    dist(clients[h], f) <=
                    lthNearestDist(clients[h], facilities, 1) + 1e-9,
            );
        const step: StaticTourStep = {
            anchor: { kind: "charger", index: i },
            breaks: i,
            text: `I broke (dark), but no house had me as its closest charger, so nothing changes. Over all houses the radius now is ${now}.`,
        };
        if (served.length === 0) return step;
        // The farthest of them from a working charger, and that charger.
        let house = -1;
        let fallback = -1;
        let far = -1;
        for (const h of served) {
            const j = working.reduce((a, b) =>
                dist(clients[h], facilities[b]) <
                dist(clients[h], facilities[a])
                    ? b
                    : a,
            );
            const d = dist(clients[h], facilities[j]);
            if (d > far) [house, fallback, far] = [h, j, d];
        }
        const twin = working.some(
            (j) => facilities[j].x === f.x && facilities[j].y === f.y,
        );
        step.highlight = { house, charger: fallback };
        const within = (d: string) =>
            `${Number(d) >= Number(r) ? "exactly" : "within"} your planned radius r = ${r}`;
        step.text = twin
            ? `Break either of us twins (dark): the other stands on the same spot, so the houses we were closest to lose nothing (red line: the farthest of them, ${fmt(far)}). Over all houses the radius now is ${now}, ${within(now)}.`
            : `I broke (dark). The houses I was closest to now use their next charger; the farthest of them is ${fmt(far)} away (red line). Over all houses the radius now is ${now}, ${within(now)}.`;
        return step;
    });
    // Why the worst failure is exactly r: the house that sets r loses its nearest.
    const nearest = lthNearestIndex(clients[plan.worstClient], facilities, 1);
    steps.push({
        anchor: { kind: "house", index: plan.worstClient },
        breaks: nearest,
        enter: { tested: true }, // level 3 needs this walk on the final placement
        highlight: { house: plan.worstClient, charger: plan.witnessFacility },
        text: `Why the worst failure is exactly r: my planned radius r = ${r} is the distance to my 2nd-nearest charger. Break my nearest and I fall back to that one, ${r} away. No single failure can do worse.`,
    });
    return steps.filter((x): x is StaticTourStep => x !== null);
}

/** A level's task, said once from the goal box when the level starts. */
export function briefingSteps(text: string): StaticTourStep[] {
    return [{ anchor: { kind: "panel", index: 0 }, text }];
}
