/**
 * Drawing only. main.ts owns the state and passes it to `sync()`; this file
 * never decides any geometry. Built from standard three.js pieces only:
 * an orthographic camera, plain meshes, clipping planes and a Raycaster.
 */
import {
    BoxGeometry,
    CircleGeometry,
    Color,
    ConeGeometry,
    DirectionalLight,
    GridHelper,
    Group,
    HemisphereLight,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    NeutralToneMapping,
    OrthographicCamera,
    PCFShadowMap,
    Plane,
    PlaneGeometry,
    Raycaster,
    RingGeometry,
    Scene,
    Vector2,
    Vector3,
    WebGLRenderer,
} from "three";
import { Effects } from "./effects";
import type { Bounds, Point } from "./geometry";

/** Players who ask the system for less motion get no squash, pop-in, pulses or particles. */
const reducedMotion = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** The drop squash: height over 150 ms, 1 → 1.08 → 0.96 → 1. */
function squashAt(t: number): number {
    const keys = [1, 1.08, 0.96, 1];
    const x = Math.min(Math.max(t / 0.05, 0), 3);
    const i = Math.min(Math.floor(x), 2);
    return keys[i] + (keys[i + 1] - keys[i]) * (x - i);
}

/** 0 → 1 with a small overshoot (for popping things in). */
function easeOutBack(t: number): number {
    const c = 1.7;
    const u = Math.min(Math.max(t, 0), 1) - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
}

/** What the scene draws. Built by main.ts. */
export interface SceneView {
    clients: readonly Point[];
    facilities: readonly Point[];
    failed: readonly boolean[];
    /** Current radius; Infinity hides the rings and the worst-client line. */
    radius: number;
    worstClient: number;
    /** Index into `facilities` of the worst client's l-th nearest charger, or -1. */
    witnessFacility: number;
    /** Chargers being dragged (drawn lifted). */
    dragging: readonly number[];
}

const COLORS = {
    background: 0xf4e9d8,
    board: 0xf1e7d6,
    grid: 0xb39a78,
    slab: 0xc7ad8a,
    wall: 0xfff7ea,
    roof: 0xc8613f,
    worstWall: 0xffd27a,
    worstRoof: 0xd7263d,
    charger: 0x2a9d8f,
    glow: 0x5fe8d2,
    failed: 0x8d867c,
    ring: 0x1f8a7d,
    witness: 0xd7263d,
    proof: 0xd9821c,
};

const BOARD_MARGIN = 0.9;
const CHARGER_W = 0.72;
const CHARGER_H = 0.78;
const CAP_H = 0.14;
const STACK_H = CHARGER_H + CAP_H; // height of one charger, for stacking
const RING_LINE = 0.045; // half the width of the coverage circle's line
const ELEVATION = Math.atan(1 / Math.SQRT2); // true isometric angle, about 35.26 degrees
const AZIMUTH = Math.PI / 4; // camera looks at the board from a corner
/** Screen band (CSS px) kept free at the top for the goal box; the board fits below it. */
const TOP_INSET = 130;

interface Charger {
    group: Group;
    body: MeshStandardMaterial;
    cap: MeshStandardMaterial;
    ring: Mesh; // circle line at distance r
    fill: Mesh; // faint disc inside it
    lift: number; // animated height while dragged
    blob: Mesh; // soft shadow on the ground, grows and fades as it lifts
    squash: number; // time it was dropped (performance.now ms; -1: not squashing)
    popDelay: number; // seconds after the level start that it pops in (-1: shown)
}

