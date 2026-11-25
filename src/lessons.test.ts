/**
 * PROTOTYPE tests: the lesson tours' do / predict steps, and the maths each lesson
 * states, on the actual level towns. Stored r* values come from the exact solver
 * (git show da7c547:src/optimum.ts); the 4-house level 2 is re-checked here by hand.
 */
import { packEnclose } from "d3-hierarchy";
import { describe, expect, it } from "vitest";
import type { TourStep, TourView } from "./explain";
import { failureSteps, isInteractive } from "./explain";
import {
    dist,
    evaluate,
    gonzalez,
    radius,
    twinGonzalez,
    type Point,
} from "./geometry";
import {
    backupsLesson,
    coverLesson,
    failuresLesson,
    gonzalezLesson,
    twinbotLesson,
    twinsLesson,
    summarySteps,
} from "./lessons";
import { instantiate, LEVELS } from "./levels";

const inst = (id: string) =>
    instantiate(
        LEVELS.find((d) => d.id === id)!,
        1,
    );
const target = (id: string) => {
    const d = LEVELS.find((x) => x.id === id)!;
    return d.targetFactor! * d.best!.radius;
};

/** A TourView for the given chargers; counters default to "nothing happened". */
function tv(
    clients: readonly Point[],
    facilities: Point[],
    l: number,
    extra: Partial<TourView> = {},
): TourView {
    const e = evaluate(clients, facilities, l);
    return {
        clients,
        facilities,
        failed: facilities.map(() => false),
        l,
        radius: e.radius,
        worstClient: e.worstClient,
        witnessFacility: e.witnessFacility,
        after: null,
        tapped: -1,
        wrongHouse: -1,
        drags: 0,
        steps: 0,
        totalSteps: 0,
        answers: [],
        ...extra,
    };
}

const gate = (s: TourStep, v: TourView) => s.waitFor!(v);

describe("level 1 lesson: do steps", () => {
    const { clients, facilities } = inst("cover");
    const steps = coverLesson(clients, facilities, target("cover"));
    const e = evaluate(clients, facilities, 1);

    it("is a lesson (do steps keep it open while dragging)", () => {
        expect(isInteractive(steps)).toBe(true);
    });
    it("step 1 waits for a click on the worst house's nearest charger; a wrong one says why", () => {
        const wrong = [0, 1, 2].find((i) => i !== e.witnessFacility)!;
        expect(gate(steps[1], tv(clients, facilities, 1))).toBe(false);
        expect(
            gate(steps[1], tv(clients, facilities, 1, { tapped: wrong })),
        ).toMatch(/My nearest is/);
        expect(
            gate(
                steps[1],
                tv(clients, facilities, 1, { tapped: e.witnessFacility }),
            ),
        ).toBe(true);
    });
    it("step 2 moves on only after a drag that lowers the radius r", () => {
        const f = e.witnessFacility;
        const toward = facilities.map((p, i) =>
            i === f
                ? {
                      x: (p.x + clients[e.worstClient].x) / 2,
                      y: (p.y + clients[e.worstClient].y) / 2,
                  }
                : p,
        );
        expect(gate(steps[2], tv(clients, facilities, 1))).toBe(false);
        expect(gate(steps[2], tv(clients, toward, 1, { drags: 1 }))).toBe(true);
    });
    it("step 4 waits for the goal", () => {
        const best = LEVELS[0].best!.facilities;
        expect(gate(steps[4], tv(clients, facilities, 1))).toBe(false);
        expect(gate(steps[4], tv(clients, best, 1))).toBe(true);
    });
});

