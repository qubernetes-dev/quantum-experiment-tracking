---
layout: default
title: Home
---

<div class="hero">
  <img src="{{ '/assets/images/hero.svg' | relative_url }}" alt="" class="hero-graphic" />
  <h1>From Circuits to Results</h1>
  <p class="hero-subtitle">Systematic Experiment Tracking in Quantum Workflows</p>
</div>

Welcome! This tutorial introduces a practical, low-overhead approach to tracking
quantum computing experiments — from circuit design to final results — so that
your work stays reproducible as it grows in scale and complexity.

## What you will learn

- Why systematic experiment tracking matters for quantum workflows
- How to set up a minimal, dependency-free tracking environment
- How to record circuits, parameters, backends, and results consistently
- How to compare runs across simulators and real quantum hardware

## Contents

- [Agenda]({{ '/agenda/' | relative_url }})
- Tutorials
  - [Installation]({{ '/tutorials/installation/' | relative_url }})
  - [Running Your First Tracked Experiment]({{ '/tutorials/first-experiment/' | relative_url }})

## Who this is for

Researchers and students running quantum circuits who want a lightweight way to
keep experiments organized, without adopting a heavyweight MLOps stack.

---

Found an issue or want to contribute a section? Open an issue or pull request on
the [GitHub repository]({{ site.github.repository_url | default: "https://github.com/" }}).
