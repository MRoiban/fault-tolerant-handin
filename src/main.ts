/**
 * The app: holds the state, defines what each action does, and runs the frame loop.
 * geometry.ts computes, scene.ts draws, hud.ts shows numbers and buttons,
 * input.ts turns the mouse and keyboard into the actions below.
 */
import {
    clampToBounds,
    evaluate,
    gonzalez,
    lthNearestDist,
    radius,
    twinGonzalez,
    type Evaluation,
    type Point,
} from "./geometry";
import { createBubble, type Placement } from "./bubble";
import {
    botLossSteps,
    briefingSteps,
    failureSteps,
    isInteractive,
    wrongHouseSteps,
    type Anchor,
    type TourEffect,
    type TourStep,
    type TourView,
} from "./explain";
import {
    backupsLesson,
    coverLesson,
    failuresLesson,
    gonzalezLesson,
    proofLesson,
    summarySteps,
    twinbotLesson,
    twinsLesson,
} from "./lessons";
import { levelWon as wonRule, placementKey } from "./win";
import { createHud } from "./hud";
import { applyIcons, setIcon } from "./icons";
import { attachKeys, attachPointer } from "./input";
import {
    findLevel,
    instantiate,
    isRandom,
    LEVELS,
    type LevelInstance,
} from "./levels";
import { createMenu } from "./menu";
import { createPause } from "./pause";
import { markCompleted, setSetting, settings } from "./progress";
import { KCentreScene } from "./scene";
import { play, soundDebug } from "./sound";

const MAX_FACILITIES = 16;
/** Dropping a charger this close to another puts it exactly on top (a stack). */
const SNAP_DIST = 0.45;
const GHOST_BEST = 0xd9821c;
const GHOST_BOT = 0x6b4fd8;

export interface AppState {
    level: LevelInstance;
    facilities: Point[];
    failed: boolean[];
    l: number;
    /**
     * The plan: every house's l-th nearest charger, counting all chargers (broken
     * or not). This is the fault-tolerant radius the level is about.
     */
    result: Evaluation;
    /**
     * Only while chargers are broken: every house uses its nearest working charger.
     * If at most l - 1 are broken, this is never larger than the plan's radius.
     */
    after: Evaluation | null;
    /** Farthest-first placement for this level's l (twin rule when l = 2); also the bot's. */
    farthestFirst: Point[];
    botRadius: number;
    botRevealed: boolean;
    /** Farthest-first levels: placements done, placements possible, last click's result. */
    steps: number;
    totalSteps: number;
    feedback: "right" | "wrong" | null;
    /** After a wrong click on a farthest-first level: the house clicked. */
    wrongHouse: number;
    /** Speech-bubble explanation or lesson on the board; null when closed. */
    tour: Tour | null;
    /** Placement key when a failure walk last reached its end (level 3 needs it). */
    testedKey: string | null;
    /** The disc proof was worked through on this level (levels 4 and 5 need it). */
    proofDone: boolean;
    /** Level 5's lesson shows plain farthest-first singles (the red house shown). */
    singlesDemo: boolean;
    /** "Why ≤ 2×?": discs of radius r/2 around these farthest-first houses. */
    discs: { houses: number[]; r: number } | null;
    /** True when the chargers sit exactly on the farthest-first placement. */
    atFarthestFirst: boolean;
    ghost: "none" | "best" | "bot";
    /** Radius at the level's start position: the goal meter fills from here. */
    startRadius: number;
    /** Drags since the level (re)started; a level's tip shows after a few. */
    drags: number;
    /** A charger was clicked on a level where chargers can't break. */
    tapNote: boolean;
    /** Chargers being dragged: one, or a whole stack when its bottom one was grabbed. */
    dragging: number[];
    /** The level's win rule holds right now (win.ts); set every redraw. */
    won: boolean;
}

export type Actions = ReturnType<typeof createActions>;

interface Tour {
    steps: TourStep[];
    index: number;
    /** A lesson (has "do" or "choose" steps): dragging and clicking don't close it. */
    interactive: boolean;
    /** "Choose" step: the answer picked (-1: none yet). */
    chosen: number;
    /** Per-step counters for "do" steps (see TourView). */
    tapped: number;
    wrongHouse: number;
    dragsAt: number;
    /** The answer picked at each "choose" step, by step index. */
    answers: (number | undefined)[];
}

