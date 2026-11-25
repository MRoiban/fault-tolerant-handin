/**
 * One lesson per level, taught by doing: "do" steps wait for the player
 * (`waitFor`), "choose" steps ask for a prediction first (`choices`).
 * Pure like explain.ts: no three.js, no DOM; main.ts runs them.
 * Each was checked in the browser and against an exact solver; lessons.test.ts checks their claims.
 */
import {
    dist,
    evaluate,
    gonzalez,
    lthNearestDist,
    radius,
    type Point,
} from "./geometry";
import type { TourStep, TourView } from "./explain";

const fmt = (r: number) => r.toFixed(2);
const EPS = 1e-9;
const house = (index: number) => ({ kind: "house" as const, index });
const charger = (index: number) => ({ kind: "charger" as const, index });
const worstHouse = (v: TourView) => house(v.worstClient);
/** Off the board, so the bubble never hides a house the player must click. */
const dock = { kind: "dock" as const, index: -1 };

/** Level 1: the radius r is the worst house's distance; act on it. */
export function coverLesson(
    clients: readonly Point[],
    facilities: readonly Point[],
    target: number,
): TourStep[] {
    const e = evaluate(clients, facilities, 1);
    if (e.worstClient < 0) return [];
    const w = e.worstClient;
    const f = e.witnessFacility;
    const r0 = e.radius;
    return [
        {
            anchor: { kind: "panel", index: 0 },
            text: "Every house wants a charger nearby. You place the 3 teal chargers, and a placement is only as good as its worst-off house: the one farthest from any charger.",
        },
        {
            anchor: house(w),
            text: `I am the worst-off house: my nearest charger is ${fmt(r0)} away (the red line). That distance is the radius r. Follow the red line from me to the teal charger at its other end, and click that charger.`,
            waitFor: (v) =>
                v.tapped === f
                    ? true
                    : v.tapped >= 0
                      ? `That one is ${fmt(dist(clients[w], v.facilities[v.tapped]))} from me. My nearest is ${fmt(r0)} away, at the end of the red line.`
                      : false,
        },
        {
            anchor: charger(f),
            text: "I'm that charger, the red house's nearest. Drag me toward the red house. Every charger's circle has radius r: watch them all shrink.",
            waitFor: (v) =>
                v.drags === 0
                    ? false
                    : v.radius < r0 - EPS
                      ? true
                      : `Radius r is ${fmt(v.radius)}, not below ${fmt(r0)}: a house I left behind is now worse off. Try a shorter move.`,
        },
        {
            anchor: worstHouse,
            text: (v) =>
                v.worstClient === w
                    ? `Still me, but now ${fmt(v.radius)} away. The radius r always follows the worst-off house.`
                    : `Now I am the worst-off house: radius r = ${fmt(v.radius)}. The radius r always follows the worst-off house.`,
        },
        {
            anchor: worstHouse,
            text: `Goal: radius r ≤ ${fmt(target)}. Move any of the 3 chargers; only the worst-off house counts. Hover a house to see its distance.`,
            waitFor: (v) =>
                v.radius <= target + EPS
                    ? true
                    : v.drags >= 3
                      ? `Radius r is ${fmt(v.radius)} now. Tip: give each group of houses its own charger, in the middle of the group.`
                      : v.drags > 0
                        ? `Radius r is ${fmt(v.radius)} now; I am the worst-off house.`
                        : false,
        },
        {
            anchor: worstHouse,
            text: (v) =>
                `Done: radius r = ${fmt(v.radius)}. I am the worst-off house: exactly r from my nearest charger, on the edge of its circle. Every other house is closer.`,
        },
    ];
}

/**
 * Level 2, the paper's Observation 2: one charger per house is perfect for ℓ = 1
 * and terrible for ℓ = 2; a twin fixes the lone house, a second twin the village.
 * Expects ℓ = 1 at the start; the first answer switches to ℓ = 2.
 */
