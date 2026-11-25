// Checks the NP-hardness widgets in report/widgets against the paper (Section 5): the
// solvers between their solver:start/end markers are extracted and run here.
import ringHtml from "../report/source/widgets/variable-ring.html?raw";
import clauseHtml from "../report/source/widgets/clause.html?raw";
import { describe, expect, it } from "vitest";

const solver = (html: string, names: string[]) => {
    const code = html.slice(
        html.indexOf("// solver:start"),
        html.indexOf("// solver:end"),
    );
    return new Function(`${code}; return { ${names.join(", ")} };`)();
};
const { ringGeometry, discCounts, solutions, encodes } = solver(ringHtml, [
    "ringGeometry",
    "discCounts",
    "solutions",
    "encodes",
]);
const { REGIONS, clauseCounts, clauseSolutions } = solver(clauseHtml, [
    "REGIONS",
    "clauseCounts",
    "clauseSolutions",
]);

type P = { x: number; y: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

describe("variable ring (Lemmas 3-5)", () => {
    it("each disc meets exactly its two neighbours on either side; spot j lies in exactly C_j, C_j+1, C_j+2", () => {
        for (const m of [2, 3, 4, 5]) {
            const { r, rho, centres, spots } = ringGeometry(m);
            for (let i = 0; i < r; i++) {
                const meets = centres
                    .map(
                        (c: P, j: number) =>
                            j !== i && dist(c, centres[i]) <= 2 * rho,
                    )
                    .flatMap((b: boolean, j: number) => (b ? [j] : []));
                const want = [1, 2, r - 2, r - 1]
                    .map((s) => (i + s) % r)
                    .sort((a, b) => a - b);
                expect(meets).toEqual(want);
            }
            spots.forEach((s: P, j: number) => {
                const inside = centres.flatMap((c: P, i: number) =>
                    dist(c, s) <= rho + 1e-12 ? [i] : [],
                );
                expect(inside).toEqual(
                    [j, (j + 1) % r, (j + 2) % r].sort((a, b) => a - b),
                );
            });
        }
    });

    it("2m points are needed (none with 2m - 1, even with any number of points per spot)", () => {
        for (const m of [2, 3]) {
            const r = 3 * m;
            // Any point lies in at most three consecutive discs, so a spot covering those three
            // is at least as good: searching over spots is enough. Allow any multiplicity.
            let found = false;
            const counts = new Array(r).fill(0);
            const rec = (j: number, left: number) => {
                if (found) return;
                if (j === r) {
                    if (
                        left === 0 &&
                        discCounts(counts).every((c: number) => c >= 2)
                    )
                        found = true;
                    return;
                }
                for (let c = 0; c <= left; c++) {
                    counts[j] = c;
                    rec(j + 1, left - c);
                }
                counts[j] = 0;
            };
            rec(0, 2 * m - 1);
            expect(found).toBe(false);
            expect(solutions(r, 2 * m).length).toBeGreaterThan(0);
        }
    });

    it("with 2m points: exactly six solutions, each disc holds exactly two, three encode true and three false", () => {
        for (const m of [2, 3, 4]) {
            const r = 3 * m;
            const sols = solutions(r, 2 * m);
            expect(sols.length).toBe(6);
            for (const s of sols)
                expect(discCounts(s).every((c: number) => c === 2)).toBe(true);
            const enc = sols.map(encodes);
            expect(enc.filter((e: { value: boolean }) => e.value).length).toBe(
                3,
            );
            expect(
                enc.filter((e: { doubled: boolean }) => e.doubled).length,
            ).toBe(3);
            // The paper's patterns: doubled on q_j, q_j+3, ... and singles on q_j, q_j+1, q_j+3, q_j+4, ...
            for (const s of sols) {
                const e = encodes(s);
                const expected = Array.from({ length: r }, (_, i) =>
                    e.doubled
                        ? (i - e.j) % 3 === 0
                            ? 2
                            : 0
                        : (((i - e.j) % 3) + 3) % 3 === 2
                          ? 0
                          : 1,
                );
                expect(s).toEqual(expected);
            }
        }
    });
});

describe("clause gadget (Observation 4)", () => {
    it("the regions cover each disc as drawn: the centre, three touching points, three black discs", () => {
        expect(REGIONS.length).toBe(7);
        expect(clauseCounts([false, false, false], [])).toEqual([0, 1, 1, 1]);
        expect(clauseCounts([true, false, true], [1])).toEqual([1, 3, 1, 2]);
    });

    it("two extra points 2-stab all four discs exactly when at least one literal is true", () => {
        for (let mask = 0; mask < 8; mask++) {
            const truth = [0, 1, 2].map((i) => Boolean(mask & (1 << i)));
            const sols = clauseSolutions(truth);
            expect(sols.length > 0).toBe(truth.some(Boolean));
        }
    });
});