// ---------------------------------------------------------------------------
// State and actions
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const firstLevel = instantiate(
    findLevel(params.get("level")),
    Number(params.get("seed")) || randomSeed(),
);

const state: AppState = {
    level: firstLevel,
    facilities: [],
    failed: [],
    l: firstLevel.def.l,
    result: { radius: 0, worstClient: -1, witnessFacility: -1 },
    after: null,
    farthestFirst: [],
    botRadius: NaN,
    botRevealed: false,
    steps: 0,
    totalSteps: 0,
    feedback: null,
    wrongHouse: -1,
    tour: null,
    testedKey: null,
    proofDone: false,
    singlesDemo: false,
    discs: null,
    atFarthestFirst: false,
    ghost: "none",
    startRadius: 0,
    drags: 0,
    tapNote: false,
    dragging: [],
    won: false,
};

let needsRedraw = true;

function randomSeed(): number {
    return Math.floor(Math.random() * 2 ** 31) || 1;
}

/** Same points, in any order (as multisets). */
function samePlacement(a: readonly Point[], b: readonly Point[]): boolean {
    return a.length === b.length && placementKey(a) === placementKey(b);
}

/** Recompute the plan and, if chargers are broken, the after-failure result. */
function recompute(): void {
    const { clients } = state.level;
    state.result = evaluate(clients, state.facilities, state.l);

    const working = state.facilities
        .map((_, i) => i)
        .filter((i) => !state.failed[i]);
    if (working.length < state.facilities.length) {
        const r = evaluate(
            clients,
            working.map((i) => state.facilities[i]),
            1,
        );
        const witness =
            r.witnessFacility >= 0 ? working[r.witnessFacility] : -1;
        state.after = { ...r, witnessFacility: witness };
    } else {
        state.after = null;
    }

    state.atFarthestFirst = samePlacement(
        state.facilities,
        state.farthestFirst,
    );
    needsRedraw = true;
}

function resetChargers(): void {
    labelled = [];
    state.tour = null;
    tourSavedFailed = null;
    state.discs = null;
    state.singlesDemo = false;
    state.l = state.level.def.startL ?? state.level.def.l;
    state.facilities = state.level.facilities
        .slice(0, MAX_FACILITIES)
        .map((p) => ({ ...p }));
    state.failed = state.facilities.map(() => false);
    state.steps = 0;
    state.feedback = null;
    state.drags = 0;
    state.tapNote = false;
    recompute();
    state.startRadius = state.result.radius;
}

function loadLevel(level: LevelInstance): void {
    const { clients, facilities, def } = level;
    const k = Math.min(facilities.length, MAX_FACILITIES);
    state.level = level;
    state.testedKey = null;
    state.proofDone = false;
    state.farthestFirst = twinGonzalez(clients, k, def.l);
    state.totalSteps = Math.max(
        0,
        gonzalez(clients, Math.floor(k / def.l)).length - 1,
    );
    state.botRadius = radius(clients, state.farthestFirst, def.l);
    state.botRevealed = false;
    state.ghost = "none";
    scene.setBounds(level.bounds);
    scene.setClients(clients);
    resetChargers();
    scene.popIn(state.facilities.length);
    wasWon = false;
    writeUrl();
    if (settings.briefing) openTour(briefing()); // the level's lesson, on arrival
}

function writeUrl(): void {
    const q = new URLSearchParams();
    if (state.level.def.id !== LEVELS[0].id) q.set("level", state.level.def.id);
    if (isRandom(state.level.def)) q.set("seed", String(state.level.seed));
    try {
        history.replaceState(null, "", q.size ? `?${q}` : location.pathname);
    } catch {
        // Some browsers block this on file:// pages; the URL is only a convenience.
    }
}

/** Farthest-first levels: can another charger (or pair) still be placed? */
function canPlace(): boolean {
    return (
        state.level.def.tool === "gonzalez" && state.steps < state.totalSteps
    );
}

/** Farthest-first finished and untouched: the "Why 2x?" picture applies. */
function proofAvailable(): boolean {
    return (
        state.level.def.tool === "gonzalez" &&
        state.steps >= state.totalSteps &&
        state.atFarthestFirst
    );
}

