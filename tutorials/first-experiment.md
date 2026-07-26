---
layout: page
title: Running Your First Tracked Experiment
permalink: /tutorials/first-experiment/
---

With the folder structure from [Installation]({{ '/tutorials/installation/' | relative_url }})
in place, let's track a simple experiment end to end: preparing a Bell state.

## 1. Write the circuit

`experiments/2026-07-01-bell-state/circuit.py`:

```python
from qiskit import QuantumCircuit

def build_circuit() -> QuantumCircuit:
    qc = QuantumCircuit(2, 2)
    qc.h(0)
    qc.cx(0, 1)
    qc.measure([0, 1], [0, 1])
    return qc
```

## 2. Record the parameters

`experiments/2026-07-01-bell-state/params.yaml`:

```yaml
backend: aer_simulator
shots: 1024
optimization_level: 1
seed: 42
```

Keeping parameters in a plain YAML file — rather than only in code — makes it
easy to see at a glance what changed between runs, and lets you diff two
experiments with an ordinary `git diff`.

## 3. Run and save the results

```python
import json
import yaml
from qiskit_aer import AerSimulator
from circuit import build_circuit

params = yaml.safe_load(open("params.yaml"))
backend = AerSimulator()
job = backend.run(build_circuit(), shots=params["shots"], seed_simulator=params["seed"])
counts = job.result().get_counts()

with open("results.json", "w") as f:
    json.dump({"counts": counts, "params": params}, f, indent=2)
```

## 4. Commit the experiment

```bash
git add experiments/2026-07-01-bell-state/
git commit -m "Track Bell state experiment on aer_simulator"
```

<div class="callout" markdown="1">
**Why this works:** the circuit, its parameters, and its results all live
together in version control. Six months from now — or when a co-author asks
"what backend did you use for Figure 3?" — the answer is one `git log` away.
</div>

## Next steps

- Repeat the same experiment on real hardware and compare `results.json` files
- Add a short `notes.md` to each experiment folder for observations
- Once you outgrow plain files, consider a dedicated experiment-tracking tool —
  but for most tutorials and small projects, this is enough.

Back to the [Agenda]({{ '/agenda/' | relative_url }}).
