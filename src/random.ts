import PoissonDiskSampling from "poisson-disk-sampling";
import seedrandom from "seedrandom";
import type { Bounds, Point } from "./geometry";

export type Rand = () => number;

/** Reproducible random numbers in [0, 1): the same seed always gives the same sequence. */
export function seeded(seed: number): Rand {
    return seedrandom(String(seed));
}

/**
 * `n` random points inside `bounds` (kept `margin` away from the edges), at
 * least `minGap` apart. Poisson-disk sampling fills the area evenly; we
 * shuffle the result and keep the first n.
 */
export function randomPoints(
    rand: Rand,
    n: number,
    bounds: Bounds,
    minGap: number,
    margin = 0,
): Point[] {
    const width = bounds.maxX - bounds.minX - 2 * margin;
    const height = bounds.maxY - bounds.minY - 2 * margin;
    const sampler = new PoissonDiskSampling(
        { shape: [width, height], minDistance: minGap, tries: 20 },
        rand,
    );
    const all = sampler.fill();
    if (all.length < n)
        throw new Error(
            `Only ${all.length} points fit with gap ${minGap}; asked for ${n}`,
        );

    // Fisher–Yates shuffle, so the n we keep are spread over the whole board.
    for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, n).map(([x, y]) => ({
        x: bounds.minX + margin + x,
        y: bounds.minY + margin + y,
    }));
}
