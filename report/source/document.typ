// A normal Incipit document. `incipit-web build` turns it into a web page; the settings
// are in config.yaml. Only #widget is web-only.
#import "@local/incipit:0.1.0": *
#show: incipit.with(
  title: [Fault-Tolerant Euclidean #box[$k$-]Centers],
  short-title: [Fault-Tolerant Euclidean k-Centers],
  kicker: [Web Report · Computational Geometry],
  subtitle: [An interactive educational tool],
  authors: "Roiban Marius-Alexandru · 000519268",
  after-byline: widget("links"),
  date: datetime(year: 2026, month: 11, day: 25),
  bibliography: bibliography("refs.bib"),
  colour: "rubricated",
  dropcap-colour: "accent",
  dropcap-style: "historic",
  // seed: 137,
  seed: 237,
  note-markers: "stamps",
  roles: (
    client: ("client", $n$, $p$, $P$),
    facility: ($k$, $F$),
    tolerance: ($ell$),
  ),
  // kicker: [Project proposal],
  // abstract: [],
  table-of-contents: auto,
  // margin-notes: false,
  // paragraph-style: "spaced",
)

= Introduction

#lede[Imagine we want to place $k$ EV chargers in a town, so each house is not far from one and more precisely the farthest house has a minimal distance to its closest charger. And when chargers are occupied or faulty, $ell$ backups are present to pick up the slack. This is essentially what the paper Fault-Tolerant Euclidean $k$-Centers by _S. Durocher, S. Lamey, and P. C. Li_ @durocher2025 tries to work on.
]
This is why I also picked this paper, since electric cars are being more prevalent in our societies more than ever.

My contribution to this subject is a game explaining the different results of the paper, and helping players build the required intuition to understand this subject.

= The Problem Definition
The paper builds on top of the ordinary $k$-center problem, where we only care to minimize the worst distance from a house to its nearest charger. This doesn't include issues of occupancy nor faultiness.

#definition[@durocher2025
  Let $P subset RR^d$ be a set of $n$ houses and $F$ a multiset of $k$ chargers
  in $RR^d$, with $1 <= ell <= k <= n$. Let $"dist"_ell (u, S)$ be the distance
  from $u$ to its $ell$th nearest neighbour in $S$. The cost of $F$ serving $P$
  with fault tolerance $ell$ is
  $ "cost"_ell (P, F) = max_(p in P) "dist"_ell (p, F). $
  An (optimal) $ell$-fault-tolerant Euclidean $k$-center of $P$ is a multiset
  $ F^* = op("arg min", limits: #true)_(|F| = k) "cost"_ell (P, F), $
  and $"OPT" = "cost"_ell (P, F^*)$. A multiset $F'$ is an
  $alpha$-approximate solution if $"cost"_ell (P, F') <= alpha dot "OPT"$.
]<def-ft>

#figure(
  grid(
    columns: (1fr, 1fr, 1fr),
    row-gutter: 0.5em,
    align: center,
    grid.cell(colspan: 3, image("figures/fig-crayon.png", width: 100%)),
    text(size: 0.85em)[(a) $k = 3$, $ell = 1$],
    text(size: 0.85em)[(b) one charger fails],
    text(size: 0.85em)[(c) $k = 6$, $ell = 2$, one fails],
  ),
  caption: [The houses (dots) served by chargers (squares) within radius $r$. In (b) one cluster is left uncovered due to a failure. In (c) each site holds two coincident chargers.],
) <fig-tolerance>

This is how the fault-tolerant version came to be, as solution to these two issues, where it is now important that each house has at least $ell$ chargers in its service radius $r$, so it stays served even if $ell - 1$ of them fail. And, that the distance to its $ell$-th nearest charger is also minimal.


= What the Paper Proves
== On a line: exact and fast
In 1D, we compute an optimal $k'$-center#sidenote[$k'= floor(k/ell)$] and put $ell$ chargers on each center. The result will be an optimal fault-tolerant solution.

This result is true because, if we take any optimal fault-tolerant solution $F$ and sort it left to right. And, keep every $ell$-th one, this will give us at most $k'$ points. Every house has thus $ell$ chargers within their service radius $r$.

