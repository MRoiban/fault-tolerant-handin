# Report

`report.html` is the written report: one self-contained page (fonts, figures and the
interactive widgets inlined). Open it in a browser; it sits next to the game's `index.html`
in the hand-in ZIP and on the website.

`source/` is its source, a Typst document written with the Incipit template and built into
a web page with Incipit Web (the author's own tool, not needed to read the report):
`document.typ` (the text), `config.yaml` (settings), `refs.bib`, `figures/`, and
`widgets/` (the interactive figures, plain HTML and JavaScript). The maths in three widgets
is checked by `src/one-d-widget.test.ts` and `src/gadgets.test.ts`.
