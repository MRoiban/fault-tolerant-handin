/**
 * Short-lived visual feedback on the board: a ring of dust where a charger lands,
 * and a small celebration (gold rings and a few rising sparks) when a step or a
 * level is done. Drawing only; scene.ts calls `update` every frame. Kept small on
 * purpose: the geometry, not the effects, should hold the eye.
 */
import {
    BoxGeometry,
    Mesh,
    MeshBasicMaterial,
    RingGeometry,
    type Scene,
} from "three";
import type { Point } from "./geometry";

interface Item {
    mesh: Mesh;
    material: MeshBasicMaterial;
    /** Seconds since start (negative: not started yet). */
    age: number;
    life: number;
    kind: "dust" | "ring" | "spark";
    vx: number;
    vy: number;
    vz: number;
}

const DUST = 0x9c8566;
const GOLD = 0xe9a23b;

const ringShape = new RingGeometry(0.42, 0.52, 48).rotateX(-Math.PI / 2);
const sparkShape = new BoxGeometry(0.09, 0.09, 0.09);

export class Effects {
    private readonly items: Item[] = [];

    constructor(private readonly scene: Scene) {}

    private add(
        kind: Item["kind"],
        color: number,
        opacity: number,
        at: Point,
        y: number,
        life: number,
        delay = 0,
    ): Item {
        const material = new MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
        });
        const mesh = new Mesh(
            kind === "spark" ? sparkShape : ringShape,
            material,
        );
        mesh.position.set(at.x, y, at.y);
        mesh.visible = delay <= 0;
        mesh.renderOrder = 4;
        this.scene.add(mesh);
        const item: Item = {
            mesh,
            material,
            age: -delay,
            life,
            kind,
            vx: 0,
            vy: 0,
            vz: 0,
        };
        this.items.push(item);
        return item;
    }

    /** A faint ring of dust spreading out where a charger landed. */
    dust(at: Point): void {
        this.add("dust", DUST, 0.35, at, 0.015, 0.4);
    }

    /** Gold rings and a few sparks: small for a step, bigger for a level. */
    celebrate(at: Point, big: boolean): void {
        this.add("ring", GOLD, 0.8, at, 0.03, 0.7);
        if (big) this.add("ring", GOLD, 0.6, at, 0.03, 0.8, 0.15);
        const n = big ? 12 : 5;
        for (let i = 0; i < n; i++) {
            const s = this.add("spark", GOLD, 1, at, 0.9, 0.8);
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
            const speed = 0.6 + Math.random() * 0.6;
            s.vx = Math.cos(a) * speed;
            s.vz = Math.sin(a) * speed;
            s.vy = 2 + Math.random() * 1.2;
        }
    }

    /** True while any effect is still playing (the scene must keep drawing). */
    get busy(): boolean {
        return this.items.length > 0;
    }

    update(dt: number): void {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i];
            it.age += dt;
            if (it.age < 0) continue;
            it.mesh.visible = true;
            const t = it.age / it.life;
            if (t >= 1) {
                this.scene.remove(it.mesh);
                it.material.dispose();
                this.items.splice(i, 1);
                continue;
            }
            if (it.kind === "spark") {
                it.vy -= 6 * dt; // a little gravity
                it.mesh.position.x += it.vx * dt;
                it.mesh.position.y = Math.max(
                    0.05,
                    it.mesh.position.y + it.vy * dt,
                );
                it.mesh.position.z += it.vz * dt;
                it.mesh.rotation.y += 6 * dt;
                it.material.opacity = 1 - t;
            } else {
                const grow = it.kind === "dust" ? 0.6 + 1.2 * t : 0.5 + 2.5 * t;
                it.mesh.scale.set(grow, 1, grow);
                it.material.opacity =
                    (it.kind === "dust" ? 0.35 : 0.8) * (1 - t);
            }
        }
    }
}