export function backupsLesson(
    clients: readonly Point[],
    facilities: readonly Point[],
    target: number,
): TourStep[] {
    const r1 = radius(clients, facilities, 1);
    const e2 = evaluate(clients, facilities, 2);
    const lone = e2.worstClient;
    if (lone < 0) return [];
    // The lone house's own charger: its nearest.
    let loneCharger = 0;
    facilities.forEach((p, i) => {
        if (
            dist(p, clients[lone]) <
            dist(facilities[loneCharger], clients[lone])
        )
            loneCharger = i;
    });
    const near = dist(facilities[loneCharger], clients[lone]) + 0.5;
    const reveal = `Radius r went from ${fmt(r1)} to ${fmt(e2.radius)}.`;
    return [
        {
            anchor: house(lone),
            text: `One charger beside every house: radius r = ${fmt(r1)}. Now a new rule: each house needs ℓ = 2 chargers within r, so that one can break. ℓ counts the chargers a house needs nearby.`,
        },
        {
            anchor: house(lone),
            text: "With ℓ = 2, r becomes each house's distance to its 2nd-nearest charger. Which house will be worst off now?",
            choices: [
                {
                    label: "A village house",
                    reply: `No: in the village every house has other chargers close by. It's me, the lone house. ${reveal}`,
                    effect: { setL: 2 },
                },
                {
                    label: "The lone house",
                    reply: `Right: my 2nd-nearest charger is far away. ${reveal}`,
                    effect: { setL: 2 },
                },
            ],
        },
        {
            anchor: house(lone),
            text: `My nearest charger is right here, but my 2nd-nearest is over in the village (the group of 3 houses), ${fmt(e2.radius)} away. If I sat farther out, r would grow with me, as large as you like.`,
        },
        {
            anchor: charger(loneCharger),
            text: "Give me a twin: drag another charger onto me. Two chargers on one spot count as two.",
            waitFor: (v) =>
                v.facilities.filter((p) => dist(p, clients[lone]) <= near)
                    .length >= 2,
        },
        {
            anchor: worstHouse,
            text: (v) =>
                `${v.drags === 0 ? "The lone house has its twin pair. " : ""}I am a village house, and the worst off now: radius r = ${fmt(v.radius)}. Get it to ${fmt(target)} or less. (To move a stack, drag its bottom charger.)`,
            waitFor: (v) =>
                v.radius <= target + EPS
                    ? true
                    : v.drags >= 2
                      ? "Each village house needs 2 chargers within r too. Stack the village's 2 chargers in the middle of its 3 houses."
                      : false,
        },
        {
            anchor: worstHouse,
            text: (v) =>
                `Done: radius r = ${fmt(v.radius)}. Every house now has 2 chargers within r: a twin pair at the lone house, one in the middle of the village. If any one charger breaks, its twin still serves.`,
        },
    ];
}

/** Level 3: break one charger, predict, then reach the goal and test every failure. */
export function failuresLesson(
    clients: readonly Point[],
    facilities: readonly Point[],
    target: number,
): TourStep[] {
    const after = (v: TourView) =>
        v.after ?? { radius: v.radius, worstClient: v.worstClient };
    // The charger to suggest: the one whose failure would hurt most if only ℓ = 1
    // had been planned, so the contrast after the break is visible, not just claimed.
    const r1 = radius(clients, facilities, 1);
    let suggest = 0;
    let worstHurt = -Infinity;
    facilities.forEach((_, i) => {
        const hurt =
            radius(
                clients,
                facilities.filter((_, j) => j !== i),
                1,
            ) - r1;
        if (hurt > worstHurt) [suggest, worstHurt] = [i, hurt];
    });
    const why =
        "every house has 2 chargers within r, so losing any one still leaves the other within r. If 2 break, there is no such guarantee.";
    return [
        {
            anchor: { kind: "panel", index: 0 },
            text: "Every house needs ℓ = 2 chargers within radius r. Chargers can break. Suppose one breaks: can a house end up farther than r from a working charger?",
            choices: [
                { label: "Yes", reply: `No, never: ${why}` },
                { label: "No", reply: `Right: ${why}` },
            ],
        },
        {
            anchor: charger(suggest),
            text: "Check it: click me to break me.",
            waitFor: (v) => v.failed.some(Boolean),
        },
        {
            anchor: (v) => house(after(v).worstClient),
            text: (v) => {
                const now = after(v).radius;
                const r1 = radius(v.clients, v.facilities, 1);
                const contrast =
                    now > r1 + EPS
                        ? `Had you planned for only ℓ = 1, your radius would be ${fmt(r1)}, and this failure would leave me at ${fmt(now)}, beyond it. The 2nd charger is what protects me.`
                        : `This failure happens to be harmless even with only ℓ = 1 planned (radius ${fmt(r1)}).`;
                return `Broken (dark). I am now the worst-off house: my nearest working charger is ${fmt(now)} away, within your planned radius r = ${fmt(v.radius)}. ${contrast}`;
            },
        },
        {
            anchor: worstHouse,
            text: (v) =>
                v.failed.some(Boolean)
                    ? `Click the broken charger to repair it (or leave it). Then get the radius r to ${fmt(target)} or less.`
                    : `Now get the radius r to ${fmt(target)} or less.`,
            waitFor: (v) =>
                v.radius <= target + EPS
                    ? true
                    : v.drags >= 3
                      ? "Tip: stack two chargers on one spot (twins) in the middle of each group of houses: every house nearby then has its 2 chargers at once."
                      : false,
        },
        {
            anchor: worstHouse,
            text: "Goal reached. Now check it: press Test failures. It breaks each charger in turn.",
            waitFor: () => false, // Test failures opens its own walk, which replaces this tour
        },
    ];
}