describe("level 2: the paper's Observation 2 (village of 3 + lone house, k = 4)", () => {
    const { clients, facilities } = inst("backups");
    const def = LEVELS.find((d) => d.id === "backups")!;
    const village = clients.slice(0, 3);
    const mec = packEnclose(village.map((q) => ({ ...q, r: 0 })));

    it("r* is the village's smallest enclosing circle (twin there + twin on the lone house)", () => {
        // Lower bound: the lone house needs 2 chargers within r*; they are too far to
        // help the village, so the other 2 must each cover all 3 village houses.
        const lone = clients[3];
        expect(Math.min(...village.map((p) => dist(p, lone)))).toBeGreaterThan(
            2 * mec.r + 2 * mec.r,
        );
        expect(def.best!.radius).toBeCloseTo(mec.r, 9);
        const plan = [mec, mec, lone, lone].map((p) => ({ x: p.x, y: p.y }));
        expect(radius(clients, plan, 2)).toBeCloseTo(mec.r, 9);
    });
    it("one charger per house: small at ℓ = 1, about 5 × r* at ℓ = 2", () => {
        expect(radius(clients, facilities, 1)).toBeLessThan(1);
        expect(radius(clients, facilities, 2)).toBeGreaterThan(
            4.9 * def.best!.radius,
        );
    });
    it("the predict step switches ℓ to 2; the twin step waits for a stack at the lone house", () => {
        const steps = backupsLesson(clients, facilities, target("backups"));
        expect(steps[1].choices!.every((c) => c.effect?.setL === 2)).toBe(true);
        expect(gate(steps[3], tv(clients, facilities, 2))).toBe(false);
        const twin = facilities.map((p, i) =>
            i === 0 ? { ...facilities[3] } : p,
        );
        expect(gate(steps[3], tv(clients, twin, 2))).toBe(true);
        // After the twin the village is the problem: still above the goal...
        expect(radius(clients, twin, 2)).toBeGreaterThan(target("backups"));
        expect(gate(steps[4], tv(clients, twin, 2, { drags: 2 }))).toMatch(
            /Stack/,
        );
        // ...and a second twin on the village's centre reaches it.
        const both = [
            twin[0],
            { x: mec.x, y: mec.y },
            { x: mec.x, y: mec.y },
            twin[3],
        ];
        expect(gate(steps[4], tv(clients, both, 2))).toBe(true);
    });
    it("the goal leaves room for a hand-placed stack (≥ 0.3 units off the centre)", () => {
        const off = { x: mec.x + 0.3, y: mec.y };
        const plan = [off, off, clients[3], clients[3]];
        expect(radius(clients, plan, 2)).toBeLessThanOrEqual(target("backups"));
    });
});

describe("level 3: the charger the lesson asks you to break", () => {
    it("is one whose failure would push a house beyond r had only ℓ = 1 been planned", () => {
        const { clients, facilities } = inst("failures");
        const steps = failuresLesson(clients, facilities, target("failures"));
        const breakStep = steps.find((s) => s.waitFor)!;
        const i = (breakStep.anchor as { index: number }).index;
        const r1 = radius(clients, facilities, 1);
        const after = radius(
            clients,
            facilities.filter((_, j) => j !== i),
            1,
        );
        expect(after).toBeGreaterThan(r1 + 0.01);
    });
});

describe("summary after the last level", () => {
    it("recaps the four ideas in four steps under the goal box", () => {
        const steps = summarySteps();
        expect(steps).toHaveLength(4);
        expect(
            steps.every((s) => (s.anchor as { kind: string }).kind === "panel"),
        ).toBe(true);
    });
});

describe("level 3 lesson", () => {
    const { clients, facilities } = inst("failures");
    it("step 1 waits for a broken charger; the failure walk marks the placement tested", () => {
        const steps = failuresLesson(clients, facilities, target("failures"));
        expect(gate(steps[1], tv(clients, facilities, 2))).toBe(false);
        const failed = facilities.map((_, i) => i === 1);
        expect(gate(steps[1], tv(clients, facilities, 2, { failed }))).toBe(
            true,
        );
        const walk = failureSteps(clients, facilities, 2);
        expect(walk.at(-1)!.enter?.tested).toBe(true);
        expect(walk.slice(0, -1).some((s) => s.enter?.tested)).toBe(false);
    });
});

