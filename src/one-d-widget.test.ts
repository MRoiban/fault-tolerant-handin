// Checks the solver inside the report's 1D widget (between its solver:start/end markers):
// against a DP, and against the fault-tolerant brute force (the claim of Theorem 2).
import html from "../report/source/widgets/one-d.html?raw";
import { packEnclose } from "d3-hierarchy";
import { describe, expect, it } from "vitest";
import { seeded } from "./random";

const code = html.slice(
    html.indexOf("// solver:start"),
    html.indexOf("// solver:end"),
);
const { kCentre1D, faultTolerant1D } = new Function(
    code + "; return { kCentre1D, faultTolerant1D };",
)();

/** Independent: DP over contiguous runs of the sorted points. */
function dp(xs: number[], kappa: number): number {
    const s = [...xs].sort((a, b) => a - b);
    const n = s.length;
    const best: number[][] = Array.from({ length: kappa + 1 }, () =>
        new Array(n + 1).fill(Infinity),
    );
    best[0][0] = 0;
    for (let c = 1; c <= kappa; c++) {
        best[c][0] = 0;
        for (let j = 1; j <= n; j++)
            for (let i = 0; i < j; i++)
                best[c][j] = Math.min(
                    best[c][j],
                    Math.max(best[c - 1][i], (s[j - 1] - s[i]) / 2),
                );
    }
    return best[kappa][n];
}
const mec = (pts: { x: number; y: number }[]) =>
    pts.length ? packEnclose(pts.map((q) => ({ ...q, r: 0 }))).r : 0;
/** Same fault-tolerant brute force as geometry.test.ts (any multiset of k house sets). */
function ftBrute(xs: number[], k: number, l: number): number {
    const pts = xs.map((x) => ({ x, y: 0 }));
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
const covers = (xs: number[], centres: number[], r: number) =>
    xs.every((x) => centres.some((c) => Math.abs(c - x) <= r + 1e-9));

describe("one-d widget solver", () => {
    it("matches the DP on random instances, and its centres cover within the radius", () => {
        const rnd = seeded(5);
        for (let t = 0; t < 400; t++) {
            const n = 1 + Math.floor(rnd() * 12);
            const xs = Array.from(
                { length: n },
                () => Math.round(rnd() * 100) / 10,
            );
            if (rnd() < 0.3) xs.push(xs[0]); // coincident clients
            const kappa = 1 + Math.floor(rnd() * (xs.length + 2)); // includes kappa >= n
            const got = kCentre1D(xs, kappa);
            expect(got.radius).toBeCloseTo(
                dp(xs, Math.min(kappa, xs.length)),
                9,
            );
            expect(got.centers.length).toBe(kappa);
            expect(covers(xs, got.centers, got.radius)).toBe(true);
        }
    });
    it("l copies of the floor(k/l)-centre equal the fault-tolerant optimum (Theorem 2)", () => {
        const rnd = seeded(11);
        for (let t = 0; t < 60; t++) {
            const n = 2 + Math.floor(rnd() * 4); // tiny: the brute force is exponential
            const xs = Array.from(
                { length: n },
                () => Math.round(rnd() * 100) / 10,
            );
            const l = 1 + Math.floor(rnd() * 3);
            const k = l + Math.floor(rnd() * 3); // l <= k, often not a multiple of l
            const ft = faultTolerant1D(xs, k, l);
            expect(ft.kPrime * l + ft.spare).toBe(k);
            expect(ft.radius).toBeCloseTo(ftBrute(xs, k, l), 9);
        }
    });
});
