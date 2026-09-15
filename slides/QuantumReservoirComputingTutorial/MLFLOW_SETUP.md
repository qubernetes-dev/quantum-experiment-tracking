# Connecting the deck to a real MLflow server

The deck works with nothing installed — runs are kept in the browser and the in-deck
panel renders them identically. This guide is for the other mode: a **real MLflow
server with its GUI open beside the deck**, so the room sees runs appear in MLflow as
you press buttons on stage.

Total time: about five minutes. Two terminals, one `pip install`.

---

## Why a proxy is needed

The deck logs with `fetch()` to MLflow's REST API. MLflow sends no CORS headers, so a
browser call from `file://` or from a different port is refused before it leaves the
page. `serve.py` solves this by serving the deck **and** forwarding `/api/*` to MLflow
from a single port — the deck and the API then share one origin and no MLflow
configuration or browser flag is needed.

```
   browser ──► 127.0.0.1:8000  (serve.py)
                    ├── /                → the deck (static files)
                    └── /api/*           → 127.0.0.1:5000  (MLflow)

   you    ──► 127.0.0.1:5000  (MLflow GUI, opened directly)
```

---

## Step 1 — Python and a virtual environment

Python 3.9 or newer. Check:

```bash
python3 --version
```

Create an isolated environment inside the project folder so MLflow's dependencies do
not touch your system Python:

```bash
cd "/path/to/Quantum Reservoir Computing Tutorial"
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
```

Your prompt should now be prefixed with `(.venv)`. Keep this environment activated in
both terminals below.

## Step 2 — Install MLflow

```bash
pip install --upgrade pip
pip install "mlflow<3"
```

The `<3` pin is deliberate. MLflow 3.x serves its API through FastAPI/starlette, which
has a hard incompatibility with some `anyio` versions — every request returns HTTP 500
with `AttributeError: module 'anyio' has no attribute 'from_thread'`. MLflow 2.x serves
Flask directly and has no such dependency. If you are already on 3.x and it works,
there is no reason to downgrade; the REST endpoints the deck uses are identical.

Verify:

```bash
mlflow --version        # expect 2.9 or newer
```

MLflow 2.x is assumed throughout.

### Windows

Use PowerShell, and note that the multi-line commands below use `\` for line
continuation — in PowerShell that is a backtick `` ` ``, or just put everything on one
line. The `open` command is `start`.

If the project sits in a **OneDrive-synced folder** (`OneDrive - Delft University of
Technology\...`), keep MLflow's SQLite database out of it — OneDrive's file locking
corrupts or locks SQLite mid-write. Point the store at a local path instead:

```powershell
mlflow server --host 127.0.0.1 --port 5000 --backend-store-uri sqlite:///C:/mlflow/mlflow.db --artifacts-destination C:/mlflow/artifacts --serve-artifacts
```

Create `C:\mlflow` first. The deck itself is happy inside OneDrive; only the database
is a problem.

## Step 3 — Start the MLflow server

Terminal 1:

```bash
mlflow server \
  --host 127.0.0.1 --port 5000 \
  --backend-store-uri sqlite:///mlflow.db \
  --artifacts-destination ./mlartifacts \
  --serve-artifacts
```

Each flag earns its place:

| Flag | Why |
| --- | --- |
| `--backend-store-uri sqlite:///mlflow.db` | A real database instead of flat files. **Required** for the GUI's run-comparison and metric-history views — slide 15's sweep is unreadable without it. |
| `--artifacts-destination ./mlartifacts` | Where `cache_meta.json`, the noise model and the provenance dicts land on disk. |
| `--serve-artifacts` | Exposes `/api/2.0/mlflow-artifacts/*`, which is how the deck uploads artifacts. Without it, params, metrics and tags still arrive but the **Artifacts** tab of every run stays empty. |

Leave this running. It prints `Listening at: http://127.0.0.1:5000`.

## Step 4 — Start the deck server

Terminal 2, same folder, same activated environment (`serve.py` is standard library
only, so any Python works):

```bash
python serve.py
```

It prints:

```
deck    http://127.0.0.1:8000/
proxy   /api/*  ->  http://127.0.0.1:5000
mlflow  http://127.0.0.1:5000   (start it separately: mlflow server --port 5000)
```

## Step 5 — Open both windows

```bash
open http://127.0.0.1:8000/          # the deck
open http://127.0.0.1:5000/          # the MLflow GUI
```

On Linux use `xdg-open`; on Windows `start`.

`http://127.0.0.1:8000/` redirects to the deck automatically. **Do not open the
`.dc.html` file directly from Finder or Explorer** — a `file://` page cannot reach the
proxy, and the deck will silently fall back to the local store.

## Step 6 — Connect

In the deck, go to any slide with a tracking panel (slide 11 is the easiest) and press
**connect MLflow** in the panel header.

- **`connected`** — the deck probed the REST API, found MLflow, created the
  `mackey_glass_dqrc` experiment, and will now write every run to both the in-page
  store and the server.
- **`no server — local store`** — the probe failed. See troubleshooting below.