/**
 * Why farthest-first is never worse than 2 × r* (the paper's Theorem 8), on the
 * board: discs of radius r/2 around the m = k′ + 1 houses farthest-first picked,
 * then one question the player can reason out: how many chargers would a placement
 * with radius below r/2 need? (m × ℓ, one group per disc, more than the k we have.)
 */
export function proofLesson(
    m: number,
    l: number,
    k: number,
    r: number,
    again = false,
): TourStep[] {
    const per = l === 1 ? "a charger" : `${l} chargers`;
    const placed = l === 1 ? "chargers" : "pairs";
    const right = m * l;
    const reply = (n: number) =>
        `${n === right ? "Yes" : "Not quite"}: ${m} discs × ${l} = ${right}, since no charger can be inside two discs. But there are only ${k}. So no placement gets below ${fmt(r / 2)}: the best radius is at least ${fmt(r / 2)}, half of farthest-first's ${fmt(r)}. That is why farthest-first is never more than twice the best.`;
    const intro = again
        ? `The same argument works with pairs. Farthest-first put ${placed} on ${m - 1} houses; add the red house, the one it would pick next. Any two of these ${m} are at least ${fmt(r)} apart, so the discs of radius ${fmt(r / 2)} never overlap.`
        : `Why is farthest-first never more than twice the best? It put ${placed} on ${m - 1} houses; add the red house, the one it would pick next. Each was the farthest from its nearest charger when picked, and those distances only shrink as chargers are added, so each was at least ${fmt(r)} from every house picked before it: any two of these ${m} are at least ${fmt(r)} apart. Discs of radius ${fmt(r / 2)} (half that) around them never overlap.`;
    return [
        {
            anchor: dock,
            enter: { discs: true, best: false },
            text: intro,
        },
        {
            anchor: dock,
            text: `Imagine a placement with radius below ${fmt(r / 2)}. Each of these ${m} houses needs ${per} inside its own disc. How many chargers is that?`,
            choices: [k, right, 2 * right].map((n) => ({
                label: String(n),
                reply: reply(n),
                effect: { proofDone: true },
            })),
        },
    ];
}

/** Farthest-first feedback for a do-step: right clicks advance, wrong ones say why. */
function farthestGate(clients: readonly Point[], l: number) {
    return (v: TourView): boolean | string => {
        if (v.steps >= v.totalSteps) return true;
        if (v.wrongHouse < 0) return false;
        const d = lthNearestDist(clients[v.wrongHouse], v.facilities, l);
        return `That house is ${fmt(d)} from its ${l === 1 ? "nearest charger" : "2nd-nearest charger"}; the red house is ${fmt(v.radius)} away. Click the red one.`;
    };
}

/**
 * Level 4: farthest-first by hand (the first placement shown, then the player's
 * turn), the best placement as gold ghosts to make r* concrete, then the proof.
 */
export function gonzalezLesson(
    clients: readonly Point[],
    k: number,
    ffRadius: number,
    rstar: number,
): TourStep[] {
    const houses = gonzalez(clients, k + 1);
    return [
        {
            anchor: house(houses[0]),
            text: `Placing chargers by hand does not scale to big towns, so here is a rule a computer can follow. All ${k} chargers start stacked on me. Farthest-first places them one at a time: each goes to the house that is farthest from its nearest charger. Watch the first one.`,
        },
        {
            anchor: dock,
            enter: { showMe: true },
            text: "That house was the farthest, so it got a charger. Your turn: which house is now farthest from its nearest charger? Hover houses to compare (the last three stay labelled), click it, and repeat until all are placed.",
            waitFor: farthestGate(clients, 1),
        },
        {
            anchor: worstHouse,
            enter: { best: true },
            text: `All placed. I am the worst-off house: radius r = ${fmt(ffRadius)}. The gold ghosts show the best possible placement; its radius is called r* = ${fmt(rstar)}. Farthest-first is ${(ffRadius / rstar).toFixed(2)} times the best here.`,
        },
        ...proofLesson(k + 1, 1, k, ffRadius),
    ];
}

