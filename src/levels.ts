import type { Bounds, Point } from "./geometry";
import { randomPoints, seeded, type Rand } from "./random";

/**
 * A level is plain data. To add one, append to `LEVELS` below
 * (see README "Adding a level").
 */
export interface LevelDef {
    id: string;
    title: string;
    /** One or two sentences shown in the HUD: what the player should try. */
    goal: string;
    bounds?: Bounds;
    /** ℓ: how many chargers every house needs within r (fixed per level). */
    l: 1 | 2;
    /** Click-to-break enabled? Default true. */
    allowFailures?: boolean;
    /**
     * 'gonzalez': the player runs farthest-first by clicking the farthest house, which
     * moves the next charger there (ℓ chargers at a time: the twin rule). "Show me" does it.
     * 'bot': reveal the farthest-first bot's radius and placement.
     */
    tool?: "gonzalez" | "bot";
    /**
     * Best possible answer for all k chargers at this level's l: r* and one placement
     * achieving it (coordinates rounded to 1e-4). Computed once with an exact solver
     * (see git history: src/optimum.ts) and stored here. Random levels have none.
     */
    best?: { radius: number; facilities: Point[] };
    /** The level's lesson (lessons.ts), opened when the level starts. */
    lesson?:
        "cover" | "backups" | "failures" | "gonzalez" | "twins" | "twinbot";
    /** ℓ at the start, if not `l` (level 2 starts at 1; its lesson switches to 2). */
    startL?: 1 | 2;
    /** Also needed to finish: a failure walk on the final placement, the disc proof. */
    requires?: ("tested" | "proof")[];
    /** Shown under the goal after a few drags that have not reached it. */
    tip?: string;
    /** Goal: r at most this factor times best.radius. */
    targetFactor?: number;
    /** Fixed seed: generated levels become the same every time and hide "New". */
    seed?: number;
    clients: Point[] | ((rand: Rand, bounds: Bounds) => Point[]);
    /** Starting charger positions; their count is k. */
    facilities:
        Point[] | ((rand: Rand, bounds: Bounds, clients: Point[]) => Point[]);
}

/** A level resolved for one seed: plain arrays the app can copy and change. */
export interface LevelInstance {
    def: LevelDef;
    seed: number;
    bounds: Bounds;
    clients: Point[];
    facilities: Point[];
}

export const DEFAULT_BOUNDS: Bounds = {
    minX: -10,
    minY: -10,
    maxX: 10,
    maxY: 10,
};

function cluster(cx: number, cy: number, offsets: [number, number][]): Point[] {
    return offsets.map(([dx, dy]) => ({ x: cx + dx, y: cy + dy }));
}

/** k chargers in a row along the front edge of the board (nearest the camera). */
function frontRow(k: number, b: Bounds): Point[] {
    const span = b.maxX - b.minX - 4;
    return Array.from({ length: k }, (_, i) => ({
        x: b.minX + 2 + (span * i) / (k - 1),
        y: b.maxY - 0.6,
    }));
}

/**
 * The paper's Observation 2: a village of 3 houses and 1 lone house. One charger per
 * house is (almost) perfect for ℓ = 1, but for ℓ = 2 the lone house's 2nd-nearest
 * charger is a whole village away.
 */
const OBS2: Point[] = [
    { x: -6.5, y: 1.0 },
    { x: -2.6, y: 1.8 },
    { x: -4.9, y: 4.6 },
    { x: 6.5, y: -4.5 },
];

const TOWN: Point[] = [
    ...cluster(-5.5, -5, [
        [0, 0],
        [1.4, 0.5],
        [-0.8, 1.3],
        [0.6, -1.4],
    ]),
    ...cluster(5.5, -4, [
        [0, 0],
        [-1.2, 0.8],
        [1.1, 1.0],
        [0.2, -1.5],
    ]),
    ...cluster(-1, 4.5, [
        [0, 0],
        [1.5, -0.4],
        [-1.4, 0.3],
        [0.3, 1.4],
        [2.6, 1.2],
    ]),
];