/** Levels with ℓ ≥ 2 where chargers can break get a "Test failures" button. */
function canTestFailures(): boolean {
    return state.level.def.allowFailures !== false && state.l >= 2;
}

/** Has the player met this level's goal (win.ts)? Finishing it opens the next level. */
function levelWon(): boolean {
    return wonRule({
        def: state.level.def,
        clients: state.level.clients,
        facilities: state.facilities,
        l: state.l,
        steps: state.steps,
        totalSteps: state.totalSteps,
        atFarthestFirst: state.atFarthestFirst,
        botRevealed: state.botRevealed,
        botRadius: state.botRadius,
        testedKey: state.testedKey,
        proofDone: state.proofDone,
    });
}

/** Farthest-first levels hide the red house; the player has to find it. */
function hideWorst(): boolean {
    if (state.singlesDemo) return false;
    return canPlace() && state.feedback !== "wrong";
}

/** Level start: the level's lesson, or just its task in one bubble. */
function briefing(): TourStep[] {
    const { def } = state.level;
    return def.lesson ? lesson() : briefingSteps(def.goal);
}

/** The level's lesson (lessons.ts). */
function lesson(): TourStep[] {
    const { clients, facilities, def } = state.level;
    const target = (def.targetFactor ?? 1) * (def.best?.radius ?? 0);
    const k = facilities.length;
    const rstar = def.best?.radius ?? NaN;
    switch (def.lesson) {
        case "cover":
            return coverLesson(clients, facilities, target);
        case "backups":
            return backupsLesson(clients, facilities, target);
        case "failures":
            return failuresLesson(clients, facilities, target);
        case "gonzalez":
            return gonzalezLesson(clients, k, state.botRadius, rstar);
        case "twins":
            return twinsLesson(clients, k);
        case "twinbot":
            return twinbotLesson(state.botRadius, rstar);
    }
    return [];
}

/** The explanation that fits the current situation (the ? button). */
function explanation(): TourStep[] {
    const { clients, def } = state.level;
    if (def.tool === "bot" && state.botRevealed) {
        const loss = botLossSteps(
            clients,
            state.facilities,
            state.farthestFirst,
            state.l,
        );
        if (loss.length > 0) return loss;
    }
    if (state.feedback === "wrong" && canPlace())
        return wrongHouseSteps(
            clients,
            state.facilities,
            state.l,
            state.wrongHouse,
        );
    return briefing(); // nothing went wrong: the level's lesson again
}

/** What "do" and "choose" steps can see (lessons.ts). */
function tourView(): TourView {
    const t = state.tour;
    return {
        clients: state.level.clients,
        facilities: state.facilities,
        failed: state.failed,
        l: state.l,
        radius: state.result.radius,
        worstClient: state.result.worstClient,
        witnessFacility: state.result.witnessFacility,
        after: state.after,
        tapped: t?.tapped ?? -1,
        wrongHouse: t?.wrongHouse ?? -1,
        drags: t ? state.drags - t.dragsAt : 0,
        steps: state.steps,
        totalSteps: state.totalSteps,
        answers: t?.answers ?? [],
    };
}

/** "Why ≤ 2×?": discs around the k′ + 1 houses farthest-first picked. */
function showDiscs(): void {
    const k = state.facilities.length;
    state.discs = {
        houses: gonzalez(
            state.level.clients,
            Math.floor(k / state.level.def.l) + 1,
        ),
        r: state.result.radius,
    };
}

/** What a step does to the game when it opens, or when an answer is picked. */
function applyEffect(e: TourEffect | undefined): void {
    if (!e) return;
    const { clients, facilities } = state.level;
    if (e.setL !== undefined) {
        state.l = e.setL;
    }
    if (e.tested) state.testedKey = placementKey(state.facilities);
    if (e.restart || e.singles !== undefined) state.singlesDemo = !!e.singles;
    if (e.restart) {
        state.facilities = facilities.map((p) => ({ ...p }));
        state.steps = 0;
        state.feedback = null;
    }
    if (e.singles)
        state.facilities = gonzalez(clients, state.facilities.length).map(
            (i) => ({ ...clients[i] }),
        );
    if (e.showMe && canPlace()) placeOn(state.result.worstClient);
    if (e.proofDone) state.proofDone = true;
    if (e.revealBot) {
        state.botRevealed = true;
        state.ghost = "bot";
    }
    if (e.discs) showDiscs();
    if (e.best !== undefined) state.ghost = e.best ? "best" : "none";
    recompute();
}

