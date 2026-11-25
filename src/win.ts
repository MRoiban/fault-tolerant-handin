/**
 * When is a level finished? Pure, so it can be unit-tested.
 * Some levels also require an explanation to have been worked through
 * (the failure walk on the final placement, the disc proof).
 */
import { radius, type Point } from "./geometry";
import type { LevelDef } from "./levels";

/** The same chargers in any order (as a multiset): changes when any charger moves. */
export function placementKey(ps: readonly Point[]): string {
    return ps
        .map((p) => `${p.x},${p.y}`)
        .sort()
        .join(";");
}

export interface WinView {
    def: LevelDef;
    clients: readonly Point[];
    facilities: readonly Point[];
    /** The ℓ in play; level 2 starts at ℓ = 1, which must not count as a win. */
    l: number;
    steps: number;
    totalSteps: number;
    atFarthestFirst: boolean;
    botRevealed: boolean;
    botRadius: number;
    /** Placement key saved when a failure walk reached its last step, or null. */
    testedKey: string | null;
    /** Fill-the-discs proof finished on this level. */
    proofDone: boolean;
}

export function levelWon(v: WinView): boolean {
    const { def } = v;
    if (v.l !== def.l) return false;
    const r = radius(v.clients, v.facilities, def.l);
    const needs = def.requires ?? [];
    if (needs.includes("tested") && v.testedKey !== placementKey(v.facilities))
        return false;
    if (needs.includes("proof") && !v.proofDone) return false;
    if (def.tool === "gonzalez")
        return v.steps >= v.totalSteps && v.atFarthestFirst;
    if (def.tool === "bot") return v.botRevealed && r < v.botRadius - 1e-9;
    if (def.targetFactor && def.best)
        return r <= def.targetFactor * def.best.radius + 1e-9;
    return false;
}
