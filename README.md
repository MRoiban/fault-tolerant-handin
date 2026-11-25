# Fault-tolerant k-centre

An interactive game that teaches the **fault-tolerant Euclidean k-centre problem**: place
k chargers so that every house has ℓ of them within radius r, and make r as small as possible.
It follows the paper by S. Durocher, S. Lamey and P. C. Li, “Fault-Tolerant Euclidean
k-Centres”, CCCG 2025. Final project for INFO-F420 (Computational Geometry).

**Play online:** https://kcentre.mc2.onl

Seven levels build the idea step by step: covering a town, backup chargers, what happens when
one fails, the farthest-first algorithm, its fault-tolerant version (the paper's
2-approximation), a level where that algorithm is beaten, and a match against a bot.

## Run it (no build needed)

Open `index.html` in a current browser (Chrome, Firefox, Safari or Edge). It is one
self-contained file: no server, no network. The report is `report.html` next to it. In the
hand-in ZIP both are at the top level; after a build they are in `dist/`.

## Build it from source

Needs [Node.js](https://nodejs.org) 20.19+ or 22.12+.

```sh
npm install
npm run build    # type-check, then build dist/index.html (and copy the report to dist/)
npm run dev      # development server with live reload, http://localhost:5173
npm test         # unit tests (geometry, lessons, levels, win rules)
npm run zip      # build, then fault-tolerant-k-centre.zip: index.html, report.html, source/
npm run format   # Prettier
```

`npm run build` checks that `dist/` opens from `file://`: every script, style, sound and image
is inlined into the page.

## Source

```
index.html        the page: layout and styles
src/main.ts       state, actions and the frame loop
src/geometry.ts   the course maths: ℓ-th nearest distance, radius, farthest-first (Gonzalez),
                  the paper's fault-tolerant farthest-first (2-approximation)
src/levels.ts     the seven levels (plain data, with each level's optimal radius r*)
src/lessons.ts    each level's lesson, taught by doing
src/win.ts        when a level counts as finished
src/scene.ts      the three.js isometric board
src/hud.ts, menu.ts, pause.ts, bubble.ts, input.ts, sound.ts, effects.ts   interface
src/*.test.ts     unit tests (Vitest); the 2× bound is checked against a brute-force optimum
report/           the report page (report.html) and its Typst source (report/source/)
scripts/          build checks and the ZIP
```

Libraries: [three.js](https://threejs.org), seedrandom, poisson-disk-sampling;
vite-plugin-singlefile and fflate for the build. Sounds and icons are by
[Kenney](https://kenney.nl) (CC0; licences in `src/sounds/` and `src/icons/`).
