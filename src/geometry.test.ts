import { packEnclose } from "d3-hierarchy";
import { describe, expect, it } from "vitest";
import {
    clampToBounds,
    evaluate,
    gonzalez,
    lthNearestDist,
    lthNearestIndex,
    radius,
    twinGonzalez,
    worstClient,
    type Point,
} from "./geometry";
import { randomPoints, seeded } from "./random";

const p = (x: number, y: number): Point => ({ x, y });
const B = { minX: -10, minY: -10, maxX: 10, maxY: 10 };

/** Smallest circle around `pts` (d3-hierarchy), i.e. the best radius for one charger. */
function mec(pts: Point[]): number {
    return pts.length === 0
        ? 0
        : packEnclose(pts.map((q) => ({ ...q, r: 0 }))).r;
}

/** Best radius for 1 or 2 chargers (l = 1), by trying every way to split the houses in two. */
function bruteForceOptimum(pts: Point[], k: 1 | 2): number {
    if (k === 1) return mec(pts);
    let best = Infinity;
    for (let mask = 0; mask < 1 << (pts.length - 1); mask++) {
        const a = pts.filter((_, i) => mask & (1 << i));
        const b = pts.filter((_, i) => !(mask & (1 << i)));
        best = Math.min(best, Math.max(mec(a), mec(b)));
    }
    return best;
}

/**
 * Best radius for k chargers when every house needs l of them (brute force, few houses).
 * Each charger serves a set of houses and is best at the centre of their smallest
 * circle, so try every multiset of k house sets that covers each house l times.
 */
function bruteForceFaultTolerant(pts: Point[], k: number, l: number): number {
    const n = pts.length;
    const sets = Array.from({ length: (1 << n) - 1 }, (_, m) => ({
        mask: m + 1,
        cost: mec(pts.filter((_, i) => (m + 1) & (1 << i))),
    })).sort((a, b) => a.cost - b.cost);
    const count = new Array<number>(n).fill(0);
    let best = Infinity;
    const choose = (from: number, left: number, worst: number): void => {
        if (left === 0) {
            if (count.every((c) => c >= l)) best = worst;
            return;
        }
        for (let s = from; s < sets.length && sets[s].cost < best; s++) {
            const { mask, cost } = sets[s];
            for (let i = 0; i < n; i++) if (mask & (1 << i)) count[i]++;
            choose(s, left - 1, Math.max(worst, cost));
            for (let i = 0; i < n; i++) if (mask & (1 << i)) count[i]--;
        }
    };
    choose(0, k, 0);
    return best;
}

describe("lthNearestDist", () => {
    const fs = [p(0, 0), p(3, 0), p(0, 10)];

    it("l = 1 is the nearest facility, l = 2 the second nearest", () => {
        expect(lthNearestDist(p(1, 0), fs, 1)).toBe(1);
        expect(lthNearestDist(p(1, 0), fs, 2)).toBe(2);
        expect(lthNearestIndex(p(1, 0), fs, 2)).toBe(1);
    });

    it("is Infinity when there are fewer than l facilities", () => {
        expect(lthNearestDist(p(0, 0), [p(1, 1)], 2)).toBe(Infinity);
        expect(lthNearestDist(p(0, 0), [], 1)).toBe(Infinity);
        expect(lthNearestIndex(p(0, 0), [p(1, 1)], 2)).toBe(-1);
    });

    it("counts facilities on the same spot separately", () => {
        const stacked = [p(5, 5), p(5, 5), p(0, 0)];
        expect(lthNearestDist(p(0, 0), stacked, 2)).toBeCloseTo(
            Math.hypot(5, 5),
        );
        expect(lthNearestDist(p(5, 5), stacked, 2)).toBe(0);
    });
});

describe("radius / worstClient / evaluate", () => {
    const clients = [p(0, 0), p(10, 0), p(4, 0)];
    const fs = [p(0, 0), p(9, 0)];

    it("takes the worst client", () => {
        expect(radius(clients, fs, 1)).toBe(4); // (4,0) -> (0,0)
        expect(worstClient(clients, fs, 1)).toBe(2);
    });

    it("l = 2 uses the second nearest facility", () => {
        // distances: (0,0)->9, (10,0)->10, (4,0)->5
        expect(evaluate(clients, fs, 2)).toEqual({
            radius: 10,
            worstClient: 1,
            witnessFacility: 0,
        });
    });

    it("removing (failing) a facility never lowers r", () => {
        expect(radius(clients, [fs[0]], 1)).toBeGreaterThanOrEqual(
            radius(clients, fs, 1),
        );
    });

    it("with l = 2, losing any one facility leaves l = 1 radius <= the l = 2 radius", () => {
        const rand = seeded(3);
        const houses = randomPoints(rand, 12, B, 1);
        const chargers = randomPoints(rand, 4, B, 1);
        const r2 = radius(houses, chargers, 2);
        chargers.forEach((_, i) => {
            expect(
                radius(
                    houses,
                    chargers.filter((_, j) => j !== i),
                    1,
                ),
            ).toBeLessThanOrEqual(r2);
        });
    });

    it("handles no clients and too few facilities", () => {
        expect(radius([], fs, 1)).toBe(0);
        expect(worstClient([], fs, 1)).toBe(-1);
        expect(radius(clients, [p(0, 0)], 2)).toBe(Infinity);
    });
});