/** A "do" step whose condition holds moves the tour on (never mid-drag). */
function checkGate(): void {
    const t = state.tour;
    if (!t || state.dragging.length > 0) return;
    if (t.steps[t.index].waitFor?.(tourView()) !== true) return;
    // A small reward for a step done, unless this also finishes the level
    // (that gets the bigger one).
    // (no sound: the drop that finished it already made one)
    if (!(levelWon() && !wasWon)) celebrateAt(false);
    advanceTour();
}

/** Was the level won at the last redraw? (A change to won is celebrated.) */
let wasWon = false;

/** Gold rings and sparks at the worst-off house (the house that decides r). */
function celebrateAt(big: boolean): void {
    const at = state.level.clients[state.result.worstClient];
    if (at) scene.celebrate(at, big);
}

/** Go to the next tour step (or close the tour after the last). */
function advanceTour(): void {
    if (!state.tour) return;
    if (state.tour.index + 1 >= state.tour.steps.length) closeTour();
    else {
        state.tour.index++;
        showTourStep();
    }
}

/** Back is only for reading: never into or out of a step that acts on the game. */
function canGoBack(t: Tour): boolean {
    if (t.index === 0) return false;
    const prev = t.steps[t.index - 1];
    return (
        !prev.waitFor && !prev.choices && !prev.enter && !t.steps[t.index].enter
    );
}

/** Broken chargers before a failure walk-through, put back when it closes. */
let tourSavedFailed: boolean[] | null = null;

function openTour(steps: TourStep[]): void {
    closeTour();
    if (steps.length === 0) return;
    state.tour = {
        steps,
        index: 0,
        interactive: isInteractive(steps),
        chosen: -1,
        tapped: -1,
        wrongHouse: -1,
        dragsAt: state.drags,
        answers: [],
    };
    showTourStep();
}

/** Apply what the current step does on the board (effects, a broken charger), then redraw. */
function showTourStep(): void {
    clearHouseLabels(); // last step's comparisons don't belong to this one
    const t = state.tour;
    if (t) {
        t.chosen = -1;
        t.tapped = -1;
        t.wrongHouse = -1;
        t.dragsAt = state.drags;
    }
    const step = t?.steps[t.index];
    applyEffect(step?.enter);
    if (step?.breaks !== undefined) {
        tourSavedFailed ??= state.failed;
        state.failed = state.facilities.map((_, j) => j === step.breaks);
        recompute();
    }
    needsRedraw = true;
}

function closeTour(): void {
    if (!state.tour) return;
    state.tour = null;
    state.discs = null;
    if (tourSavedFailed) {
        state.failed = tourSavedFailed;
        tourSavedFailed = null;
        recompute();
    }
    needsRedraw = true;
}

/** Move the top l chargers of the starting stack onto a house. */
function placeOn(house: number): void {
    const k = state.facilities.length;
    const l = state.l;
    const s = state.steps + 1;
    for (let j = k - s * l; j < k - (s - 1) * l; j++)
        Object.assign(state.facilities[j], state.level.clients[house]);
    state.steps = s;
    recompute();
}

