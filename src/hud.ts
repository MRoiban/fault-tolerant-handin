/**
 * The HTML overlay: one "goal vs you" box at the top centre and the action
 * buttons under it. Everything else lives in the speech bubbles (explain.ts)
 * or on the pause screen (pause.ts).
 * `render(state)` rewrites everything from the state; it is cheap, so no caching.
 */
import { setLabel } from "./icons";
import { isRandom, LEVELS } from "./levels";
import { isCompleted } from "./progress";
import type { Actions, AppState } from "./main";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

const fmt = (r: number) => (Number.isFinite(r) ? r.toFixed(2) : "∞");
const EPS = 1e-9;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const R = '<i class="math">r</i>';
const reducedMotion = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Replay a CSS animation class on an element. */
function flash(e: HTMLElement, cls: string): void {
    e.classList.remove(cls);
    void e.offsetWidth;
    e.classList.add(cls);
}

export function createHud(actions: Actions) {
    const nextBtn = el<HTMLButtonElement>("nextlevel");
    const showMeBtn = el<HTMLButtonElement>("step");
    const botBtn = el<HTMLButtonElement>("bot");
    const bestBtn = el<HTMLButtonElement>("ghost");
    const newBtn = el<HTMLButtonElement>("new");
    const testBtn = el<HTMLButtonElement>("test");
    const proofBtn = el<HTMLButtonElement>("proof");

    el("why").addEventListener("click", actions.explain);
    el("pausebtn").addEventListener("click", actions.pause);
    nextBtn.addEventListener("click", actions.nextLevel);
    el("reset").addEventListener("click", actions.reset);
    newBtn.addEventListener("click", actions.newInstance);
    showMeBtn.addEventListener("click", actions.showMe);
    botBtn.addEventListener("click", actions.toggleBot);
    bestBtn.addEventListener("click", actions.toggleBest);
    testBtn.addEventListener("click", actions.testFailures);
    proofBtn.addEventListener("click", actions.explainProof);

    // The radius r in the box: exact and live during a drag; after a drop or a
    // failure toggle it counts to its new value, and flashes green when it improved.
    const youEl = el("you");
    let shown = NaN;
    let shownLevel = "";
    let anim = 0;
    function showRadius(r: number, live: boolean, level: string): void {
        if (r === shown && level === shownLevel) return;
        cancelAnimationFrame(anim);
        const from = shown;
        const animate =
            !live &&
            level === shownLevel &&
            Number.isFinite(from) &&
            Number.isFinite(r) &&
            !reducedMotion();
        shown = r;
        shownLevel = level;
        if (!animate) {
            youEl.textContent = fmt(r);
            return;
        }
        if (r < from - EPS) flash(youEl, "better");
        const t0 = performance.now();
        const stepTo = (now: number) => {
            const t = Math.min((now - t0) / 250, 1);
            const eased = 1 - (1 - t) * (1 - t);
            youEl.textContent = fmt(from + (r - from) * eased);
            if (t < 1) anim = requestAnimationFrame(stepTo);
        };
        anim = requestAnimationFrame(stepTo);
    }
    let wonShown = false;

    function render(state: AppState): void {
        const { def } = state.level;
        const broken = state.failed.filter(Boolean).length;
        const r = state.result.radius;
        const atFarthestFirst = state.atFarthestFirst;
        const best = def.best;
        const stepping = def.tool === "gonzalez";
        const finished = stepping && state.steps >= state.totalSteps;
        const target =
            def.targetFactor && best ? def.targetFactor * best.radius : NaN;

        // Head: level name and ℓ.
        el("leveltitle").textContent = def.title;
        const chip = el("lchip");
        // ℓ is introduced in level 2; from then on every level shows it.
        chip.hidden = LEVELS.indexOf(def) < 1;
        chip.textContent = `ℓ = ${state.l} charger${state.l === 1 ? "" : "s"} per house`;
        // While a lesson or explanation is open, its bubble gives the instructions.
        const lesson = state.tour !== null;

        // "You": the radius r (the plan's, while chargers are broken).
        el("youk").innerHTML =
            broken > 0 ? `Planned radius ${R}` : `Your radius ${R}`;
        showRadius(r, state.dragging.length > 0, def.id);
        // With chargers broken: the radius right now, beside the planned one.
        const nowEl = el("younow");
        nowEl.hidden = !state.after;
        if (state.after) {
            nowEl.textContent = `now ${fmt(state.after.radius)}`;
            nowEl.className = `now ${state.after.radius <= r + EPS ? "ok" : "bad"}`;
        }

        // "Goal", the meter between, and one line under it.
        let goalK = "Goal";
        let goalV = "";
        let meter = 0;
        let won = false;
        let sub = "";
        let tone: "" | "ok" | "bad" | "warn" = "";

        if (def.tool === "bot") {
            goalK = state.l === 1 ? "Bot's radius" : "Twin rule's radius";
            goalV = state.botRevealed ? fmt(state.botRadius) : "?";
            const beaten = state.botRevealed && r < state.botRadius - EPS;
            won = state.won;
            meter = !state.botRevealed
                ? 0
                : beaten
                  ? 1
                  : clamp01(state.botRadius / r);
            if (!state.botRevealed)
                sub = "Place your chargers, then press Bot to compare.";
            else if (beaten) {
                sub =
                    state.l === 1
                        ? "You beat the bot!"
                        : "You beat the twin rule! It only puts pairs on houses.";
                tone = "ok";
            } else if (lesson) {
                // The lesson bubble is talking: no verdict and no instructions here.
            } else if (r <= state.botRadius + EPS)
                sub = "A tie. Can you get below it?";
            else if (state.drags === 0)
                sub = "Drag your chargers to beat it."; // not a loss before a move
            else {
                sub = "You lost. Press ? to see why.";
                tone = "warn";
            }
        } else if (stepping) {
            const unit = state.l === 1 ? "chargers" : "pairs";
            goalK = "Farthest-first";
            goalV = `${state.steps + 1} / ${state.totalSteps + 1} ${unit}`;
            meter = (state.steps + 1) / (state.totalSteps + 1);
            won = state.won;
            if (!finished) {
                if (state.feedback === "wrong") {
                    sub = lesson
                        ? "Not that one: the red house is farther."
                        : "Not that one: the red house is farther. Press ? to see why.";
                    tone = "warn";
                } else if (state.feedback === "right") {
                    sub = "Right!";
                    tone = "ok";
                } else if (!lesson)
                    sub = `Click the house farthest from its nearest charger: the next ${state.l === 1 ? "charger" : "pair"} goes there.`;
            } else if (!atFarthestFirst) {
                sub = `You moved a charger (farthest-first got ${fmt(state.botRadius)}). Reset to replay.`;
            } else if (best) {
                const ratio = r / best.radius;
                sub = state.won
                    ? `Done: ${ratio.toFixed(2)} × the best radius r*, and never more than 2×.`
                    : state.tour?.interactive // the lesson walks there itself
                      ? `Done: ${ratio.toFixed(2)} × the best radius r*.`
                      : `Done: ${ratio.toFixed(2)} × the best radius r*. To finish, see why it is never more than 2×: press Why ≤ 2×?`;
                tone = "ok";
            }
        } else if (Number.isFinite(target)) {
            goalK = "Goal radius";
            goalV = `≤ ${fmt(target)}`;
            // Only at the level's own ℓ (level 2 starts at ℓ = 1).
            const reached = state.l === def.l && r <= target + EPS;
            won = state.won;
            const start = state.startRadius;
            meter = reached ? 1 : clamp01((start - r) / (start - target));
            if (won) {
                sub = "Goal reached ✓";
                tone = "ok";
            } else if (reached && def.requires?.includes("tested")) {
                sub = "Goal reached. To finish, check it: press Test failures.";
                tone = "ok";
            } else if (def.tip && state.drags >= 4) sub = def.tip;
        }

        // Broken chargers: what happens now (overrides the line above).
        if (state.after) {
            const tolerated = state.l - 1;
            const now = state.after.radius;
            const ok = now <= r + EPS;
            const n =
                broken === 1 ? "1 charger broken" : `${broken} chargers broken`;
            if (!Number.isFinite(now)) {
                sub = "Every charger is broken: no house can be served.";
                tone = "bad";
            } else if (ok && broken <= tolerated) {
                sub = `${n}: radius now ${fmt(now)}, still within r ✓`;
                tone = "ok";
            } else if (ok) {
                sub = `${n}, more than ℓ − 1 = ${tolerated}: radius now ${fmt(now)}, within r only by luck.`;
                tone = "warn";
            } else {
                sub =
                    tolerated === 0
                        ? `${n}: no backup with ℓ = 1, radius now ${fmt(now)}.`
                        : `${n}, more than ℓ − 1 = ${tolerated}: radius now ${fmt(now)}.`;
                tone = "bad";
            }
        }
        if (state.tapNote && !state.after) {
            sub = "Chargers can't break on this level.";
            tone = "";
        }
        // Lesson modes: the box describes what the board shows right now.
        if (state.singlesDemo) {
            goalV = `${state.facilities.length} singles`;
            meter = 0;
            sub = `For comparison: farthest-first with ${state.facilities.length} single chargers, scored at ℓ = 2.`;
            tone = "";
        } else if (state.discs) {
            sub = "Why ≤ 2×? The disc proof.";
            tone = "";
        }
        if (!Number.isFinite(r) && state.level.clients.length > 0)
            sub = `Fewer than ℓ = ${state.l} chargers: some house can't be served.`;

        el("goalk").textContent = goalK;
        el("goalv").textContent = goalV;
        el("meter").style.width = `${Math.round(meter * 100)}%`;
        el("strip").classList.toggle("won", won);
        // Reaching the goal: one gold pulse of the box (none under reduced motion).
        if (won && !wonShown && !reducedMotion())
            flash(el("strip"), "celebrate");
        wonShown = won;
        const subEl = el("sub");
        subEl.textContent = sub;
        subEl.className = `sub ${tone}`;

        // Buttons: Show best and Reset always; the level's own action when it applies.
        newBtn.hidden = !isRandom(def);
        showMeBtn.hidden = !stepping || finished || state.singlesDemo;
        testBtn.hidden = def.allowFailures === false || state.l < 2;
        proofBtn.hidden =
            !(finished && atFarthestFirst) || state.discs !== null;
        botBtn.hidden = def.tool !== "bot";
        // Level 6's bot is the twin rule: call it that.
        const botName = state.l === 2 ? "twin rule" : "bot";
        setLabel(
            botBtn,
            !state.botRevealed
                ? state.l === 2
                    ? "Twin rule"
                    : "Bot"
                : state.ghost === "bot"
                  ? `Hide ${botName}`
                  : `Show ${botName}`,
        );
        botBtn.setAttribute("aria-pressed", String(state.ghost === "bot"));
        bestBtn.hidden = !best || (def.tool === "bot" && !state.botRevealed);
        setLabel(bestBtn, state.ghost === "best" ? "Hide best" : "Show best");
        bestBtn.title = best
            ? `Show a best placement: best radius r* = ${fmt(best.radius)} (O)`
            : "";
        bestBtn.setAttribute("aria-pressed", String(state.ghost === "best"));

        // Finished: the next level (or the grid after the last one).
        const index = LEVELS.indexOf(def);
        nextBtn.hidden = !isCompleted(def.id);
        setLabel(
            nextBtn,
            index < LEVELS.length - 1 ? "Next level" : "All levels done",
        );
    }

    return { render };
}