describe("gonzalez", () => {
    it("starts at `first`, then takes the farthest client each time", () => {
        const pts = [p(0, 0), p(1, 0), p(10, 0), p(5, 0)];
        expect(gonzalez(pts, 3)).toEqual([0, 2, 3]);
        expect(gonzalez(pts, 2, 2)).toEqual([2, 0]);
    });

    it("stops early when every client is a centre; handles k <= 0 and no clients", () => {
        expect(gonzalez([p(1, 1), p(1, 1), p(2, 2)], 5)).toEqual([0, 2]);
        expect(gonzalez([p(1, 1)], 0)).toEqual([]);
        expect(gonzalez([], 3)).toEqual([]);
    });

    it("is within 2x the optimum (brute force, k = 1 and 2)", () => {
        const rand = seeded(7);
        for (let t = 0; t < 30; t++) {
            const pts = randomPoints(rand, 9, B, 1);
            const k = t % 2 === 0 ? 1 : 2;
            const r = radius(
                pts,
                gonzalez(pts, k).map((i) => pts[i]),
                1,
            );
            const opt = bruteForceOptimum(pts, k);
            expect(r).toBeGreaterThanOrEqual(opt - 1e-9);
            expect(r).toBeLessThanOrEqual(2 * opt + 1e-9);
        }
    });
});

describe("clampToBounds", () => {
    it("clamps in place", () => {
        const q = p(12, -11);
        clampToBounds(q, B);
        expect(q).toEqual({ x: 10, y: -10 });
    });
});

describe("twinGonzalez (fault-tolerant farthest-first)", () => {
    it("puts l chargers on each of the k/l farthest-first centres", () => {
        const pts = [p(0, 0), p(1, 0), p(10, 0), p(5, 0)];
        expect(twinGonzalez(pts, 4, 2)).toEqual([
            p(0, 0),
            p(0, 0),
            p(10, 0),
            p(10, 0),
        ]);
        expect(twinGonzalez(pts, 3, 1)).toEqual(
            gonzalez(pts, 3).map((i) => pts[i]),
        );
        expect(twinGonzalez(pts, 5, 2)).toHaveLength(5); // the leftover goes on the first centre
    });

    it("its l = 2 radius equals plain farthest-first with k/2 centres", () => {
        const rand = seeded(11);
        for (let t = 0; t < 20; t++) {
            const pts = randomPoints(rand, 10, B, 1);
            const plain = radius(
                pts,
                gonzalez(pts, 2).map((i) => pts[i]),
                1,
            );
            expect(radius(pts, twinGonzalez(pts, 4, 2), 2)).toBeCloseTo(
                plain,
                12,
            );
        }
    });

    it("k = l = 2 is within 2x the optimum (the smallest enclosing circle)", () => {
        const rand = seeded(5);
        for (let t = 0; t < 20; t++) {
            const pts = randomPoints(rand, 9, B, 1);
            expect(radius(pts, twinGonzalez(pts, 2, 2), 2)).toBeLessThanOrEqual(
                2 * mec(pts) + 1e-9,
            );
        }
    });
});

describe("twin rule vs the exact optimum (paper Theorem 8)", () => {
    it("brute force agrees with the smallest enclosing circle when k = l = 2", () => {
        const pts = randomPoints(seeded(3), 5, B, 1);
        expect(bruteForceFaultTolerant(pts, 2, 2)).toBeCloseTo(mec(pts), 9);
    });

    it("is within 2x the best l = 2 radius (random towns, k = 4 and 5)", () => {
        const rand = seeded(13);
        for (let t = 0; t < 12; t++) {
            const pts = randomPoints(rand, 6, B, 1);
            const k = t % 2 === 0 ? 4 : 5;
            const opt = bruteForceFaultTolerant(pts, k, 2);
            const r = radius(pts, twinGonzalez(pts, k, 2), 2);
            expect(r).toBeGreaterThanOrEqual(opt - 1e-9);
            expect(r).toBeLessThanOrEqual(2 * opt + 1e-9);
        }
    });
});

describe("fault tolerance", () => {
    it("the l = 2 radius is exactly the worst l = 1 radius over any single failure", () => {
        const rand = seeded(9);
        for (let t = 0; t < 20; t++) {
            const houses = randomPoints(rand, 12, B, 1);
            const chargers = randomPoints(rand, 4, B, 1);
            const worstSingleFailure = Math.max(
                ...chargers.map((_, i) =>
                    radius(
                        houses,
                        chargers.filter((_, j) => j !== i),
                        1,
                    ),
                ),
            );
            expect(worstSingleFailure).toBeCloseTo(
                radius(houses, chargers, 2),
                12,
            );
        }
    });

    it("after one failure, every house's nearest working charger is within the planned l = 2 radius", () => {
        const rand = seeded(21);
        for (let t = 0; t < 20; t++) {
            const houses = randomPoints(rand, 12, B, 1);
            const chargers = randomPoints(rand, 5, B, 1);
            const planned = radius(houses, chargers, 2);
            chargers.forEach((_, i) => {
                const working = chargers.filter((_, j) => j !== i);
                expect(radius(houses, working, 1)).toBeLessThanOrEqual(
                    planned + 1e-12,
                );
            });
        }
    });
});