function createActions() {
    return {
        toggleFailed(i: number) {
            const lesson = state.tour?.interactive;
            if (lesson) state.tour!.tapped = i;
            if (state.level.def.allowFailures === false) {
                state.tapNote = !lesson;
                needsRedraw = true;
                return;
            }
            if (!lesson) closeTour();
            state.failed[i] = !state.failed[i];
            play("click");
            recompute();
        },
        /** Walk through every single failure, one charger at a time. */
        testFailures() {
            if (!canTestFailures()) return;
            closeTour();
            openTour(
                failureSteps(state.level.clients, state.facilities, state.l),
            );
        },
        /** "Why ≤ 2×?": the disc proof on the finished placement. */
        explainProof() {
            if (!proofAvailable()) return;
            const k = state.facilities.length;
            const l = state.level.def.l;
            const r = state.result.radius;
            openTour(proofLesson(Math.floor(k / l) + 1, l, k, r));
        },
        reset() {
            resetChargers();
            if (settings.briefing && state.level.def.lesson) openTour(lesson());
        },
        newInstance() {
            if (isRandom(state.level.def))
                loadLevel(instantiate(state.level.def, randomSeed()));
        },
        chooseLevel(id: string) {
            loadLevel(instantiate(findLevel(id), randomSeed()));
        },
        /** The pause screen (Esc or ≡). */
        pause() {
            pause.open(); // a lesson stays where it was
        },
        /** After finishing a level: the next one, or the grid after the last. */
        nextLevel() {
            const next = LEVELS[LEVELS.indexOf(state.level.def) + 1];
            if (next) loadLevel(instantiate(next, randomSeed()));
            else {
                closeTour();
                menu.show();
            }
        },
        /**
         * Farthest-first, played by the player: clicking the house farthest from
         * every charger moves the next charger (or pair) there. Any other house
         * reveals the red one instead.
         */
        clickHouse(house: number) {
            if (!canPlace()) return;
            const d = lthNearestDist(
                state.level.clients[house],
                state.facilities,
                state.l,
            );
            const lesson = state.tour?.interactive;
            if (d >= state.result.radius - 1e-9) {
                state.feedback = "right";
                play("click");
                if (lesson) state.tour!.wrongHouse = -1;
                else closeTour();
                placeOn(house);
            } else if (lesson) {
                // In a lesson the "do" step says why, and the red house shows.
                state.feedback = "wrong";
                play("click");
                state.tour!.wrongHouse = house;
                needsRedraw = true;
            } else {
                // Explain on the board: this house, then the farthest one.
                state.feedback = "wrong";
                play("click");
                state.wrongHouse = house;
                openTour(explanation());
            }
        },
        /** "Show me": place the next charger (or pair) on the farthest house. */
        showMe() {
            if (!canPlace()) return;
            state.feedback = null;
            if (!state.tour?.interactive) closeTour();
            placeOn(state.result.worstClient);
        },
        toggleBot() {
            if (state.level.def.tool !== "bot") return;
            const firstReveal = !state.botRevealed;
            state.botRevealed = true;
            state.ghost = state.ghost === "bot" ? "none" : "bot";
            needsRedraw = true;
            // A loss explains itself; a win needs no bubble.
            if (firstReveal && !state.tour?.interactive) {
                const loss = botLossSteps(
                    state.level.clients,
                    state.facilities,
                    state.farthestFirst,
                    state.l,
                );
                if (loss.length > 0) openTour(loss);
            }
        },
        /** "Why?": walk through the current explanation on the board. */
        explain() {
            openTour(explanation());
        },
        tourChoose(i: number) {
            const t = state.tour;
            const choice = t?.steps[t.index].choices?.[i];
            if (!t || !choice || t.chosen >= 0) return;
            t.chosen = i;
            t.answers[t.index] = i;
            applyEffect(choice.effect);
            needsRedraw = true;
        },
        tourNext() {
            if (!state.tour) return;
            const cur = state.tour.steps[state.tour.index];
            // "Do" steps move on by themselves; "choose" steps need an answer first.
            if (cur.waitFor && cur.waitFor(tourView()) !== true) return;
            if (cur.choices && state.tour.chosen < 0) return;
            advanceTour();
        },
        tourBack() {
            if (!state.tour || !canGoBack(state.tour)) return;
            state.tour.index--;
            showTourStep();
        },
        tourClose: closeTour,
        toggleBest() {
            if (!state.level.def.best) return;
            state.ghost = state.ghost === "best" ? "none" : "best";
            needsRedraw = true;
        },
    };
}

// ---------------------------------------------------------------------------
// Scene, HUD, input
// ---------------------------------------------------------------------------

const stage = document.getElementById("stage")!;
let scene: KCentreScene;
try {
    scene = new KCentreScene(stage, MAX_FACILITIES);
} catch (err) {
    document.getElementById("nogl")!.style.display = "grid";
    document.getElementById("hud")!.hidden = true;
    throw err;
}

const actions = createActions();
const menu = createMenu((id) => actions.chooseLevel(id));
const pause = createPause({
    resume: () => pause.close(),
    levels: () => {
        pause.close();
        menu.show();
    },
});
const hud = createHud(actions);
const bubble = createBubble({
    next: actions.tourNext,
    back: actions.tourBack,
    close: actions.tourClose,
    choose: actions.tourChoose,
});

