# Editing the deck

Everything is in one file: **`Part 4 QRC Experiment Tracking.dc.html`**. Open it in any
text editor. There is no build step — save and reload the browser.

The file has three parts:

1. `<helmet>` — fonts, the page reset, and the five script tags. Rarely touched.
2. one `<section>` per slide, in order, inside `<x-import … deck-stage …>`.
3. a small `<script>` block at the end holding the three editable links.

## Anatomy of a slide

```html
<section data-label="The readout"
         data-screen-label="10"
         data-speaker-notes="What you say out loud. Plain text."
         style="background:#0e1014;color:#eae7e1;font-family:'IBM Plex Sans',system-ui,sans-serif;
                padding:56px 64px;display:flex;flex-direction:column;gap:24px;">

  <!-- header: eyebrow + title on the left, one-line summary on the right -->
  <div style="flex:none;display:flex;justify-content:space-between;align-items:baseline;
              border-bottom:1px solid #2b303a;padding-bottom:16px;">
    <div>
      <div style="font:600 17px/1 'JetBrains Mono',monospace;letter-spacing:.16em;
                  text-transform:uppercase;color:#5cc8d8;">Part 4 · 10 · the pipeline</div>
      <h2 style="margin:12px 0 0;font:600 48px/1.08 'IBM Plex Sans',system-ui,sans-serif;
                 letter-spacing:-0.02em;">Your title here</h2>
    </div>
    <div style="font:400 20px/1.5 'IBM Plex Sans',system-ui,sans-serif;color:#9aa0ab;
                max-width:520px;text-align:right;">One sentence of framing.</div>
  </div>

  <!-- body: always flex:1 and min-height:0 so it fills the slide -->
  <div style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
    …
  </div>
</section>
```

- `data-label` is the thumbnail-rail caption.
- `data-speaker-notes` is plain text; it travels with the slide if you reorder.
- **To add a slide**, copy an existing `<section>` and paste it where you want it.
- **To reorder or delete slides**, drag or right-click in the thumbnail rail — or just
  move the `<section>` blocks in the file. Either works.
- Renumber the `Part 4 · NN` eyebrow by hand; nothing depends on it.

## Real LaTeX

`<tex-math>` renders KaTeX. The LaTeX source stays as plain text in the file, so it is
editable in place.

```html
<!-- inline, in a sentence -->
the damping rate <tex-math>\gamma</tex-math> controls fading memory

<!-- display, its own centred line -->
<tex-math display size="27px" color="#5cc8d8">
  \rho \leftarrow (1-\gamma)\,\rho + \gamma\,|0\ldots 0\rangle\langle 0\ldots 0|
</tex-math>
```

Attributes: `display` (block mode), `size`, `color`, `align`. Everything KaTeX supports
works — `\sum`, `\frac`, `\langle`, `\dagger`, matrices, aligned environments.

KaTeX loads from a CDN. **Offline the LaTeX source shows as monospace text instead** —
still readable, but if you need offline math, download
`katex.min.js` + `katex.min.css` + the `fonts/` folder next to the deck and change the
two URLs at the top of `tex.js`.

## Python code panels

```html
<py-code file="redset_experiment.py — evaluation machinery"
         note="protocol fixes 3, 4, 5"
         hl="2,3,4"
         size="18">
  def fit_predict_window(F, h, fit_lo, fit_hi, pred_lo, pred_hi, alpha):
      model = make_pipeline(StandardScaler(), Ridge(alpha=alpha))
      …
</py-code>
```

Paste real code straight in. Leading indentation common to all lines is stripped, so you
can keep it aligned with the surrounding HTML. `hl` takes 1-based line numbers to
highlight (they get a teal left bar). `file` and `note` render the caption bar. Keep
`size="18"` unless lines are long — check for a horizontal scrollbar after editing.

## Interactive panels

Drop the tag anywhere inside a `flex:1;min-height:0` box; each one fills its container.

| Tag | What it does |
| --- | --- |
| `<mg-lab>` | Mackey-Glass generator with τ / T / seed / horizon sliders |
| `<dqrc-lab>` | live reservoir: γ / τ / qubits, observable heatmap, echo-state test |
| `<esn-vs-qrc>` | the two state spaces side by side |
| `<pipeline-run>` | run the full experiment, with the tracking panel |
| `<debug-lab>` | the three-act cache-bug story |
| `<sweep-lab>` | the τ × γ sweep |
| `<mlflow-panel>` | the tracking panel on its own; add `compact` for the short version |

Clicks inside any of these are swallowed, so they never advance the slide.

To change what the pipeline does, edit `pipeline.js` — `DEFAULTS` at the top holds every
parameter (horizon, qubits, γ candidates, α grid, washout, split fractions, ESN size).

## Colours and type

| Token | Value | Use |
| --- | --- | --- |
| background | `#f6f2ec` | slide (warm off-white) |
| card | `#ffffff` | panels |
| card (inset) | `#f0eae0` | code, math wells |
| border | `#e2dad0` | hairlines, ghost numerals |
| text | `#2f2b27` | body |
| text (secondary) | `#55504a` | paragraphs inside cards |
| muted | `#6f675e` / `#6b6359` / `#6f675e` | captions, comments, axis labels |
| slate-teal | `#28697a` | the quantum path, good outcomes |
| terracotta | `#8c5731` | warnings, the bug, the failing run |
| plum | `#71578b` | the classical baseline, tags |
| rose | `#8e5460` | metrics |

The four accents share the same lightness and chroma in oklch (L≈0.55, C≈0.09) and differ
only in hue, so none of them shouts over the others.

Three fonts: **Source Serif 4** for headings, **IBM Plex Sans** for prose, **JetBrains
Mono** for code, keys and numbers. Nothing on a 1920×1080 slide should be below 18px.

## Exporting

- **PDF** — print the deck; one page per slide, already set up.
- **PowerPoint** — ask for a PPTX export; interactive panels come across as images.
- **Web** — see `README.md`. All files must sit in one folder.