On a line, those $ell$ chargers are consecutive in a sorted order, so at least one of them is a kept point. The kept points form a $k'$-center of radius $<= r$. Placing $ell$ copies on an optimal $k'$-center therefore costs $<= r^*$.

Looking at the running time, we have sort plus exact 1D $k'$-center algorithm, which gives us $O (n log n)$@chen2015. To play around with this concept, see @fig-line.

#figure(
  widget("one-d", n: 9),
  caption: [$ell$ copies of an optimal $floor(k/ell)$-center. Drag a house; the brackets show the radius around each center.],
) <fig-line>

This works well in one dimension because it depends on the line order. In a plane, there's no order, and the problem becomes NP-hard.

== In a plane: NP-Hard<3.2>
Deciding whether $k$ chargers can reach a radius $r$ is NP-hard; plain $k$-center with $ell=1$ was already NP-hard. What they showed was that the fault-tolerant variant stayed NP-hard too.

To prove this, they did two reductions. Firstly, from planar 3-SAT to disc 2-stabbing and then to $ell=2$ $k$-center. Where 2-stabbing is a problem where we want all discs to get stabbed#sidenote[Stabbed means is in the area of a disc] by two points. The only problem is that we have $k$ points to place, so we have to find a point placement, so that all discs are stabbed by at least 2 points.
=== Disc 2-stabbing to $ell=2$ $k$-center Reduction
Let's start by explaining the last reduction from 2-stabbing to $ell=2$ $k$-center. Here, the amount of discs corresponds to the number of houses, which are also the centers of the discs. And 2-stabbing corresponds to $ell=2$. Then, $k$ is the number of points we have available to place inside the discs. Finally, the disc's radius corresponds to $r$, and that radius is the target radius.

The discs can be 2-stabbed, holds exactly when $k$ chargers achieve $text("cost")_(ell) <= r$, with $ell=2$. Here, a point inside a house's disc is the same as a charger within a distance $r$ of a house. If 2-stabbing is NP-hard, then so is $ell=2$ $k$-center.

=== Planar 3-SAT to Disc 2-stabbing
To prove 2-stabbing is NP-hard, we reduce from the well-known NP-complete problem Planar 3-SAT @lichtenstein1982.

Why planar 3-SAT? Because its formulas have a special no-crossing property. Every 3-SAT formula has a graph whose nodes are the variables and clauses with an edge between a variable and a clause it appears in. Planar 3-SAT only allows formulas whose graph can be drawn without two edges crossing.

Planarity matters because, in the 2-stabbing instance, each variable becomes a ring of discs that reaches its clauses. If any edges cross, then two rings overlap and mix up their true and false values.

How can a ring store a variable state? Each ring has two families of minimal placements of points: one kind stands for true and the other for false, see @fig-ring.

#figure(
  widget("variable-ring", m: 2),
  caption: [Variable gadget: a ring of $3m$ discs needs at least $2m$ points to be 2-stabbed. Place the points and find the two kinds of minimal placements, one for _true_ and one for _false_.],
) <fig-ring>

Where the clause node sits in the graph, four discs are placed: a central one touching three others, and each of the three is linked to one variable's ring by a chain of discs. If the literal is negated, the chain is attached at a different place on the ring.

The four discs can be 2-stabbed iff at least one ring is in the pattern that makes its literal true. If all 3 are false, then an extra point is needed, which the budget does not allow, see @fig-clause.

Why two points per clause? Because the clause gadget, see @fig-clause, always needs at least two points. Its central disc alone must be stabbed twice. So this is true whatever the placement of the rings is. What the rings decide is whether two points are enough: they are only enough if at least one ring is in the pattern that makes its literal true. $k$ is built by adding every part's minimum: the rings, 2 per clause, and 2 per variable. This makes two points a hard limit for each clause.

#figure(
  widget("clause", literals: "u₁,¬u₂,u₃"),
  caption: [Clause gadget for $(u_1 or not u_2 or u_3)$: its four discs can be 2-stabbed with 2 points only if at least one literal is true. Set all three to false and see that a third point is needed.],
) <fig-clause>