attachPointer(scene, {
    position: (i) => state.facilities[i],
    onDragStart(i) {
        play("lift");
        // An explanation was about the old placement; a lesson stays open.
        if (!state.tour?.interactive) closeTour();
        state.tapNote = false;
        // Grabbing the bottom charger of a stack moves the whole stack; any other
        // charger comes off on its own. (Lower index = lower in the stack.)
        const p = state.facilities[i];
        const stack = state.facilities
            .map((_, j) => j)
            .filter(
                (j) =>
                    state.facilities[j].x === p.x &&
                    state.facilities[j].y === p.y,
            );
        state.dragging = stack[0] === i ? stack : [i];
        needsRedraw = true;
    },
    onDrag(_i, to) {
        if (state.dragging.length === 0) return;
        clampToBounds(to, state.level.bounds);
        const near = state.facilities.find(
            (g, j) =>
                !state.dragging.includes(j) &&
                Math.hypot(g.x - to.x, g.y - to.y) < SNAP_DIST,
        );
        const target = near ?? to; // snap onto a nearby charger: a stack
        for (const j of state.dragging)
            Object.assign(state.facilities[j], { x: target.x, y: target.y });
        recompute();
    },
    onDragEnd() {
        play("drop");
        scene.dropped(state.dragging);
        navigator.vibrate?.(8); // a tiny tap where supported (Android)
        state.dragging = [];
        state.drags++;
        needsRedraw = true;
    },
    onTap: actions.toggleFailed,
    onHouseClick: actions.clickHouse,
    onHoverHouse: showHouseDistance,
});

/** Houses whose distance labels show, most recently hovered first (at most 3). */
let labelled: number[] = [];

/** Hovering a house pins its distance label; the last three stay, for comparing. */
function showHouseDistance(house: number): void {
    if (house < 0 || labelled[0] === house) return;
    labelled = [house, ...labelled.filter((h) => h !== house)].slice(0, 3);
    updateHouseLabels();
}

/** Remove the distance labels (a new lesson step, a new level). */
function clearHouseLabels(): void {
    labelled = [];
    updateHouseLabels();
}

/** Each label shows its house's distance to its ℓ-th nearest charger, kept up to date. */
function updateHouseLabels(): void {
    const box = document.getElementById("house-labels")!;
    while (box.children.length < labelled.length)
        box.appendChild(document.createElement("div")).className =
            "house-label";
    [...box.children].forEach((node, k) => {
        const label = node as HTMLElement;
        const c = state.level.clients[labelled[k]];
        label.hidden = !c;
        if (!c) return;
        const d = lthNearestDist(c, state.facilities, state.l);
        label.textContent = `${Number.isFinite(d) ? d.toFixed(2) : "∞"}${k === 0 ? ` from its ${state.l === 1 ? "nearest" : "2nd-nearest"} charger` : ""}`;
        label.style.opacity = k === 0 ? "1" : "0.8";
        const at = scene.anchorOnScreen("house", labelled[k])!;
        label.style.transform = `translate(${at.x + 12}px, ${at.y - 26}px)`;
    });
}

// Every button sounds the same quiet click.
document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) play("click");
});

applyIcons();

// Mute: a button beside the menu button, remembered between visits.
const muteBtn = document.getElementById("mute")!;
function showMute(): void {
    setIcon(muteBtn, settings.muted ? "audioOff" : "audioOn");
    muteBtn.title = settings.muted ? "Sound off (M)" : "Sound on (M)";
    muteBtn.setAttribute("aria-pressed", String(settings.muted));
}
function toggleMute(): void {
    setSetting("muted", !settings.muted);
    showMute();
}
muteBtn.addEventListener("click", toggleMute);
showMute();

// Shortcuts act on the game only, not while the level grid is open.
const keys: Record<string, () => void> = {
    r: actions.reset,
    n: actions.newInstance,
    s: actions.showMe,
    b: actions.toggleBot,
    o: actions.toggleBest,
    t: actions.testFailures,
    w: actions.explainProof,
    arrowright: actions.tourNext,
    arrowleft: actions.tourBack,
    h: actions.explain,
    m: toggleMute,
};
attachKeys(
    Object.fromEntries(
        Object.entries(keys).map(([key, run]) => [
            key,
            () => {
                if (!menu.isOpen() && !pause.isOpen()) run();
            },
        ]),
    ),
);