describe("the disc proof (Theorem 8) on the actual level towns", () => {
    for (const id of ["gonzalez", "twins"]) {
        it(`${id}: k'+1 houses pairwise ≥ r apart (so r/2 discs are disjoint) and (k'+1)·ℓ > k`, () => {
            const { clients, facilities, def } = inst(id);
            const k = facilities.length;
            const kp = Math.floor(k / def.l);
            const r = radius(clients, twinGonzalez(clients, k, def.l), def.l);
            const houses = gonzalez(clients, kp + 1);
            expect(houses).toHaveLength(kp + 1);
            for (let i = 0; i < houses.length; i++)
                for (let j = i + 1; j < houses.length; j++)
                    expect(
                        dist(clients[houses[i]], clients[houses[j]]),
                    ).toBeGreaterThanOrEqual(r - 1e-9);
            expect((kp + 1) * def.l).toBeGreaterThan(k);
            expect(r).toBeLessThanOrEqual(2 * def.best!.radius + 1e-9);
        });
    }
    it("the proof asks for the count with real numbers: 6 for level 4, 8 for level 5", () => {
        const { clients, def } = inst("gonzalez");
        const l4 = gonzalezLesson(clients, 5, 5.77, def.best!.radius);
        const q4 = l4.at(-1)!;
        expect(q4.choices!.map((c) => c.label)).toEqual(["5", "6", "12"]);
        expect(q4.text).toMatch(/below 2\.88/); // r/2 with r = 5.77
        expect(q4.choices!.every((c) => c.effect?.proofDone)).toBe(true);
        // The best placement is shown (as ghosts) before the proof hides it.
        expect(l4.some((s) => s.enter?.best === true)).toBe(true);
        expect(l4.at(-2)!.enter).toEqual({ discs: true, best: false });
        // No step asks for a meaningless guess: the only choose step is the count.
        expect(l4.filter((s) => s.choices)).toHaveLength(1);
        const q5 = twinsLesson(inst("twins").clients, 6).at(-1)!;
        expect(q5.choices!.map((c) => c.label)).toContain("8"); // 4 discs × 2
        expect(q5.choices!.every((c) => c.effect?.proofDone)).toBe(true);
    });
});

describe("level 5 (seed 134): singles vs twins", () => {
    const { clients } = inst("twins");
    const rstar = LEVELS.find((d) => d.id === "twins")!.best!.radius;
    const singles = gonzalez(clients, 6).map((i) => clients[i]);
    const s = evaluate(clients, singles, 2);
    const twins = radius(clients, twinGonzalez(clients, 6, 2), 2);

    it("plain farthest-first with 6 singles is clearly worse than the twin rule here", () => {
        expect(s.radius).toBeGreaterThan(1.8 * twins);
        expect(s.radius).toBeGreaterThan(2 * rstar); // singles have no 2× promise
        expect(twins).toBeLessThanOrEqual(2 * rstar);
    });
    it("the reveal says whether the player's guess was right", () => {
        const { clients, facilities } = inst("twins");
        const lesson = twinsLesson(clients, 6);
        const reveal = lesson.find(
            (s) => typeof s.text === "function" && !s.waitFor,
        )!;
        const say = (answers: (number | undefined)[]) =>
            (reveal.text as (v: ReturnType<typeof tv>) => string)(
                tv(clients, facilities, 2, { answers }),
            );
        expect(say([1])).toMatch(/pairs win here\. Your guess was right/); // guessed pairs
        expect(say([0])).toMatch(/Not what you guessed/); // guessed singles
        expect(say([])).not.toMatch(/guess/);
    });
    it("its worst house sits on a charger: the 2nd-nearest is on another house", () => {
        const d = singles
            .map((p) => dist(clients[s.worstClient], p))
            .sort((a, b) => a - b);
        expect(d[0]).toBe(0);
        expect(d[1]).toBeCloseTo(s.radius, 9);
        const step = twinsLesson(clients, 6)[1];
        expect(step.text).toMatch(/on another house, 12\.60 away/);
    });
});

describe("level 6: two copies of the paper's Figure 9", () => {
    it("the twin rule is (almost exactly) 2 × r*, and the lesson waits for a better radius r", () => {
        const { clients, facilities, def } = inst("twinbot");
        const bot = radius(clients, twinGonzalez(clients, 4, 2), 2);
        expect(bot / def.best!.radius).toBeGreaterThan(1.99);
        const steps = twinbotLesson(bot, def.best!.radius);
        expect(gate(steps[1], tv(clients, facilities, 2))).toBe(false);
        expect(gate(steps[1], tv(clients, def.best!.facilities, 2))).toBe(true);
    });
});