Taken together, these show that 2-stabbing is proven NP-complete, which carries over to $ell=2$ $k$-center in any dimension of 2 or more

// #theorem(
// number: "2",
// )[On a line, an optimal $ell$-fault-tolerant Euclidean $k$-center can be computed in $O(n log n)$ time.] <thm-line>

== In a plane: 2-approximation

The exact version is NP-hard, see Section 3.2, so what they did in the paper is to look for a solution that is provably close to the optimal.

Why not reuse the 1D trick or an ordinary $k$-center?

#statement("Observation 1", numbered: false, accent: true)[@durocher2025
  There exist $P subset RR^2$, $k$ and $ell$ such that no Euclidean
  $floor(k/ell)$-center of $P$, with $ell$ chargers placed on each
  center, is an $ell$-fault-tolerant Euclidean $k$-center of $P$.
] <obs-replicate>



Copying the 1D trick, with $ell$ chargers on an optimal $floor(k/ell)$-center, isn't always optimal in 2D. In the paper's example it is only about 1.08 times worse than the optimal.

#statement("Observation 2", numbered: false, accent: true)[@durocher2025
  For every $alpha in RR$, there exists $P subset RR^2$ with $|P| = 4$
  such that $"cost"_2 (P, F) > alpha dot "OPT"$, where $F$ is a Euclidean
  $4$-center of $P$, $F^*$ is a $2$-fault-tolerant Euclidean $4$-center
  of $P$, and $"OPT" = "cost"_2 (P, F^*)$.
] <obs-plain>

This means that if we take an optimal plain $k$-center, which only cares about the nearest charger, and use it when $ell = 2$, the result can be as bad as we want compared to the optimal solution. With only 4 houses, the gap with OPT can already be made arbitrarily large, see Figure 4 of the paper @durocher2025.

Since an exact $floor(k/ell)$-center is not enough in 2D, and a plain $k$-center is far worse, the paper keeps the idea of putting $ell$ copies on each center, but picks the centers greedily instead of exactly. That leads into Algorithm 1.

#let ln(n) = [#n]
#figure(
  kind: "algorithm",
  supplement: [Algorithm],
  block(width: 100%, inset: 0.8em, stroke: (y: 0.6pt), align(left)[
    *Input:* a set $P subset RR^2$ of $n$ houses, integers $k, ell$ with $0 < ell <= k < n$. \
    *Output:* a multiset of (at most) $k$ chargers placed on houses of $P$.
    #grid(
      columns: (1.5em, 1fr),
      row-gutter: 0.2em,
      ln(1), [$k' <- floor(k \/ ell)$],
      ln(2), [select an arbitrary house $s_1 in P$],
      ln(3), [$S <- {s_1}$],
      ln(4), [*while* $|S| < k'$ *do*],
      ln(5), [~~~~~~~~~~~~~#h(1.2em)$s_(i+1) <- op("arg max")_(p in P without S) "dist"_1 (p, S)$],
      ln(6), [~~~~~~~~~~~~~#h(1.2em)$S <- S union {s_(i+1)}$],
      ln(7), [*return* $ell$ copies of $S$],
    )
  ]),
  caption: [Replicated farthest-first, a 2-approximation @durocher2025.],
) <alg-1>

Each new center is the house farthest from the centers already chosen. For $ell = 1$ this is exactly Gonzalez's greedy algorithm @gonzalez1985.

#statement("Theorem 8", numbered: false, accent: true)[@durocher2025
  Algorithm 1 is a 2-approximation for the $ell$-fault-tolerant Euclidean $k$-center problem, and it runs in $Theta(n k \/ ell)$ time.
] <thm-approx>

Why is it a 2-approximation? Because of the $k' + 1$ houses made of the $k'$ centers plus the farthest house left over. Those are all at least $r$ apart, where $r$ is the cost of the algorithm. If $r$ were more than twice OPT, then each of these $k' + 1$ houses would need $ell$ chargers of the optimal solution within OPT of it. By the triangle inequality, no charger can serve two of them. So the optimal solution would need $(k' + 1) dot ell > k$ chargers, which is not possible.

