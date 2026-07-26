---
layout: page
title: Installation
permalink: /tutorials/installation/
---

This page walks through setting up a minimal, dependency-light environment for
tracking quantum experiments. Nothing here is specific to one quantum SDK — the
same ideas apply whether you use Qiskit, Cirq, PennyLane, or your own code.

## 1. Create a project folder

```bash
mkdir quantum-experiments
cd quantum-experiments
git init
```

## 2. Set up a virtual environment

```bash
python -m venv .venv
source .venv/bin/activate   # on Windows: .venv\Scripts\activate
```

## 3. Install your quantum SDK of choice

```bash
pip install qiskit
```

## 4. Create a folder for experiment records

A simple convention that scales well:

```text
quantum-experiments/
├── experiments/
│   ├── 2026-07-01-bell-state/
│   │   ├── circuit.py
│   │   ├── params.yaml
│   │   └── results.json
│   └── ...
└── README.md
```

Each experiment gets its own dated folder containing the circuit definition,
the parameters used, and the results — enough to reproduce or compare the run
later without any additional tooling.

<div class="callout" markdown="1">
**Tip:** commit the `experiments/` folder to git as you go. Plain-text
parameter files and JSON results diff nicely and give you a free audit trail.
</div>

Next: [Running your first tracked experiment]({{ '/tutorials/first-experiment/' | relative_url }}).