new ResizeObserver(() => {
    scene.resize(stage.clientWidth, stage.clientHeight);
    needsRedraw = true;
}).observe(stage);

/**
 * Where a bubble may go: what its tail points at (a house's roof, a charger's own
 * top, or just under the goal box) and what it must not cover.
 */
function placement(step: TourStep, a: Anchor): Placement | null {
    const box = document.getElementById("hud")!.getBoundingClientRect();
    const minTop = box.bottom + 8;
    const none = { x: 0, y: 0 };
    if (a.kind === "dock")
        return {
            top: none,
            side: null,
            preferSide: false,
            minTop,
            keepVisible: [],
            dock: true,
        };
    if (a.kind === "panel") {
        // Under the goal box; dock instead if that would hide a charger or the red house.
        const top = { x: box.left + box.width / 2, y: box.bottom - 26 };
        const keep = [
            ...state.facilities.map((_, i) => scene.anchorOnScreen("stack", i)),
            scene.anchorOnScreen("house", state.result.worstClient),
        ].filter((p): p is { x: number; y: number } => !!p);
        return {
            top,
            side: null,
            preferSide: false,
            minTop,
            keepVisible: keep,
            alsoVisible: state.level.clients
                .map((_, h) => scene.anchorOnScreen("house", h))
                .filter((p): p is { x: number; y: number } => !!p),
            dockIfCrowded: true,
        };
    }
    const top = scene.anchorOnScreen(a.kind, a.index);
    const side = scene.anchorOnScreen(a.kind, a.index, true);
    if (!top || !side) return null;
    // A charger with others stacked on it: speak from the side so its stack shows.
    const stackTop =
        a.kind === "charger" ? scene.anchorOnScreen("stack", a.index) : null;
    const preferSide = !!stackTop && stackTop.y < top.y - 1;
    // Keep visible: the rest of its stack, the red house and charger of the red
    // line, and the broken charger (all but the target itself).
    const keep = [
        preferSide ? stackTop : null,
        step.highlight
            ? scene.anchorOnScreen("house", step.highlight.house)
            : null,
        step.highlight
            ? scene.anchorOnScreen("stack", step.highlight.charger)
            : null,
        step.breaks !== undefined
            ? scene.anchorOnScreen("stack", step.breaks)
            : null,
    ].filter(
        (p): p is { x: number; y: number } =>
            !!p && Math.hypot(p.x - top.x, p.y - top.y) > 6,
    );
    // The best placement's ghosts, when shown, are what the step talks about.
    if (state.ghost === "best")
        for (const g of state.level.def.best?.facilities ?? [])
            keep.push(scene.pointOnScreen(g, 0.5));
    // Keep every charger and the red house in view where possible: the bubble
    // takes the spot that hides the fewest. A "do" step that would hide any of them
    // (the player has to act on the board) docks off the board instead.
    state.facilities.forEach((_, i) => {
        const p = scene.anchorOnScreen("stack", i);
        if (p && Math.hypot(p.x - top.x, p.y - top.y) > 6) keep.push(p);
    });
    const red = scene.anchorOnScreen("house", state.result.worstClient);
    if (red && Math.hypot(red.x - top.x, red.y - top.y) > 6) keep.push(red);
    return {
        top,
        side,
        preferSide,
        minTop,
        keepVisible: keep,
        alsoVisible: state.level.clients
            .map((_, h) => scene.anchorOnScreen("house", h))
            .filter(
                (p): p is { x: number; y: number } =>
                    !!p && Math.hypot(p.x - top.x, p.y - top.y) > 6,
            ),
        dockIfCrowded: true,
    };
}

// Esc: close a bubble, else open / step back out of the pause screen.
window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || menu.isOpen()) return;
    e.preventDefault();
    if (pause.isOpen()) pause.back();
    else if (state.tour) actions.tourClose();
    else actions.pause();
});

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------

let last = performance.now();

