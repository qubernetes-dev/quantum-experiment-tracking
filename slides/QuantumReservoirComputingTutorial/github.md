repo: valterUo/quantum_reservoir_for_index_errors
branch: main

## Last sync
date: 2026-07-30T11:00:48Z

### Updated in this project
- Built the Part 4 tutorial deck from the Python pipeline: Mackey-Glass task, dissipative QRC, ridge readout, ESN control.
- Ported `qrc_fast.py` dynamics to `qrc-engine.js` (exact 4-qubit density-matrix evolution, Jacobi eigh, cached unitaries).
- Ported `utils/provenance.py` key-for-key into `tracking.js`, an MLflow-shaped client with a real REST backend.
- Reproduced protocol fix 2 (embedding cache keyed on dataset+split only) as the deck's live debugging demo.

## Secondary source
repo: valterUo/mackey-glass-quantum-reservoir
branch: main
role: the Mackey-Glass task, MLflow logging shape, and `utils/provenance.py`

## Screen map
| Project screen | Built from |
| --- | --- |
| Slide 03–04 · reservoir computing, echo state property | classical_reservoir.py, QRC_dynamic.py (docstrings) |
| Slide 05 · ESN vs QRC | classical_reservoir.py, qrc_fast.py |
| Slide 06 · the task and the split | mackey-glass-quantum-reservoir/classical_baseline.py, redset_experiment.py |
| Slide 07–08 · the dissipative reservoir | qrc_fast.py (`dissipative_qrc_fast`, `build_reservoir`), QRC_dynamic.py (`dissipative_qrc`) |
| Slide 09 · circuit and compilation | mackey-glass-quantum-reservoir/classical_baseline.py (`simulate_evolution`) |
| Slide 10 · the readout | redset_experiment.py (`fit_predict_window`, `rolling_test`, `report`), evaluate.py |
| Slide 11 · end-to-end run | pipeline.js — combines both repos' pipelines |
| Slide 12–13 · quantum provenance | mackey-glass-quantum-reservoir/utils/provenance.py |
| Slide 14 · the live failure | redset_experiment.py docstring, protocol fix 2 (cache key) |
| Slide 15–16 · failure modes, sweep | redset_experiment.py protocol fixes 1–7 |

## Project files
| File | Role |
| --- | --- |
| `Part 4 QRC Experiment Tracking.dc.html` | the deck |
| `qrc-engine.js` | Mackey-Glass, dissipative QRC, leaky ESN, ridge, metrics, embedding cache |
| `tracking.js` | MLflow-shaped client: local store + real REST backend, `logQuantumProvenance` |
| `pipeline.js` | the instrumented experiment, plus `poisonCache()` for the live failure |
| `widgets.js` | interactive panels (custom elements, shadow DOM) |
| `serve.py` | static server + `/api` reverse proxy to MLflow, so no CORS setup is needed |
