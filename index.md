---
layout: default
---

## Presenters

<div class="presenters" markdown="1">

<div class="presenter" markdown="1">
**Vlad Stirbu** (Lead Presenter)<br>
*University of Jyväskylä*<br>
Jyväskylä, Finland<br>
vlad.a.stirbu@jyu.fi
</div>

<div class="presenter" markdown="1">
**Otso Kinanen**<br>
*University of Jyväskylä*<br>
Jyväskylä, Finland<br>
otso.j.r.kinanen@jyu.fi
</div>

<div class="presenter" markdown="1">
**Valter Uotila**<br>
*University of Helsinki*<br>
Helsinki, Finland<br>
valter.uotila@helsinki.fi
</div>

<div class="presenter" markdown="1">
**Oskari Kerppo**<br>
*Quanscient Oy*<br>
Tampere, Finland<br>
oskari.kerppo@quanscient.com
</div>

</div>

## Abstract

The increased availability of quantum computing hardware and the improvements in quantum workloads execution quality leads more researchers and developers to start their journey in quantum software and algorithm development.

Since quantum computing is a new and rapidly evolving paradigm, quantum workflows generate critical data across multiple stages of development and execution, including circuit design, compilation, and hardware execution. Without structured experiment tracking processes and tools, managing this data becomes nearly impossible, limiting the ability of developers to reason about their work, support reproducibility, and make informed design decisions.

In contrast, classical software engineering, and machine learning in particular, has developed mature practices and tooling for data provenance, logging, and experiment tracking. These approaches enable efficient development and systematic use of recorded data for analysis and decision-making. Transferring such practices into quantum computing offers a clear path toward improving development processes, enhancing reproducibility, and enabling more rigorous and scalable experimentation.

This tutorial introduces experiment tracking for quantum software developers. The sessions will start by explaining the crucial data points to log, how to use that data to improve the development process and software quality, and then move into a demonstration of selected use cases using MLflow to support the process. By the end of the tutorial, attendees will have a clear understanding of data provenance in quantum computing, an understanding of how that experiment-tracking data can be leveraged in the development process, and a basic level of knowledge of the use of the MLflow experiment-tracking tool.

## Agenda

### Session 1 — Foundations (90 minutes)

**Part 1: Introduction to Experiment Tracking in Quantum (~30 min)**

- Introducing experiment tracking, theory and purpose
- Quantum software provenance and special characteristics considering experiment tracking
- Core concepts of experiment tracking: runs, parameters, metrics, artifacts

**Part 2: Setting up MLflow for Quantum Software Development (~30 min)**

- Setting up MLflow server, introducing the user interface
- Introductory code for the tracking process, reflected to concepts introduced in Part 1 of the session
- Reading and analysing the tracked data

**Part 3: Experiment Tracking Concepts for Quantum (~30 min)**

- Detailed data to track in quantum: circuit, compilation and transpilation, target quantum hardware, classical simulation details, inputs and output
- Designing a quantum experiment tracking schema

<div class="callout" markdown="1">
Session 1 presented by Vlad Stirbu and Otso Kinanen.
</div>

### Session 2 — Applied Practice (90 minutes)

**Part 4: QML Case: Quantum Reservoir Computing (~35 min)**

- Introduction and motivation on quantum reservoir computing, the selected QML paradigm
- Selecting the learning task and constructing data
- Presenting experiment tracking at different stages: preprocessing, execution on noisy hardware, error mitigation, and classical postprocessing
- Discussing how experiment tracking supports quantum machine learning pipelines and the particular challenges and opportunities the quantum domain offers

**Part 5: Quantum-Powered CFD Simulations (~35 min)**

- Quantum algorithms for CFD problems
- Practical considerations with quantum algorithms: runtime, data initialization, data collection and post-processing
- Experiment tracking as a tool for multi-stage algorithms: validating algorithm initialization, verifying data readouts

**Part 6: Discussion & Outlook (~20 min)**

- Questions and discussion

<div class="callout" markdown="1">
Session 2 presented by Valter Uotila and Oskari Kerppo, respectively. Discussion will be attended by all presenters.
</div>