export const LEVELS: LevelDef[] = [
    {
        id: "cover",
        title: "1 · Cover the town",
        goal: "The red house is the one farthest from its nearest charger. That distance (the red line) is the radius r, and each circle shows r around a charger. Move the 3 chargers to make r small.",
        l: 1,
        allowFailures: false,
        lesson: "cover",
        targetFactor: 1.15,
        clients: TOWN,
        facilities: frontRow(3, DEFAULT_BOUNDS),
        best: {
            radius: 2.05,
            facilities: [
                { x: -5.5, y: -5 },
                { x: 5.5, y: -4 },
                { x: -0.4, y: 5.25 },
            ],
        },
    },
    {
        // Best: a twin on the lone house and a twin at the centre of the village's
        // smallest enclosing circle (exact solver; also checked in lessons.test.ts).
        id: "backups",
        title: "2 · Backups",
        goal: "Each house needs ℓ chargers within radius r. Twins (two chargers on one spot) count as two.",
        l: 2,
        startL: 1,
        allowFailures: false,
        lesson: "backups",
        targetFactor: 1.15,
        clients: OBS2,
        // One charger just behind each house (on the house it would hide it).
        facilities: OBS2.map((p) => ({ x: p.x - 0.6, y: p.y - 0.6 })),
        best: {
            radius: 2.2269588118927666,
            facilities: [
                { x: -4.7506, y: 2.3781 },
                { x: -4.7506, y: 2.3781 },
                { x: 6.5, y: -4.5 },
                { x: 6.5, y: -4.5 },
            ],
        },
    },
    {
        id: "failures",
        title: "3 · When one fails",
        lesson: "failures",
        requires: ["tested"],
        goal: "Each house needs ℓ = 2 chargers within radius r, so whichever charger breaks, it still has a working one within r. Make r small, then click a charger to break it, or press Test failures to try them all.",
        l: 2,
        targetFactor: 1.15,
        seed: 2025,
        clients: (rand, b) => randomPoints(rand, 12, b, 2.2, 1.5),
        facilities: (_rand, b) => frontRow(4, b),
        best: {
            radius: 6.195793989437755,
            facilities: [
                { x: 6.8102, y: -3.9435 },
                { x: 6.8102, y: -3.9435 },
                { x: -1.1764, y: 6.3747 },
                { x: -1.1764, y: 6.3747 },
            ],
        },
    },
    {
        id: "gonzalez",
        title: "4 · Farthest-first",
        goal: "All chargers start on one house (any house would do). Send each next charger to the house farthest from every charger: Gonzalez’s farthest-first algorithm.",
        l: 1,
        allowFailures: false,
        tool: "gonzalez",
        lesson: "gonzalez",
        requires: ["proof"],
        seed: 14,
        clients: (rand, b) => randomPoints(rand, 14, b, 2, 1),
        // Every charger starts stacked on house 0, which is Gonzalez's first centre.
        facilities: (_rand, _b, clients) =>
            Array.from({ length: 5 }, () => ({ ...clients[0] })),
        best: {
            radius: 3.5143191382512806,
            facilities: [
                { x: -7.4945, y: -5.6681 },
                { x: 6.8847, y: 4.5264 },
                { x: -5.2591, y: 5.754 },
                { x: -2.0563, y: -3.7701 },
                { x: -2.2952, y: 4.6037 },
            ],
        },
    },
    {
        id: "twins",
        title: "5 · Farthest-first with backups",
        goal: "With ℓ = 2, farthest-first places chargers in pairs: the twin rule.",
        l: 2,
        allowFailures: false,
        tool: "gonzalez",
        lesson: "twins",
        requires: ["proof"],
        // Seed 134: farthest-first with 6 single chargers scores 12.60 at ℓ = 2, the
        // twin rule 6.72 (on most towns the two are much closer).
        seed: 134,
        clients: (rand, b) => randomPoints(rand, 12, b, 2, 1),
        // All 6 chargers start stacked on house 0, the first centre.
        facilities: (_rand, _b, clients) =>
            Array.from({ length: 6 }, () => ({ ...clients[0] })),
        best: {
            radius: 4.6472458218447565,
            facilities: [
                { x: 4.5524, y: 0.1572 },
                { x: 4.5524, y: 0.1572 },
                { x: -8.0981, y: -4.6773 },
                { x: -8.0981, y: -4.6773 },
                { x: 0.7148, y: 8.1403 },
                { x: 0.7148, y: 8.1403 },
            ],
        },
    },
    {
        id: "twinbot",
        title: "6 · Beat the twin rule",
        goal: "Each house needs ℓ = 2 chargers within radius r. Place the 4 chargers, then press Twin rule to see what it scores on these two rings of houses. Can you beat it?",
        tip: "Tip: a pair of chargers doesn't have to stand on a house.",
        l: 2,
        allowFailures: false,
        tool: "bot",
        lesson: "twinbot",
        // Two rings of 6 houses (radius 2.2). The twin rule puts its pairs on houses;
        // the best pairs stand on the empty middle of each ring (paper Figure 9).
        clients: [
            { x: -2.875, y: -3.931 },
            { x: -4.618, y: -2.333 },
            { x: -6.905, y: -3.4 },
            { x: -6.994, y: -5.43 },
            { x: -5.192, y: -6.692 },
            { x: -3.198, y: -5.762 },
            { x: 6.185, y: 5.414 },
            { x: 4.118, y: 6.167 },
            { x: 2.433, y: 4.752 },
            { x: 2.815, y: 2.586 },
            { x: 5.069, y: 1.875 },
            { x: 6.567, y: 3.248 },
        ],
        facilities: frontRow(4, DEFAULT_BOUNDS),
        best: {
            radius: 2.2003933030631546,
            facilities: [
                { x: -4.9998, y: -4.5 },
                { x: -4.9998, y: -4.5 },
                { x: 4.4992, y: 3.9999 },
                { x: 4.4992, y: 3.9999 },
            ],
        },
    },
    {
        id: "bot",
        title: "7 · Beat the bot",
        goal: "Place 4 chargers, then press Bot to reveal what farthest-first scores on the same town. Can you beat it?",
        l: 1,
        allowFailures: false,
        tool: "bot",
        clients: (rand, b) => randomPoints(rand, 16, b, 1.8, 0.8),
        facilities: (_rand, b) => frontRow(4, b),
    },
];

export function findLevel(id: string | null): LevelDef {
    return LEVELS.find((lv) => lv.id === id) ?? LEVELS[0];
}

export function instantiate(def: LevelDef, seed: number): LevelInstance {
    const bounds = def.bounds ?? DEFAULT_BOUNDS;
    const usedSeed = def.seed ?? seed;
    const rand = seeded(usedSeed);
    const clients =
        typeof def.clients === "function"
            ? def.clients(rand, bounds)
            : def.clients;
    const facilities =
        typeof def.facilities === "function"
            ? def.facilities(rand, bounds, clients)
            : def.facilities;
    // Copy, so dragging never changes the level definition.
    return {
        def,
        seed: usedSeed,
        bounds,
        clients: clients.map((p) => ({ ...p })),
        facilities: facilities.map((p) => ({ ...p })),
    };
}

/** True if "New" makes sense: the level is generated and has no fixed seed. */
export function isRandom(def: LevelDef): boolean {
    return (
        def.seed === undefined &&
        (typeof def.clients === "function" ||
            typeof def.facilities === "function")
    );
}
