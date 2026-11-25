import { describe, expect, it } from "vitest";
import { botLossSteps, failureSteps, wrongHouseSteps } from "./explain";
import {
    evaluate,
    lthNearestDist,
    radius,
    twinGonzalez,
    type Point,
} from "./geometry";
import { randomPoints, seeded } from "./random";

const B = { minX: -10, minY: -10, maxX: 10, maxY: 10 };

describe("botLossSteps", () => {
    it("is empty when the player is not worse than the bot", () => {
        const houses = randomPoints(seeded(1), 10, B, 1);
        const bot = twinGonzalez(houses, 3, 1);
        expect(botLossSteps(houses, bot, bot, 1)).toEqual([]);
    });

    it("walks the too-far houses worst first, then ends on the charger to move", () => {
        const rand = seeded(4);
        for (let t = 0; t < 30; t++) {
            const l = t % 2 === 0 ? 1 : 2;
            const houses = randomPoints(rand, 14, B, 1);
            const bot = twinGonzalez(houses, 4, l);
            const mine: Point[] = randomPoints(rand, 4, B, 1);
            const botR = evaluate(houses, bot, l).radius;
            const me = evaluate(houses, mine, l);
            const steps = botLossSteps(houses, mine, bot, l);
            if (me.radius <= botR) {
                expect(steps).toEqual([]);
                continue;
            }
            // First bubble: the worst house. Then houses still farther than the bot's r,
            // in decreasing order.
            const houseSteps = steps.filter(
                (s) =>
                    s.anchor.kind === "house" &&
                    !s.text.startsWith("Your plan"),
            );
            expect(houseSteps[0].anchor.index).toBe(me.worstClient);
            const d = houseSteps.map((s) =>
                lthNearestDist(houses[s.anchor.index], mine, l),
            );
            for (let i = 0; i < d.length; i++) {
                expect(d[i]).toBeGreaterThan(botR);
                if (i > 0) expect(d[i]).toBeLessThanOrEqual(d[i - 1]);
            }
            // Last bubble: the worst house's l-th nearest charger.
            expect(steps.at(-1)!.anchor).toEqual({
                kind: "charger",
                index: me.witnessFacility,
            });
        }
    });
});

describe("failureSteps with twins", () => {
    it("walks a twin stack once (breaking either twin is the same), then the house that sets r", () => {
        const houses = randomPoints(seeded(12), 10, B, 1);
        const a = houses[0];
        const b = houses[5];
        const chargers = [{ ...a }, { ...a }, { ...b }, { ...b }];
        const steps = failureSteps(houses, chargers, 2);
        expect(steps).toHaveLength(3); // one per stack + the closing step
        expect(steps.slice(0, 2).map((s) => s.breaks)).toEqual([0, 2]);
        expect(steps[0].text).toMatch(/Break either of us twins/);
    });
});

describe("wrongHouseSteps", () => {
    it("points at the clicked house, then at the farthest house", () => {
        const houses = randomPoints(seeded(2), 10, B, 1);
        const chargers = [houses[0]];
        const worst = evaluate(houses, chargers, 1).worstClient;
        const clicked = worst === 3 ? 4 : 3;
        const steps = wrongHouseSteps(houses, chargers, 1, clicked);
        expect(steps.map((s) => s.anchor.index)).toEqual([clicked, worst]);
    });
});

describe("failureSteps", () => {
    it("breaks each charger once and speaks from it; its red line never exceeds the planned radius", () => {
        const rand = seeded(8);
        for (let t = 0; t < 10; t++) {
            const houses = randomPoints(rand, 12, B, 1);
            const chargers = randomPoints(rand, 4, B, 1);
            const planned = radius(houses, chargers, 2);
            const steps = failureSteps(houses, chargers, 2);
            expect(steps).toHaveLength(chargers.length + 1);
            steps.slice(0, -1).forEach((s, i) => {
                expect(s.breaks).toBe(i);
                expect(s.anchor).toEqual({ kind: "charger", index: i });
                if (!s.highlight) return;
                // The highlighted house was closest to the broken charger, and its
                // red line goes to its nearest working charger, within the plan.
                const { house, charger } = s.highlight;
                expect(charger).not.toBe(i);
                const working = chargers.filter((_, j) => j !== i);
                const d = lthNearestDist(houses[house], working, 1);
                expect(d).toBeCloseTo(
                    lthNearestDist(houses[house], [chargers[charger]], 1),
                    12,
                );
                expect(d).toBeLessThanOrEqual(planned + 1e-9);
            });
        }
    });

    it("ends at the house that sets the planned radius: losing its nearest charger costs exactly r", () => {
        const rand = seeded(10);
        for (let t = 0; t < 10; t++) {
            const houses = randomPoints(rand, 12, B, 1);
            const chargers = randomPoints(rand, 4, B, 1);
            const plan = evaluate(houses, chargers, 2);
            const last = failureSteps(houses, chargers, 2).at(-1)!;
            expect(last.anchor).toEqual({
                kind: "house",
                index: plan.worstClient,
            });
            const working = chargers.filter((_, j) => j !== last.breaks);
            expect(
                lthNearestDist(houses[plan.worstClient], working, 1),
            ).toBeCloseTo(plan.radius, 12);
        }
    });
});