/** Level 5: singles first (worse here), then the twin rule, then the ℓ = 2 proof. */
export function twinsLesson(clients: readonly Point[], k: number): TourStep[] {
    const l = 2;
    const sites = gonzalez(clients, Math.floor(k / l) + 1);
    const singles = gonzalez(clients, k).map((i) => clients[i]);
    const es = evaluate(clients, singles, l);
    const twins = gonzalez(clients, Math.floor(k / l)).flatMap((i) => [
        clients[i],
        clients[i],
    ]);
    const rt = radius(clients, twins, l);
    const sorted = singles
        .map((p) => dist(clients[es.worstClient], p))
        .sort((a, b) => a - b);
    const pairsWin = rt < es.radius;
    // The start (all chargers on house 0) scores the same as the singles here: worth saying.
    const startR = radius(
        clients,
        Array.from({ length: k }, () => clients[0]),
        l,
    );
    const firstSingles = `First the ${k} singles, placed by farthest-first: radius r = ${fmt(es.radius)} at ℓ = 2.`;
    return [
        {
            anchor: dock,
            text: `${k} chargers, and every house needs ℓ = 2 within r. Which gives the smaller radius r: farthest-first with ${k} single chargers spread out, or with ${k / l} pairs (two chargers on one spot)?`,
            choices: [
                {
                    label: `${k} singles`,
                    reply: `We'll test both. ${firstSingles}`,
                    effect: { singles: true },
                },
                {
                    label: `${k / l} pairs`,
                    reply: `We'll test both. ${firstSingles}`,
                    effect: { singles: true },
                },
            ],
        },
        {
            anchor: house(es.worstClient),
            text:
                sorted[0] < EPS
                    ? `I am the worst-off house. My nearest charger is on me, but my 2nd-nearest is on another house, ${fmt(sorted[1])} away.${Math.abs(es.radius - startR) < 0.005 ? " Spreading the singles out did not lower r at all: it is the same as with every charger on the start house." : ""}`
                    : `I am the worst-off house: my nearest charger is ${fmt(sorted[0])} away, but my 2nd-nearest is on another house, ${fmt(sorted[1])} away.`,
        },
        {
            anchor: dock,
            enter: { restart: true },
            text: `Now pairs, by the twin rule: run farthest-first for ${k / l} places (half of ${k}) and put a pair on each. The start house keeps one pair of the stack. Click the house farthest from its nearest charger to send the next pair there.`,
            waitFor: farthestGate(clients, l),
        },
        {
            anchor: worstHouse,
            text: (v) => {
                const guess = v.answers[0];
                const verdict =
                    guess === undefined
                        ? ""
                        : (guess === 1) === pairsWin
                          ? " Your guess was right."
                          : " Not what you guessed.";
                return `My nearest and 2nd-nearest chargers are one pair, equally far. Singles ${fmt(es.radius)}, pairs ${fmt(v.radius)}: ${pairsWin ? "pairs win here" : "singles won this time"}.${verdict} And this paired version comes with a guarantee: never more than twice the best possible radius.`;
            },
        },
        ...proofLesson(sites.length, l, k, rt, true),
    ];
}

/** Level 6: the twin rule can only use houses, which costs up to 2× (paper Figure 9). */
export function twinbotLesson(botRadius: number, rstar: number): TourStep[] {
    return [
        {
            anchor: dock, // a bubble on the board would hide one of the rings
            enter: { revealBot: true },
            text: `The twin rule (purple ghosts) puts each pair on a house: farthest-first only picks houses. On these two circles of houses it gets radius r = ${fmt(botRadius)}. Where should a pair stand?`,
            choices: [
                {
                    label: "On a house",
                    reply: "Not quite: that is what the twin rule does, and it is why it loses here. From a house on the circle, the house opposite is a whole diameter away; from the middle, every house is just one radius away.",
                },
                {
                    label: "In the middle",
                    reply: "Yes: from the middle of a circle, every house on it is just one radius away.",
                },
            ],
        },
        {
            anchor: dock,
            text: `Beat ${fmt(botRadius)}: make two pairs (two chargers on one spot) and put one in the middle of each circle.`,
            waitFor: (v) => v.radius < botRadius - EPS,
        },
        {
            anchor: worstHouse,
            enter: { best: true },
            text: (v) =>
                `You beat it: ${fmt(v.radius)} against ${fmt(botRadius)}. The best possible (gold ghosts, a pair at each centre, where yours are) is r* = ${fmt(rstar)}. The twin rule got ${botRadius / rstar > 1.95 ? "exactly twice that" : `${(botRadius / rstar).toFixed(2)} times that`}: the most it can ever be off.`,
        },
    ];
}

/** After the last level: what the game taught, in four short steps. */
export function summarySteps(): TourStep[] {
    const box = { kind: "panel" as const, index: 0 };
    return [
        {
            anchor: box,
            text: "That's every level. What you learned: a placement is judged by its worst-off house; its distance to its charger is the radius r.",
        },
        {
            anchor: box,
            text: "With ℓ = 2, every house needs 2 chargers within r, so any one charger can break and every house is still served within r.",
        },
        {
            anchor: box,
            text: "Farthest-first sends each charger to the house farthest from its nearest charger. It is never more than twice the best radius: the discs argument.",
        },
        {
            anchor: box,
            text: "For ℓ = 2, the twin rule runs farthest-first and puts a pair on each place: the same guarantee. It only uses houses, which can cost it up to that factor of 2.",
        },
    ];
}
