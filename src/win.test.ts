import { describe, expect, it } from "vitest";
import { radius, twinGonzalez, type Point } from "./geometry";
import { instantiate, LEVELS } from "./levels";
import { levelWon, placementKey, type WinView } from "./win";

const def = (id: string) => LEVELS.find((d) => d.id === id)!;

/** A win view for a level with chargers at `facilities` (defaults: nothing done yet). */
function view(
    id: string,
    facilities: Point[],
    extra: Partial<WinView> = {},
): WinView {
    const inst = instantiate(def(id), 1);
    return {
        def: inst.def,
        clients: inst.clients,
        facilities,
        l: inst.def.l,
        steps: 0,
        totalSteps: 0,
        atFarthestFirst: false,
        botRevealed: false,
        botRadius: Infinity,
        testedKey: null,
        proofDone: false,
        ...extra,
    };
}

describe("placementKey", () => {
    it("ignores order, changes when any charger moves", () => {
        const a = [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
        ];
        expect(placementKey(a)).toBe(placementKey([a[1], a[0]]));
        expect(placementKey(a)).not.toBe(
            placementKey([a[0], { x: 3, y: 4.001 }]),
        );
    });
});

describe("levelWon (prototype rules)", () => {
    it("level 2 does not count as won at its starting ℓ = 1, only at ℓ = 2", () => {
        const best = def("backups").best!.facilities;
        expect(levelWon(view("backups", best))).toBe(true);
        expect(levelWon(view("backups", best, { l: 1 }))).toBe(false);
        // The start (one charger per house) is tiny at ℓ = 1 but not a win.
        const start = instantiate(def("backups"), 1).facilities;
        expect(levelWon(view("backups", start, { l: 1 }))).toBe(false);
    });

    it("level 3 needs the goal AND a failure walk on that exact placement", () => {
        const best = def("failures").best!.facilities.map((p) => ({ ...p }));
        expect(levelWon(view("failures", best))).toBe(false); // goal, no walk
        const tested = placementKey(best);
        expect(levelWon(view("failures", best, { testedKey: tested }))).toBe(
            true,
        );
        // Move one charger after the walk: no longer counts.
        const moved = best.map((p, i) =>
            i === 3 ? { x: p.x + 0.5, y: p.y } : p,
        );
        expect(levelWon(view("failures", moved, { testedKey: tested }))).toBe(
            false,
        );
        // Walk on the starting placement, then reach the goal: doesn't count.
        const start = instantiate(def("failures"), 1).facilities;
        expect(
            levelWon(
                view("failures", best, { testedKey: placementKey(start) }),
            ),
        ).toBe(false);
        // A walk on a placement that misses the goal doesn't win either.
        expect(
            levelWon(
                view("failures", start, { testedKey: placementKey(start) }),
            ),
        ).toBe(false);
    });

    for (const id of ["gonzalez", "twins"]) {
        it(`${id} needs farthest-first finished AND the disc proof`, () => {
            const inst = instantiate(def(id), 1);
            const ff = twinGonzalez(
                inst.clients,
                inst.facilities.length,
                inst.def.l,
            );
            const done = { steps: 2, totalSteps: 2, atFarthestFirst: true };
            expect(levelWon(view(id, ff, done))).toBe(false);
            expect(levelWon(view(id, ff, { ...done, proofDone: true }))).toBe(
                true,
            );
            expect(
                levelWon(
                    view(id, ff, {
                        ...done,
                        proofDone: true,
                        atFarthestFirst: false,
                    }),
                ),
            ).toBe(false);
        });
    }

    it("level 6 wins below the twin rule once it is revealed", () => {
        const inst = instantiate(def("twinbot"), 1);
        const bot = twinGonzalez(inst.clients, 4, 2);
        const botRadius = radius(inst.clients, bot, 2);
        const best = def("twinbot").best!.facilities;
        expect(levelWon(view("twinbot", best, { botRadius }))).toBe(false);
        expect(
            levelWon(view("twinbot", best, { botRadius, botRevealed: true })),
        ).toBe(true);
    });
});
