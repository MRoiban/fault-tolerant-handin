/**
 * The maths of the fault-tolerant Euclidean k-centre problem, in plain 2D.
 * No three.js, no DOM, so it is easy to unit-test.
 *
 * Clients (houses) C and facilities (chargers) F, |F| = k. With fault tolerance l,
 * each client is served by its l-th nearest facility, so it stays served even if
 * l - 1 facilities fail. The radius is the worst such distance:
 *
 *   r(F) = max over c in C of  d_l(c, F)
 *
 * Facilities may sit on the same spot; they still count separately.
 */

export interface Point {
    x: number;
    y: number;
}

export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export function dist(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Index of the l-th nearest facility to `client` (l counts from 1), or -1 if there
 * are fewer than l facilities. Ties keep the lower index.
 */
export function lthNearestIndex(
    client: Point,
    facilities: readonly Point[],
    l: number,
): number {
    if (l < 1 || facilities.length < l) return -1;
    const order = facilities.map((_, i) => i);
    order.sort(
        (i, j) =>
            dist(client, facilities[i]) - dist(client, facilities[j]) || i - j,
    );
    return order[l - 1];
}

/** Distance from `client` to its l-th nearest facility; Infinity if there are fewer than l. */
export function lthNearestDist(
    client: Point,
    facilities: readonly Point[],
    l: number,
): number {
    const i = lthNearestIndex(client, facilities, l);
    return i < 0 ? Infinity : dist(client, facilities[i]);
}

export interface Evaluation {
    /** max over clients of the l-th nearest distance; 0 with no clients; Infinity if fewer than l facilities. */
    radius: number;
    /** Index of a client attaining the radius (the first one on ties), or -1. */
    worstClient: number;
    /** Index of that client's l-th nearest facility, or -1. */
    witnessFacility: number;
}

/** Radius, worst client and its l-th nearest facility, in one pass. */
export function evaluate(
    clients: readonly Point[],
    facilities: readonly Point[],
    l: number,
): Evaluation {
    if (clients.length === 0)
        return { radius: 0, worstClient: -1, witnessFacility: -1 };
    if (l < 1 || facilities.length < l)
        return { radius: Infinity, worstClient: -1, witnessFacility: -1 };
    let result: Evaluation = {
        radius: -1,
        worstClient: -1,
        witnessFacility: -1,
    };
    clients.forEach((client, c) => {
        const f = lthNearestIndex(client, facilities, l);
        const d = dist(client, facilities[f]);
        if (d > result.radius)
            result = { radius: d, worstClient: c, witnessFacility: f };
    });
    return result;
}

/** r = max over clients of the l-th nearest facility distance. */
export function radius(
    clients: readonly Point[],
    facilities: readonly Point[],
    l: number,
): number {
    return evaluate(clients, facilities, l).radius;
}

/** Index of a client attaining the radius, or -1. */
export function worstClient(
    clients: readonly Point[],
    facilities: readonly Point[],
    l: number,
): number {
    return evaluate(clients, facilities, l).worstClient;
}

/**
 * Gonzalez's farthest-first traversal (1985): start at `clients[first]`, then
 * repeatedly add the client farthest from all centres chosen so far.
 * Returns up to k client indices in the order chosen. For l = 1 the resulting
 * radius is at most twice the optimum. Ties pick the lower index.
 */
export function gonzalez(
    clients: readonly Point[],
    k: number,
    first = 0,
): number[] {
    if (clients.length === 0 || k <= 0) return [];
    const centres = [first];
    // nearest[i] = distance from client i to its nearest chosen centre
    const nearest = clients.map((c) => dist(c, clients[first]));
    while (centres.length < k) {
        let far = 0;
        nearest.forEach((d, i) => {
            if (d > nearest[far]) far = i;
        });
        if (nearest[far] === 0) break; // every client already sits on a centre
        centres.push(far);
        clients.forEach((c, i) => {
            nearest[i] = Math.min(nearest[i], dist(c, clients[far]));
        });
    }
    return centres;
}

/**
 * Fault-tolerant farthest-first ("twin rule"): run Gonzalez for m = ⌊k/l⌋ centres
 * and put l chargers on each, so every house's l nearest chargers are the l
 * copies on its nearest centre. Leftover chargers (k - l·m) go on the first centre.
 * Returns k charger positions.
 *
 * Why it is within 2 × the optimum r*: farthest-first finds m + 1 houses that are
 * pairwise at least R apart (R = its radius). If R > 2r*, disks of radius r*
 * around them are disjoint, and each needs l chargers inside, so an optimal
 * solution would need l(m + 1) > k chargers. Contradiction, so R ≤ 2r*.
 */
export function twinGonzalez(
    clients: readonly Point[],
    k: number,
    l: number,
): Point[] {
    const m = Math.floor(k / l);
    const centres = gonzalez(clients, m).map((i) => clients[i]);
    if (centres.length === 0) return [];
    const placement: Point[] = [];
    for (const c of centres)
        for (let j = 0; j < l; j++) placement.push({ ...c });
    while (placement.length < k) placement.push({ ...centres[0] });
    return placement;
}

/** Moves `p` inside `b` (changes p). */
export function clampToBounds(p: Point, b: Bounds): void {
    p.x = Math.min(b.maxX, Math.max(b.minX, p.x));
    p.y = Math.min(b.maxY, Math.max(b.minY, p.y));
}