The button re-labels itself back to `connect MLflow` after a couple of seconds; the
badge beside it is the authoritative connection state.

## Step 7 — Verify end to end

1. On slide 11, press **Run experiment**. It takes about a second.
2. Switch to the MLflow window and reload.
3. You should see experiment **mackey_glass_dqrc** with one run in it.
4. Open the run. Check all four tabs:
   - **Parameters** — `reservoir/n_qubits`, `reservoir/tau`, `readout/alpha`, and the
     `quantum_circuit/*` and `compilation/*` families from `logQuantumProvenance`.
   - **Metrics** — `validation/r2`, `test/r2`, `execution/execution_time_s`.
   - **Tags** — `quantum_computer/gate_set`, `quantum_circuit/execution_order`.
   - **Artifacts** — `cache_meta.json` and the provenance dicts. If this tab is empty
     but the other three are populated, you omitted `--serve-artifacts` in step 3.

If all four are populated, the setup is complete.

---

## Presenting with the GUI

The failure demo on slide 14 is much stronger with the real UI:

1. Press **step 1** and let the quantum model lose to the classical ESN.
2. Switch to MLflow, select the two runs with the checkboxes, press **Compare**.
3. MLflow's compare table highlights exactly the rows the deck highlights in amber —
   the run claiming `n_qubits = 4, tau = 0.3` against the embedding artifact generated
   at `n_qubits = 3, tau = 2.6`.
4. Press **step 3** in the deck, reload the compare view, and the third run's
   `test/r2` jumps to ≈ 0.98.

Two practical notes for the stage: MLflow does not live-refresh, so reload the browser
after each step; and put MLflow on the second display rather than alt-tabbing — the
comparison is the point, and it only lands if both are visible at once.

---

## Troubleshooting

**HTTP 500 on every request, `AttributeError: module 'anyio' has no attribute
'from_thread'`.** A dependency conflict inside MLflow 3.x, not a problem with the deck.
The GUI and the REST API both fail, so `connect MLflow` cannot succeed either. Fix:

```bash
pip install "mlflow<3"
```

or, to stay on 3.x, `pip install -U anyio starlette`.

**`sqlite3.OperationalError: database is locked` on Windows.** The database is in a
OneDrive- or Dropbox-synced folder. Move it to a local path — see the Windows note in
step 2.

**The experiment `mackey_glass_dqrc` appears but contains no runs, or runs with no
params and metrics.** Two causes, in order of likelihood:

1. The run was created *before* you pressed **connect MLflow**. Runs are never
   back-filled — press connect first, then run the pipeline.
2. `/runs/create` was rejected. Open the browser console (F12): the tracking client
   logs every failed REST call with its status and MLflow's error message.

**`connect MLflow` says "no server — local store".**
Check each link in the chain, in order:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://127.0.0.1:5000/api/2.0/mlflow/experiments/search \
  -H 'Content-Type: application/json' -d '{"max_results":1}'      # expect 200

curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://127.0.0.1:8000/api/2.0/mlflow/experiments/search \
  -H 'Content-Type: application/json' -d '{"max_results":1}'      # expect 200
```

A 200 on 5000 but 502 on 8000 means `serve.py` cannot reach MLflow — usually MLflow
bound to a different port. A 200 on both means the servers are fine and the deck was
opened from `file://` rather than through `http://127.0.0.1:8000/`.

**Port 5000 is already in use.** On macOS this is normally AirPlay Receiver
(System Settings → General → AirDrop & Handoff). Either disable it, or move MLflow:

```bash
mlflow server --host 127.0.0.1 --port 5050 ...
```

and change one line in `serve.py`:

```python
MLFLOW = "http://127.0.0.1:5050"
```

**Port 8000 is already in use.** Change `PORT = 8000` in `serve.py`.

**Runs appear in the deck panel but not in MLflow.** The panel always writes to the
local store first, so it populates whether or not the server is reachable. The badge in
the panel header tells you which backend is live. Runs created *before* you pressed
connect are not back-filled — they stay local only.

**The Artifacts tab is empty.** `--serve-artifacts` was missing, or MLflow was started
without `--artifacts-destination`. Restart with both; earlier runs will not be repaired.

**Old runs clutter the experiment.** Delete the store and restart:

```bash
rm -rf mlflow.db mlartifacts
```

To clear the deck's own local store, use the panel's reset control rather than clearing
browser storage by hand.

**Nothing works and the talk is in ten minutes.** Skip all of it. Close the MLflow
window and present from the deck alone — the local store is a complete substitute for
every slide, and no attendee can tell the difference.

---

## Optional — presenting from another machine

To let attendees follow along on their own laptops, bind both servers to your LAN
address instead of localhost:

```bash
mlflow server --host 0.0.0.0 --port 5000 ...
```

and in `serve.py`, change the bind address in the last block:

```python
with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as httpd:
```

Attendees then open `http://<your-ip>:8000/`. Conference networks frequently block
peer-to-peer traffic, so test this in the room before relying on it — and note that
every attendee's clicks write into the same MLflow experiment.
