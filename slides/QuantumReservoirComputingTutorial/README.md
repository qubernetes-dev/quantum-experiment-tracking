# Part 4 — Quantum reservoir computing, tracked end to end

An interactive, code-based presentation for the QCE tutorial *From Circuits to Results:
Systematic Experiment Tracking in Quantum Workflows*. Everything runs in the browser:
the dissipative quantum reservoir really evolves a 4-qubit density matrix, the ridge
readout really fits, and every stage writes to a tracking client with the same call
surface as MLflow.

## Two ways to run it

**Tier 0 — nothing to install.** Open `Part 4 QRC Experiment Tracking.dc.html`
(or the GitHub Pages URL). Runs are kept in the browser's local store and the in-deck
panel renders them exactly as the server view would. This is what attendees use.

**Tier 1 — real MLflow, one `pip install`.**

```bash
pip install mlflow
mlflow server --host 127.0.0.1 --port 5000 \
  --backend-store-uri sqlite:///mlflow.db \
  --artifacts-destination ./mlartifacts --serve-artifacts   # terminal 1
python serve.py                                              # terminal 2
open http://127.0.0.1:8000/
```

Then press **connect MLflow** in any tracking panel. Full walkthrough, including
verification and troubleshooting, in [MLFLOW_SETUP.md](MLFLOW_SETUP.md). `serve.py` serves the deck and
reverse-proxies `/api/*` to MLflow, so the deck and the REST API share one origin and
no CORS configuration is needed. Runs created in the deck appear in the real MLflow UI
at <http://127.0.0.1:5000> — project that window beside the deck.

If MLflow is not running, the client silently stays on the local store. Nothing breaks.

## Presenting from the zip

### Fastest — no server at all

Unzip, then double-click **`Part 4 QRC Experiment Tracking (standalone).html`**. Every
asset is inlined, so it works offline from `file://` with no Python and no network.
Runs go to the browser's local store. This is the safest option for a conference room.

### From a local server

Needed only if you want the real MLflow GUI, or if you prefer to present the
multi-file `.dc.html` deck. Unzip and serve the folder:

```bash
unzip "Quantum Reservoir Computing Tutorial.zip"
cd "Quantum Reservoir Computing Tutorial"
python3 -m http.server 8000
```

Then open <http://127.0.0.1:8000/Part%204%20QRC%20Experiment%20Tracking.dc.html> —
or just <http://127.0.0.1:8000/> and click the deck in the directory listing. The
`%20` are the spaces in the filename; the browser fills them in if you click rather
than type.

Use `python serve.py` instead of `http.server` if you want MLflow connected — it serves
the same files, redirects `/` to the deck, and proxies the API. See
[MLFLOW_SETUP.md](MLFLOW_SETUP.md).

Whichever you use, keep the unzipped files together in one folder: the deck loads
`support.js`, `deck-stage.js`, `qrc-engine.js`, `tracking.js`, `pipeline.js`,
`widgets.js` and `tex.js` as siblings.

One-time check before you present: press a button on slide 11 and confirm a run
appears. If the widgets are blank, you are almost certainly opening the `.dc.html`
from `file://` — browsers block sibling script loads there. Use the standalone file or
a server.

## Rebuilding the standalone file

`Part 4 QRC Experiment Tracking (standalone).html` is a **build artifact**, not a live
file. Editing the deck or any `.js` file does not update it — it keeps whatever the
sources contained when it was last built. Rebuild it yourself:

```bash
python3 build_standalone.py
```

Standard library only, so the `.venv` from the MLflow guide is not needed. It inlines
`support.js`, `deck-stage.js` and the five widget scripts, hides the thumbnail rail and
control bar, and base64-inlines the three Google font families so the result works
offline. Expect about 1.2 MB.

The font step is the only part that touches the network. Offline, or in a hurry:

```bash
python3 build_standalone.py --no-fonts
```

which falls back to system fonts — fine for a check, not for presenting.

Rebuild immediately before you present, not after: the standalone is the file people
grab from the zip, and a stale one shows yesterday's slides with no warning.

## GitHub Pages

Push the repository and enable Pages on the branch root. All files are static; the only
requirement is that the five files sit next to each other:

```
Part 4 QRC Experiment Tracking.dc.html
deck-stage.js  qrc-engine.js  tracking.js  pipeline.js  widgets.js
```

Add an `index.html` that redirects to the deck, or rename the deck to `index.html`.

## Presenting

Arrow keys or click to navigate. The thumbnail rail on the left can be hidden. Speaker
notes are attached to every slide.

Three slides are meant to be driven live:

- **Slide 08** — drag γ to 0 with the amber button and watch the echo state property
  fail in the lower plot. Push τ to 2.6 and watch the observables saturate.
- **Slide 11** — press *Run experiment*. Six stages, ~1 s, one logged run.
- **Slide 14** — the three buttons **in order**. Step 1 runs the pipeline and the
  quantum model loses to the classical ESN (R² ≈ 0.70 against 0.97). Invite the room to
  find the cause from the plot and the code; they cannot. Step 2 opens the log: the run's
  params claim 4 qubits, τ = 0.3 and XYZ readouts — 18 observables — while the embedding
  artifact it consumed was generated with 3 qubits, τ = 2.6 and no XYZ. Step 3 hashes
  every generating parameter into the cache key and reruns: R² ≈ 0.98, beating the ESN.

The failure is not staged. It is protocol fix 2 from `redset_experiment.py`
(*"original cache was keyed by dataset name + split only → stale caches"*), reproduced
faithfully: `EmbeddingCache.buggyKey` really does key on dataset + split, and the run
really does consume the wrong array.

## The model

Same dynamics as `qrc_fast.py`, restricted to 4 qubits so it runs in a tab:

```
H(u_t) = Σ h_i X_i + Σ J_i Z_i Z_{i+1} + u_t Σ w_i Z_i
ρ ← U ρ U†,                U = exp(−i H(u_t) τ)
ρ ← (1−γ) ρ + γ |0…0⟩⟨0…0|
readouts: ⟨Z_i⟩, ⟨X_i⟩, ⟨Y_i⟩, ⟨Z_i Z_j⟩       →  4 + 4 + 4 + 6 = 18 features
```

Exact density-matrix evolution — no shot sampling, no approximation. Unitaries are
eigendecomposed once per quantised input level and cached, so 600 steps take
milliseconds. Protocol follows `redset_experiment.py`: pre-validation input scaling,
parameter-hashed embedding cache, γ and α selected on a validation slice, rolling-origin
test with periodic readout refits, skill reported against persistence and seasonal-naive.

## Files

| File | Role |
| --- | --- |
| `qrc-engine.js` | Mackey-Glass RK4, dissipative QRC, leaky ESN, ridge, metrics, embedding cache |
| `tracking.js` | MLflow-shaped client: local + REST backends, `logQuantumProvenance` (mirrors `utils/provenance.py`) |
| `pipeline.js` | the instrumented experiment; `poisonCache()` seeds the live failure |
| `widgets.js` | interactive panels as custom elements (shadow DOM, canvas rendering) |
| `serve.py` | static server + `/api` proxy to MLflow. Standard library only |
| `build_standalone.py` | rebuilds the single-file `(standalone).html` from the sources |
| `MLFLOW_SETUP.md` | step-by-step MLflow install, connection and troubleshooting guide |

## Sources

- <https://github.com/valterUo/quantum_reservoir_for_index_errors> — dissipative QRC, protocol
- <https://github.com/valterUo/mackey-glass-quantum-reservoir> — task, MLflow logging, `provenance.py`
- Weder et al., *QProv* (2021) — the four provenance categories