function tick(now: number): void {
    // Seconds since the last frame, kept in [0, 0.1]: the first frame's timestamp can
    // be a little earlier than the script's start, and a long pause must not jump.
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (needsRedraw) {
        needsRedraw = false;
        checkGate();
        // Show what happens now: after a failure, each house's nearest working charger.
        const shown = state.after ?? state.result;
        const hidden = hideWorst();
        // A bubble step can point the red house and line at what it talks about.
        const focus = state.tour?.steps[state.tour.index].highlight;
        const discs = state.discs;
        scene.sync({
            clients: state.level.clients,
            facilities: state.facilities,
            failed: state.failed,
            radius: discs ? Infinity : shown.radius, // the proof discs replace the rings
            worstClient: focus ? focus.house : hidden ? -1 : shown.worstClient,
            witnessFacility: focus
                ? focus.charger
                : hidden
                  ? -1
                  : shown.witnessFacility,
            dragging: state.dragging,
        });
        if (state.ghost === "best")
            scene.setGhosts(
                state.level.def.best?.facilities ?? null,
                GHOST_BEST,
            );
        else if (state.ghost === "bot")
            scene.setGhosts(state.farthestFirst, GHOST_BOT);
        else scene.setGhosts(null);
        // Why 2x: the k' + 1 farthest-first houses are all ≥ r apart, so discs of
        // radius r/2 around them can't overlap.
        scene.setProofDiscs(
            discs ? discs.houses.map((h) => state.level.clients[h]) : null,
            (discs?.r ?? 0) / 2,
        );
        // A win counts once the chargers are put down, not while one passes
        // through a good spot in the middle of a drag.
        state.won = state.dragging.length === 0 && levelWon();
        if (state.won) markCompleted(state.level.def.id);
        if (state.won && !wasWon) {
            play("goal");
            celebrateAt(true);
            // The last level: a short recap of the whole game.
            if (state.level.def === LEVELS[LEVELS.length - 1] && !state.tour)
                openTour(summarySteps());
        }
        if (state.dragging.length === 0) wasWon = state.won;
        hud.render(state);
        renderBubble();
        updateHouseLabels();
    }
    // Behind the level grid or the pause screen the board is blurred and still: draw changes only.
    scene.frame(dt, menu.isOpen() || pause.isOpen());
    requestAnimationFrame(tick);
}

/** The current tour step, resolved against the game, into the speech bubble. */
function renderBubble(): void {
    const tour = state.tour;
    if (!tour) return bubble.render(null, null);
    const step = tour.steps[tour.index];
    const v = tourView();
    const anchor =
        typeof step.anchor === "function" ? step.anchor(v) : step.anchor;
    const gate = step.waitFor?.(v);
    const choice = tour.chosen >= 0 ? step.choices?.[tour.chosen] : undefined;
    bubble.render(
        {
            text: typeof step.text === "function" ? step.text(v) : step.text,
            feedback: choice?.reply ?? (typeof gate === "string" ? gate : null),
            index: tour.index,
            total: tour.steps.length,
            choices:
                step.choices && tour.chosen < 0
                    ? step.choices.map((c) => c.label)
                    : null,
            // Never "Next" mid-drag: the step moves on when the charger is put down.
            waiting:
                !!step.waitFor && (gate !== true || state.dragging.length > 0),
            canBack: canGoBack(tour),
        },
        placement(step, anchor),
    );
}

loadLevel(firstLevel);
// Start at the level grid, unless the URL names a level (a reload, or a direct link).
if (!params.get("level")) {
    closeTour();
    menu.show();
}
scene.resize(stage.clientWidth, stage.clientHeight);
requestAnimationFrame(tick);

// Debug handle for the console and automated browser checks.
(window as unknown as { kcentre: unknown }).kcentre = {
    state,
    scene,
    actions,
    won: levelWon,
    sound: soundDebug,
};

// Embedded in another page (the report): offer fullscreen, which the host iframe must
// allow with allow="fullscreen".
{
    const fsBtn = document.getElementById(
        "fullscreen",
    ) as HTMLButtonElement | null;
    const embedded = window.self !== window.top;
    if (fsBtn && embedded && document.fullscreenEnabled) {
        fsBtn.hidden = false;
        fsBtn.addEventListener("click", () => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen();
        });
        // Kenney's "larger" to enter fullscreen, "smaller" to leave it.
        document.addEventListener("fullscreenchange", () => {
            const on = !!document.fullscreenElement;
            setIcon(fsBtn, on ? "smaller" : "larger");
            fsBtn.title = on ? "Exit fullscreen" : "Fullscreen";
            fsBtn.setAttribute("aria-label", fsBtn.title);
        });
    }
}