Is 2 the best possible? We only know that for this algorithm. Figure 9 of the paper shows an example where Algorithm 1 cannot do better than 2, so its analysis is tight. This does not prove that no algorithm can do better.

The paper also shows that copying an exact $floor(k/ell)$-center cannot guarantee better than about 1.0774 times the optimal in general. What can be achieved between 1.0774 and 2 is left open.

= What I Built
I have made a #link("https://kcentre.mc2.onl")[game], for people that aren't familiar with the subject and the mathematical notation to build the necessary intuition on the different topics the paper@durocher2025 introduces.


#wide[
  #widget("game-embed-widget", game-url: "https://kcentre.mc2.onl")
]

Each level in the game has one apparent goal, minimize the worst house distance to its $ell$-th charger, to do this the player has to place chargers. The actual goal of the level from a developer standpoint is to teach a concept in a fun way.

#figure(
  table(
    columns: (auto, 1fr, 1fr),
    align: (center, left, left),
    table.header[Level][What the player does][What it teaches],
    [1\. Cover the town],
    [Moves 3 chargers so the farthest house is as close as possible.],
    [The ordinary $k$-center: only the worst house counts.],

    [2\. Backups],
    [Each house needs $ell = 2$ chargers within $r$. Two chargers on the same spot count as two.],
    [$"cost"_ell$ from @def-ft, and why $F$ is a multiset.],

    [3\. When one fails],
    [Makes $r$ small, then breaks chargers or tests every failure.],
    [$"cost"_ell$ is the worst case after $ell - 1$ chargers fail.],

    [4\. Farthest-first],
    [Sends each new charger to the house farthest from all the others.],
    [Gonzalez's greedy algorithm @gonzalez1985.],

    [5\. Farthest-first with backups],
    [Does the same with $ell = 2$, placing chargers in pairs (the twin rule).],
    [Algorithm 1, a 2-approximation (Theorem 8).],

    [6\. Beat the twin rule],
    [Two rings of houses where the pairs work better in the empty middle than on houses.],
    [Algorithm 1 can be 2 times worse (Figure 9 of the paper).],

    [7\. Beat the bot],
    [Tries to beat the bot's farthest-first score on a random town.],
    [The bot is fast but not optimal, since the exact problem is NP-hard.],
  ),
  caption: [How each level of the game maps to a result of the paper.],
) <tab-levels>

The game doesn't cover the 1D algorithm nor the reductions, these have been left inside the web report accompanied by interactive examples.

= Conclusion
We started with a simple question: can we place $k$ EV chargers in such a way that every house stays served, even when $ell - 1$ of them are occupied of faulty?

The paper @durocher2025 gives three answers. On a line, the problem can be solved optimally and fast, in $O(n log n)$. In the plane, it becomes NP-hard, already with $ell = 2$, through reduction from Planar 3-SAT to disc 2-stabbing. So instead of looking for an exact answer, the paper gives @alg-1. Which is never more than 2 times worse than the optimal solution.

The game is made so that people who aren't familiar with the notation can build the intuition behind these results.

= AI Use

I used Claude Opus 5.5 (medium and high effort), through the T3 Code nightly harness.

- *Implementation of code.* The algorithms are developed by me in pseudocode on my e-reader, then I send a screenshot of my writing to the model, which implements it.
- *Understanding the concepts.* Claude was also used to help me better understand the concepts by creating interactive widgets.
- *Iterative process for the game.* I would give Claude annotated drawings and have it make prototypes. From the one I liked, I started playtesting by giving the game to family and friends, and from their feedback I had the changes implemented.
- *Incipit-web.* Incipit is my own custom-made template for Typst. Claude helped me create Incipit-web, a package that ports it to the web so I can write interactive documents.
- *Fact-checking.* I also used AI to fact-check what I write against my sources, and to help me find logical errors in my writing.
- *Interactive examples.* The interactive examples in this web report were made from schematics I drew.