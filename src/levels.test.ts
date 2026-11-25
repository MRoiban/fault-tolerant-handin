import { describe, expect, it } from "vitest";
import { gonzalez, radius, twinGonzalez } from "./geometry";
import { instantiate, isRandom, LEVELS } from "./levels";

describe("levels", () => {
    it("have unique ids", () => {
        expect(new Set(LEVELS.map((d) => d.id)).size).toBe(LEVELS.length);
    });

    for (const def of LEVELS) {
        describe(def.id, () => {
            const inst = instantiate(def, 12345);
            const k = inst.facilities.length;

            it("fits its bounds and has enough chargers for l", () => {
                for (const q of [...inst.clients, ...inst.facilities]) {
                    expect(q.x).toBeGreaterThanOrEqual(inst.bounds.minX);
                    expect(q.x).toBeLessThanOrEqual(inst.bounds.maxX);
                    expect(q.y).toBeGreaterThanOrEqual(inst.bounds.minY);
                    expect(q.y).toBeLessThanOrEqual(inst.bounds.maxY);
                }
                expect(k).toBeGreaterThanOrEqual(def.l);
                expect(k).toBeLessThanOrEqual(16);
            });

            if (def.best) {
                const best = def.best;
                it("stored best placement has k chargers and really achieves the stored r*", () => {
                    expect(best.facilities).toHaveLength(k);
                    expect(
                        radius(inst.clients, best.facilities, def.l),
                    ).toBeLessThanOrEqual(best.radius + 1e-4);
                });
                if (def.targetFactor !== undefined) {
                    it("does not start already at the goal", () => {
                        expect(
                            radius(inst.clients, inst.facilities, def.l),
                        ).toBeGreaterThan(def.targetFactor! * best.radius);
                    });
                }
            }

            if (!isRandom(def)) {
                it("is the same every time (fixed seed or fixed data)", () => {
                    const a = instantiate(def, 999);
                    const b = instantiate(def, 1);
                    expect([a.clients, a.facilities]).toEqual([
                        b.clients,
                        b.facilities,
                    ]);
                });
            }
        });
    }

    for (const def of LEVELS.filter((d) => d.tool === "gonzalez")) {
        it(`${def.id}: starts with every charger on house 0, and farthest-first ends within 2 × r*`, () => {
            const inst = instantiate(def, 1);
            expect(gonzalez(inst.clients, 1)).toEqual([0]);
            for (const f of inst.facilities) expect(f).toEqual(inst.clients[0]);
            const placed = twinGonzalez(
                inst.clients,
                inst.facilities.length,
                def.l,
            );
            expect(radius(inst.clients, placed, def.l)).toBeLessThanOrEqual(
                2 * def.best!.radius + 1e-9,
            );
        });
    }
});

describe("random level (bot)", () => {
    it("always has 16 houses", () => {
        const def = LEVELS.find((lv) => lv.id === "bot")!;
        for (let seed = 1; seed <= 200; seed++)
            expect(instantiate(def, seed).clients).toHaveLength(16);
    });
});