export class KCentreScene {
    readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private readonly scene = new Scene();
    private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    private readonly raycaster = new Raycaster();
    private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);
    private readonly sun: DirectionalLight;

    private bounds: Bounds = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
    private readonly board: Mesh;
    private readonly slab: Mesh;
    private grid: GridHelper | null = null;

    private readonly houses = new Group();
    private readonly houseMaterials = {
        wall: new MeshStandardMaterial({ color: COLORS.wall, roughness: 0.85 }),
        roof: new MeshStandardMaterial({ color: COLORS.roof, roughness: 0.85 }),
        worstWall: new MeshStandardMaterial({
            color: COLORS.worstWall,
            roughness: 0.85,
        }),
        worstRoof: new MeshStandardMaterial({
            color: COLORS.worstRoof,
            roughness: 0.85,
        }),
    };

    private readonly chargers: Charger[] = [];
    /** Invisible boxes a bit larger than each charger, so they are easy to click. */
    private readonly hitTargets: Mesh[] = [];

    /** The four board edges; rings are cut off there (three.js clipping planes). */
    private readonly boardEdges = [
        new Plane(),
        new Plane(),
        new Plane(),
        new Plane(),
    ];
    private readonly ringMaterials = {
        line: this.ringMaterial(COLORS.ring, 0.9),
        fill: this.ringMaterial(COLORS.ring, 0.06),
        witnessLine: this.ringMaterial(COLORS.witness, 0.9),
        witnessFill: this.ringMaterial(COLORS.witness, 0.06),
    };
    private ringRadius = -1; // radius the ring shapes were last built for

    private readonly link: Mesh; // line from the worst house to its l-th nearest charger
    private readonly worstMarker: Mesh;
    private readonly worstIcon: Mesh;
    private readonly effects: Effects;
    /** The worst house shown last time nothing was dragged, and its pulse timer. */
    private lastWorst = -1;
    private worstPulse = -1;
    /** Something changed since the last drawn frame (see `frame`). */
    private dirty = true;
    private lastDraw = 0;
    private time = 0;
    /** Level start pop-in: when it began (ms) and each house's delay (seconds). */
    private popStart = -1;
    private housePop: number[] = [];
    private readonly ghosts: Mesh[] = [];
    /** "Why 2x?" discs around farthest-first houses (meshes made on demand). */
    private readonly proofDiscs = { line: [] as Mesh[], fill: [] as Mesh[] };
    private proofShapes = {
        line: new RingGeometry(),
        fill: new CircleGeometry(),
    };
    private readonly proofMaterials = {
        line: this.ringMaterial(COLORS.proof, 0.95),
        fill: this.ringMaterial(COLORS.proof, 0.16),
    };
    private proofRadius = -1;
    private readonly ghostMaterial = new MeshBasicMaterial({
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
    });

    private width = 1;
    private height = 1;
    private dragging: readonly number[] = [];
    private stackLevels: number[] = [];
    private facilities: readonly Point[] = [];

    constructor(container: HTMLElement, maxFacilities = 16) {
        this.renderer = new WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = PCFShadowMap;
        // Only chargers cast shadows: the shadow map is redrawn when they change, not every frame.
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.toneMapping = NeutralToneMapping;
        this.renderer.localClippingEnabled = true; // lets the rings use clipping planes
        this.canvas = this.renderer.domElement;
        container.appendChild(this.canvas);
        this.scene.background = new Color(COLORS.background);

        // Warm, soft light: a sky/ground fill light plus a low sun that casts shadows.
        this.scene.add(new HemisphereLight(0xfff6ea, 0xb8a084, 1.6));
        this.sun = new DirectionalLight(0xffe4c2, 2.0);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.bias = -0.0004;
        this.sun.shadow.normalBias = 0.03;
        this.scene.add(this.sun, this.sun.target);

        // The board (ground at y = 0) sits on a darker slab.
        const boardGeometry = new PlaneGeometry(1, 1);
        boardGeometry.rotateX(-Math.PI / 2);
        this.board = new Mesh(
            boardGeometry,
            new MeshStandardMaterial({ color: COLORS.board, roughness: 0.95 }),
        );
        this.board.receiveShadow = true;
        const slabGeometry = new BoxGeometry(1, 1, 1);
        slabGeometry.translate(0, -0.5, 0);
        this.slab = new Mesh(
            slabGeometry,
            new MeshStandardMaterial({ color: COLORS.slab, roughness: 1 }),
        );
        this.scene.add(this.board, this.slab, this.houses);

        // Chargers: a box with a glowing cap, plus its coverage ring on the ground.
        const bodyGeometry = new BoxGeometry(CHARGER_W, CHARGER_H, CHARGER_W);
        bodyGeometry.translate(0, CHARGER_H / 2, 0);
        const capGeometry = new BoxGeometry(
            CHARGER_W * 0.7,
            CAP_H,
            CHARGER_W * 0.7,
        );
        capGeometry.translate(0, CHARGER_H + CAP_H / 2, 0);
        const blobGeometry = new CircleGeometry(0.5, 32).rotateX(-Math.PI / 2);
        const blobMaterial = new MeshBasicMaterial({
            color: 0x3b2f24,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });
        const hitGeometry = new BoxGeometry(1.0, STACK_H, 1.0);
        hitGeometry.translate(0, STACK_H / 2, 0);
        for (let i = 0; i < maxFacilities; i++) {
            const body = new MeshStandardMaterial({
                color: COLORS.charger,
                emissive: COLORS.glow,
                emissiveIntensity: 0.25,
                roughness: 0.45,
            });
            const cap = new MeshStandardMaterial({
                color: 0xffffff,
                emissive: COLORS.glow,
                emissiveIntensity: 1.6,
                roughness: 0.3,
            });
            const bodyMesh = new Mesh(bodyGeometry, body);
            const capMesh = new Mesh(capGeometry, cap);
            bodyMesh.castShadow = capMesh.castShadow = true;
            const hit = new Mesh(
                hitGeometry,
                new MeshBasicMaterial({ visible: false }),
            );
            hit.userData.index = i;
            this.hitTargets.push(hit);
            const group = new Group();
            group.add(bodyMesh, capMesh, hit);
            // Ring shapes are built in sync(), once the radius is known.
            const ring = new Mesh(undefined, this.ringMaterials.line);
            const fill = new Mesh(undefined, this.ringMaterials.fill);
            ring.position.y = 0.021;
            fill.position.y = 0.02;
            const blob = new Mesh(blobGeometry, blobMaterial.clone());
            blob.position.y = 0.012;
            blob.visible = false;
            this.scene.add(group, ring, fill, blob);
            this.chargers.push({
                group,
                body,
                cap,
                ring,
                fill,
                lift: 0,
                blob,
                squash: -1,
                popDelay: -1,
            });
        }

        // Ghost chargers show a reference placement (best answer or the bot's).
        const ghostGeometry = new BoxGeometry(
            CHARGER_W * 1.08,
            STACK_H,
            CHARGER_W * 1.08,
        );
        ghostGeometry.translate(0, STACK_H / 2, 0);
        for (let i = 0; i < maxFacilities; i++) {
            const ghost = new Mesh(ghostGeometry, this.ghostMaterial);
            ghost.visible = false;
            this.ghosts.push(ghost);
            this.scene.add(ghost);
        }

        // Worst house: a red line to its l-th nearest charger and a red ring around it.
        const linkGeometry = new PlaneGeometry(1, 1);
        linkGeometry.rotateX(-Math.PI / 2);
        linkGeometry.translate(0.5, 0, 0); // starts at x = 0, so scaling x by the length reaches the charger
        this.link = new Mesh(
            linkGeometry,
            new MeshBasicMaterial({
                color: COLORS.witness,
                transparent: true,
                opacity: 0.8,
            }),
        );
        const markerGeometry = new RingGeometry(0.62, 0.78, 40);
        markerGeometry.rotateX(-Math.PI / 2);
        this.worstMarker = new Mesh(
            markerGeometry,
            new MeshBasicMaterial({ color: COLORS.witness }),
        );
        // Also marked by shape, not only red: a dark arrow above the worst house.
        const iconGeometry = new ConeGeometry(0.16, 0.34, 4).rotateX(Math.PI);
        this.worstIcon = new Mesh(
            iconGeometry,
            new MeshStandardMaterial({ color: 0x3b2f24, roughness: 0.6 }),
        );
        this.scene.add(this.link, this.worstMarker, this.worstIcon);
        this.effects = new Effects(this.scene);
    }

    private ringMaterial(color: number, opacity: number): MeshBasicMaterial {
        return new MeshBasicMaterial({
            color,
            opacity,
            transparent: true,
            depthWrite: false,
            clippingPlanes: this.boardEdges,
        });
    }

    setBounds(b: Bounds): void {
        this.dirty = true;
        this.bounds = b;
        const w = b.maxX - b.minX + 2 * BOARD_MARGIN;
        const h = b.maxY - b.minY + 2 * BOARD_MARGIN;
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minY + b.maxY) / 2;
        this.board.scale.set(w, 1, h);
        this.board.position.set(cx, 0, cz);
        this.slab.scale.set(w + 0.3, 0.7, h + 0.3);
        this.slab.position.set(cx, -0.002, cz);

        // Keep x >= left, x <= right, z >= back, z <= front (a plane keeps its positive side).
        const [left, right, back, front] = this.boardEdges;
        left.set(new Vector3(1, 0, 0), -(cx - w / 2));
        right.set(new Vector3(-1, 0, 0), cx + w / 2);
        back.set(new Vector3(0, 0, 1), -(cz - h / 2));
        front.set(new Vector3(0, 0, -1), cz + h / 2);

        // One grid line per world unit.
        if (this.grid) this.scene.remove(this.grid);
        const size = Math.max(w, h);
        this.grid = new GridHelper(
            size,
            Math.round(size),
            COLORS.grid,
            COLORS.grid,
        );
        this.grid.material.transparent = true;
        this.grid.material.opacity = 0.25;
        this.grid.position.set(cx, 0.003, cz);
        this.scene.add(this.grid);

        const shadow = this.sun.shadow.camera;
        const half = size * 0.75;
        shadow.left = shadow.bottom = -half;
        shadow.right = shadow.top = half;
        shadow.far = 60;
        shadow.updateProjectionMatrix();
        this.sun.position.set(cx - 9, 16, cz + 7);
        this.sun.target.position.set(cx, 0, cz);
        this.updateCamera();
    }

    /** Build one small house per client. Call when the level changes. */
    setClients(clients: readonly Point[]): void {
        this.dirty = true;
        this.houses.clear();
        const body = new BoxGeometry(0.62, 0.5, 0.62);
        body.translate(0, 0.25, 0);
        const roof = new ConeGeometry(0.56, 0.42, 4);
        roof.rotateY(Math.PI / 4);
        roof.translate(0, 0.71, 0);
        for (const c of clients) {
            const walls = new Mesh(body, this.houseMaterials.wall);
            const top = new Mesh(roof, this.houseMaterials.roof);
            walls.castShadow = top.castShadow = walls.receiveShadow = true;
            const house = new Group();
            house.add(walls, top);
            house.position.set(c.x, 0, c.y);
            this.houses.add(house);
        }
    }

    resize(width: number, height: number): void {
        this.dirty = true;
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this.renderer.setSize(this.width, this.height, false);
        this.updateCamera();
    }

    /** Isometric camera on the board centre, zoomed so the whole board fits the window. */
    private updateCamera(): void {
        const b = this.bounds;
        const centre = new Vector3(
            (b.minX + b.maxX) / 2,
            0,
            (b.minY + b.maxY) / 2,
        );
        const away = new Vector3(
            Math.cos(ELEVATION) * Math.sin(AZIMUTH),
            Math.sin(ELEVATION),
            Math.cos(ELEVATION) * Math.cos(AZIMUTH),
        );
        this.camera.position.copy(centre).addScaledVector(away, 50);
        this.camera.lookAt(centre);

        // Seen from a corner, the square board is a diamond: √2 × its side wide, and that
        // times sin(elevation) tall; add room for the slab and the chargers on top.
        const side =
            Math.max(b.maxX - b.minX, b.maxY - b.minY) + 2 * BOARD_MARGIN;
        const boardW = side * Math.SQRT2;
        const boardH = boardW * Math.sin(ELEVATION) + 3;
        // Fit the board below the top band, centred in the space that is left.
        const free = Math.max(1, this.height - TOP_INSET);
        const unitsPerPx = 1.1 * Math.max(boardW / this.width, boardH / free);
        this.camera.left = (-this.width / 2) * unitsPerPx;
        this.camera.right = (this.width / 2) * unitsPerPx;
        this.camera.top = (this.height / 2 + TOP_INSET / 2) * unitsPerPx;
        this.camera.bottom = (-this.height / 2 + TOP_INSET / 2) * unitsPerPx;
        this.camera.updateProjectionMatrix();
    }

    /** Show a reference placement as see-through ghost chargers; null hides them. */
    setGhosts(points: readonly Point[] | null, color = 0x6b4fd8): void {
        this.dirty = true;
        this.ghostMaterial.color.set(color);
        this.ghosts.forEach((ghost, i) => {
            const p = points?.[i];
            ghost.visible = !!p;
            if (p)
                ghost.position.set(p.x, stackLevel(points!, i) * STACK_H, p.y);
        });
    }

    /** Discs of radius r around some houses (the "Why 2x?" picture); null hides them. */
    setProofDiscs(points: readonly Point[] | null, r = 0): void {
        this.dirty = true;
        const show = points && r > 0 ? points : [];
        if (show.length > 0 && r !== this.proofRadius) {
            // One shared shape for all discs, rebuilt when the radius changes.
            this.proofRadius = r;
            const w = RING_LINE * 1.5;
            const line = new RingGeometry(Math.max(0, r - w), r + w, 128);
            const fill = new CircleGeometry(r, 128);
            line.rotateX(-Math.PI / 2);
            fill.rotateX(-Math.PI / 2);
            this.proofDiscs.line.forEach((m) => (m.geometry = line));
            this.proofDiscs.fill.forEach((m) => (m.geometry = fill));
            this.proofShapes.line.dispose();
            this.proofShapes.fill.dispose();
            this.proofShapes = { line, fill };
        }
        while (this.proofDiscs.line.length < show.length) {
            const line = new Mesh(
                this.proofShapes.line,
                this.proofMaterials.line,
            );
            const fill = new Mesh(
                this.proofShapes.fill,
                this.proofMaterials.fill,
            );
            line.position.y = 0.024;
            fill.position.y = 0.023;
            line.renderOrder = 3;
            this.scene.add(line, fill);
            this.proofDiscs.line.push(line);
            this.proofDiscs.fill.push(fill);
        }
        for (const meshes of [this.proofDiscs.line, this.proofDiscs.fill])
            meshes.forEach((m, i) => {
                m.visible = i < show.length;
                if (m.visible)
                    m.position.set(show[i].x, m.position.y, show[i].y);
            });
    }

    /** Rebuild the ring shapes (shared by all chargers) when r changes. */
    private buildRings(r: number): void {
        if (r === this.ringRadius) return;
        this.ringRadius = r;
        const line = new RingGeometry(
            Math.max(0, r - RING_LINE),
            r + RING_LINE,
            128,
        );
        const fill = new CircleGeometry(r, 128);
        line.rotateX(-Math.PI / 2);
        fill.rotateX(-Math.PI / 2);
        const oldLine = this.chargers[0].ring.geometry;
        const oldFill = this.chargers[0].fill.geometry;
        for (const c of this.chargers) {
            c.ring.geometry = line;
            c.fill.geometry = fill;
        }
        oldLine.dispose();
        oldFill.dispose();
    }

    /** Copy the current state into the scene objects. */
    sync(view: SceneView): void {
        this.dirty = true;
        const { facilities, failed, clients } = view;
        const showRings = Number.isFinite(view.radius) && view.radius > 0;
        if (showRings) this.buildRings(view.radius);

        this.chargers.forEach((c, i) => {
            const f = facilities[i];
            c.group.visible = !!f;
            c.ring.visible = c.fill.visible = !!f && showRings && !failed[i];
            if (!f) return;
            c.group.position.x = c.ring.position.x = c.fill.position.x = f.x;
            c.group.position.z = c.ring.position.z = c.fill.position.z = f.y;
            c.body.color.set(failed[i] ? COLORS.failed : COLORS.charger);
            c.body.emissiveIntensity = failed[i] ? 0 : 0.25;
            c.cap.color.set(failed[i] ? COLORS.failed : 0xffffff);
            c.cap.emissiveIntensity = failed[i] ? 0 : 1.6;
            const isWitness = i === view.witnessFacility;
            c.ring.material = isWitness
                ? this.ringMaterials.witnessLine
                : this.ringMaterials.line;
            c.fill.material = isWitness
                ? this.ringMaterials.witnessFill
                : this.ringMaterials.fill;
            c.ring.renderOrder = isWitness ? 2 : 1; // red ring drawn on top
        });

        // Highlight the worst house.
        this.houses.children.forEach((house, i) => {
            const [walls, roof] = (house as Group).children as Mesh[];
            const worst = i === view.worstClient;
            walls.material = worst
                ? this.houseMaterials.worstWall
                : this.houseMaterials.wall;
            roof.material = worst
                ? this.houseMaterials.worstRoof
                : this.houseMaterials.roof;
        });

        const worst = clients[view.worstClient];
        const witness = facilities[view.witnessFacility];
        this.link.visible = this.worstMarker.visible = !!worst && !!witness;
        if (worst && witness) {
            const dx = witness.x - worst.x;
            const dz = witness.y - worst.y;
            this.link.position.set(worst.x, 0.03, worst.y);
            this.link.rotation.y = Math.atan2(-dz, dx);
            this.link.scale.set(Math.max(Math.hypot(dx, dz), 1e-4), 1, 0.11);
            this.worstMarker.position.set(worst.x, 0.025, worst.y);
            this.worstIcon.position.x = worst.x;
            this.worstIcon.position.z = worst.y;
        }
        this.worstIcon.visible = this.worstMarker.visible;
        // A new worst-off house (seen once the chargers are put down): one brief pulse.
        if (view.dragging.length === 0) {
            if (
                view.worstClient >= 0 &&
                this.lastWorst >= 0 &&
                view.worstClient !== this.lastWorst &&
                !reducedMotion()
            )
                this.worstPulse = 0;
            this.lastWorst = view.worstClient;
        }

        this.dragging = view.dragging;
        this.facilities = facilities;
        this.stackLevels = facilities.map((_, i) => stackLevel(facilities, i));
    }

    /** Chargers were put down here: squash them and puff a ring of dust. */
    dropped(indices: readonly number[]): void {
        this.dirty = true;
        if (reducedMotion()) return;
        for (const i of indices) this.chargers[i].squash = performance.now();
        const f = this.facilities[indices[0]];
        if (f) this.effects.dust(f);
    }

    /** A small (a lesson step) or bigger (a level) celebration at a board point. */
    celebrate(at: Point, big: boolean): void {
        this.dirty = true;
        if (!reducedMotion()) this.effects.celebrate(at, big);
    }

    /** Level start: houses, then chargers, pop in one after another (~300 ms). */
    popIn(chargers: number): void {
        this.dirty = true;
        if (reducedMotion()) return;
        const n = this.houses.children.length + chargers;
        const delay = (k: number) => (k / Math.max(1, n)) * 0.2;
        this.popStart = performance.now();
        this.housePop = this.houses.children.map((_, k) => delay(k));
        this.chargers.forEach((c, i) => {
            c.popDelay =
                i < chargers ? delay(this.houses.children.length + i) : -1;
        });
    }

    /** Lift, squash, pop-in and pulses, then draw. `dt` in seconds. */
    /**
     * Advances the animations and draws, but only when something changed or is still
     * moving: an idle board costs nothing. `frozen` (the menu or pause screen covers the
     * board) draws only changes. The bobbing arrow over the worst house is drawn at 30 fps.
     */
    frame(dt: number, frozen = false): void {
        if (frozen && !this.dirty) return;
        let animating = this.dragging.length > 0;
        this.time += dt;
        const ease = 1 - Math.exp(-dt * 10);
        this.chargers.forEach((c, i) => {
            const target = this.dragging.includes(i) ? 0.45 : 0;
            if (
                Math.abs(target - c.lift) > 0.001 ||
                c.squash >= 0 ||
                c.popDelay >= 0
            )
                animating = true;
            c.lift += (target - c.lift) * ease;
            c.group.position.y = (this.stackLevels[i] ?? 0) * STACK_H + c.lift;
            // Soft ground shadow: grows and fades as the charger rises.
            const lifted = c.group.visible && c.lift > 0.02;
            c.blob.visible = lifted;
            if (lifted) {
                c.blob.position.x = c.group.position.x;
                c.blob.position.z = c.group.position.z;
                const k = 1 + c.lift * 1.4;
                c.blob.scale.set(k, 1, k);
                (c.blob.material as MeshBasicMaterial).opacity =
                    0.3 * (1 - c.lift);
            }
            // Squash and pop-in run on real time, so they take 150 / 300 ms on any
            // machine (a slow frame rate must not leave chargers tiny or ungrabbable).
            let sy = 1;
            if (c.squash >= 0) {
                const t = (performance.now() - c.squash) / 1000;
                sy = squashAt(t);
                if (t > 0.15) c.squash = -1;
            }
            let grow = 1;
            if (c.popDelay >= 0) {
                const t =
                    (performance.now() - this.popStart) / 1000 - c.popDelay;
                grow = t < 0 ? 0 : easeOutBack(t / 0.14);
                if (t > 0.14) c.popDelay = -1;
            }
            const side = 1 / Math.sqrt(sy);
            c.group.scale.set(side * grow, sy * grow, side * grow);
        });
        const sincePop = (performance.now() - this.popStart) / 1000;
        this.houses.children.forEach((h, k) => {
            const d = this.housePop[k];
            const t = sincePop - (d ?? 0);
            if (d === undefined || t > 0.14) return h.scale.setScalar(1);
            animating = true;
            h.scale.setScalar(t < 0 ? 0.001 : easeOutBack(t / 0.14));
        });
        // Worst house: the arrow bobs gently; a change of worst house pulses its ring.
        const calm = reducedMotion();
        this.worstIcon.position.y =
            1.55 + (calm ? 0 : Math.sin(this.time * 3) * 0.06);
        let pulse = 1;
        if (this.worstPulse >= 0) {
            this.worstPulse += dt;
            pulse =
                1 +
                0.5 * Math.sin(Math.min(this.worstPulse / 0.35, 1) * Math.PI);
            if (this.worstPulse > 0.35) this.worstPulse = -1;
        }
        this.worstMarker.scale.set(pulse, 1, pulse);
        if (this.worstPulse >= 0 || this.effects.busy) animating = true;
        this.effects.update(dt);
        const now = performance.now();
        const bobbing =
            this.worstIcon.visible && !calm && now - this.lastDraw > 1000 / 30;
        if (!this.dirty && !animating && !bobbing) return;
        this.renderer.shadowMap.needsUpdate = this.dirty || animating;
        this.dirty = false;
        this.lastDraw = now;
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Where a speech bubble should point, in CSS px inside the canvas.
     * - "house": just above its roof (or above the stack standing on it).
     * - "charger": the top of that charger itself, even inside a stack;
     *   `side` gives the middle of its body instead (for a bubble beside it).
     * - "stack": the top of the whole stack the charger stands in.
     */
    anchorOnScreen(
        kind: "house" | "charger" | "stack",
        i: number,
        side = false,
    ): { x: number; y: number } | null {
        const stackSize = (x: number, y: number) =>
            this.facilities.filter((g) => g.x === x && g.y === y).length;
        let p: Vector3;
        if (kind === "house") {
            const house = this.houses.children[i];
            if (!house) return null;
            const { x, z } = house.position;
            const top = Math.max(1.0, stackSize(x, z) * STACK_H);
            p = new Vector3(x, side ? 0.5 : top, z);
        } else {
            const f = this.facilities[i];
            if (!f) return null;
            const level =
                kind === "stack"
                    ? stackSize(f.x, f.y) - 1
                    : stackLevel(this.facilities, i);
            p = new Vector3(f.x, (level + (side ? 0.5 : 1)) * STACK_H, f.y);
        }
        p.project(this.camera);
        return {
            x: ((p.x + 1) / 2) * this.width,
            y: ((1 - p.y) / 2) * this.height,
        };
    }

    /** A board point at some height, in CSS px inside the canvas. */
    pointOnScreen(p: Point, height = 0): { x: number; y: number } {
        const v = new Vector3(p.x, height, p.y).project(this.camera);
        return {
            x: ((v.x + 1) / 2) * this.width,
            y: ((1 - v.y) / 2) * this.height,
        };
    }

    private setRay(px: number, py: number): void {
        const ndc = new Vector2(
            (px / this.width) * 2 - 1,
            -(py / this.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(ndc, this.camera);
    }

    /** Where the pointer (CSS px inside the canvas) meets the ground, in 2D problem coordinates. */
    groundPoint(px: number, py: number): Point | null {
        this.setRay(px, py);
        const hit = this.raycaster.ray.intersectPlane(
            this.groundPlane,
            new Vector3(),
        );
        return hit ? { x: hit.x, y: hit.z } : null;
    }

    /** Index of the charger under the pointer, or -1. The top of a stack wins (it is nearest the camera). */
    pickFacility(px: number, py: number): number {
        this.setRay(px, py);
        const visible = this.hitTargets.filter((t) => t.parent!.visible);
        const hit = this.raycaster.intersectObjects(visible, false)[0];
        return hit ? (hit.object.userData.index as number) : -1;
    }

    /** Index of the house under the pointer, or -1. */
    pickHouse(px: number, py: number): number {
        this.setRay(px, py);
        const hit = this.raycaster.intersectObjects(
            this.houses.children,
            true,
        )[0];
        return hit ? this.houses.children.indexOf(hit.object.parent!) : -1;
    }
}

/** How many earlier points sit exactly on point i (0 = bottom of its stack). */
function stackLevel(points: readonly Point[], i: number): number {
    let level = 0;
    for (let j = 0; j < i; j++) {
        if (points[j].x === points[i].x && points[j].y === points[i].y) level++;
    }
    return level;
}
