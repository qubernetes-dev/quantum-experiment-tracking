/* tracking.js — an MLflow-shaped tracking client that runs in the browser.

   Same call surface as the Python used in the tutorial repos:
     tracking.setExperiment(name)
     const run = tracking.startRun({runName})
     run.logParam(k, v) / logMetric(k, v, step) / setTag(k, v)
     run.logArtifact(path, obj) / logDict(obj, path) / logText(txt, path)
     run.end(status)
     logQuantumProvenance(run, {...})     <- utils/provenance.py, key-for-key

   Two backends:
     'local' : in-page store, persisted to localStorage. Zero install.
     'server': the real MLflow REST API (/api/2.0/mlflow/...). Same-origin when
               the deck is served through serve.py, so no CORS setup is needed.
   Both are written to at once when the server is reachable, so the in-deck
   panel and the real MLflow UI always agree.
*/
(function (root) {
  'use strict';

  const LS_KEY = 'qrc_tutorial_runs_v1';
  const API = '/api/2.0/mlflow';

  function uid() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const state = {
    experiment: 'mackey_glass_dqrc',
    experimentId: null,
    runs: [],
    backend: 'local',
    serverBase: '',
    listeners: new Set()
  };
  let experimentPromise = null;

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) state.runs = JSON.parse(raw);
    } catch (e) { /* fresh start */ }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.runs.slice(-40))); } catch (e) {}
  }
  function emit() { state.listeners.forEach((fn) => { try { fn(state); } catch (e) {} }); }

  async function post(path, body) {
    if (state.backend !== 'server') return null;
    try {
      const res = await fetch(state.serverBase + API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch (e) {}
        console.warn('[tracking] ' + path + ' -> ' + res.status + ' ' + detail.slice(0, 300));
        return null;
      }
      return await res.json();
    } catch (e) {
      console.warn('[tracking] ' + path + ' failed: ' + e);
      return null;
    }
  }

  async function get(path, params) {
    if (state.backend !== 'server') return null;
    const query = new URLSearchParams(params || {}).toString();
    try {
      const res = await fetch(state.serverBase + API + path + (query ? '?' + query : ''));
      if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch (e) {}
        console.warn('[tracking] GET ' + path + ' -> ' + res.status + ' ' + detail.slice(0, 300));
        return null;
      }
      return await res.json();
    } catch (e) {
      console.warn('[tracking] GET ' + path + ' failed: ' + e);
      return null;
    }
  }

  /* Probe for a real MLflow server. Returns true if we switched to it. */
  async function connect(base) {
    const b = base === undefined ? '' : base;
    try {
      const res = await fetch(b + API + '/experiments/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_results: 1 })
      });
      if (!res.ok) throw new Error('bad status');
      state.backend = 'server';
      state.serverBase = b;
      const experimentId = await ensureExperiment();
      if (!experimentId) throw new Error('could not resolve MLflow experiment');
      emit();
      return true;
    } catch (e) {
      state.backend = 'local';
      state.experimentId = null;
      emit();
      return false;
    }
  }

  async function ensureExperiment() {
    if (state.backend !== 'server') return null;
    if (state.experimentId) return state.experimentId;
    if (experimentPromise) return experimentPromise;

    const experimentName = state.experiment;
    experimentPromise = (async () => {
      // MLflow exposes get-by-name as GET with a query parameter. Posting JSON
      // to this endpoint returns 405, which previously left experimentId null
      // whenever setExperiment() was called for an existing experiment.
      let r = await get('/experiments/get-by-name', { experiment_name: experimentName });
      let id = r && r.experiment && r.experiment.experiment_id;
      if (!id) {
        r = await post('/experiments/create', { name: experimentName });
        id = r && r.experiment_id;
      }
      if (id && state.experiment === experimentName) state.experimentId = id;
      return id || null;
    })();

    try {
      return await experimentPromise;
    } finally {
      experimentPromise = null;
    }
  }

  function setExperiment(name) {
    if (state.experiment === name && state.experimentId) return;
    state.experiment = name;
    state.experimentId = null;
    if (state.backend === 'server') ensureExperiment();
  }

  function startRun(opts) {
    const o = opts || {};
    const rec = {
      run_id: uid(),
      server_run_id: null,
      name: o.runName || 'run',
      experiment: state.experiment,
      status: 'RUNNING',
      start: Date.now(),
      end: null,
      params: {},
      metrics: {},
      tags: Object.assign({}, o.tags || {}),
      artifacts: [],
      notes: o.notes || ''
    };
    state.runs.push(rec);
    save();
    emit();

    /* The server run id only exists after /runs/create resolves, but the
       pipeline logs synchronously and finishes in about a second. Queue every
       server-bound call and flush in order once the id arrives, otherwise the
       whole run is dropped and MLflow shows an empty experiment. */
    const pending = [];
    function send(fn) {
      if (state.backend !== 'server') return;
      if (rec.server_run_id) fn();
      else pending.push(fn);
    }

    if (state.backend === 'server') {
      (async () => {
        if (!state.experimentId) await ensureExperiment();
        const r = await post('/runs/create', {
          experiment_id: state.experimentId,
          run_name: rec.name,
          start_time: rec.start,
          tags: Object.keys(rec.tags).map((k) => ({ key: k, value: String(rec.tags[k]) }))
        });
        if (r && r.run) {
          rec.server_run_id = r.run.info.run_id;
          rec.artifact_uri = r.run.info.artifact_uri || null;
          while (pending.length) pending.shift()();
        } else {
          console.warn('[tracking] runs/create failed; run "' + rec.name + '" stays local only');
          pending.length = 0;
        }
      })();
    }

    const api = {
      record: rec,
      get id() { return rec.run_id; },
      logParam(k, v) {
        rec.params[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
        save(); emit();
        send(() => post('/runs/log-parameter', { run_id: rec.server_run_id, key: k, value: rec.params[k] }));
        return api;
      },
      logParams(obj) { Object.keys(obj).forEach((k) => api.logParam(k, obj[k])); return api; },
      logMetric(k, v, step) {
        if (v === null || v === undefined || Number.isNaN(v)) return api;
        (rec.metrics[k] = rec.metrics[k] || []).push({ value: Number(v), step: step || 0, ts: Date.now() });
        save(); emit();
        send(() => post('/runs/log-metric', {
          run_id: rec.server_run_id, key: k, value: Number(v),
          timestamp: Date.now(), step: step || 0
        }));
        return api;
      },
      logMetrics(obj, step) { Object.keys(obj).forEach((k) => api.logMetric(k, obj[k], step)); return api; },
      setTag(k, v) {
        rec.tags[k] = typeof v === 'string' ? v : JSON.stringify(v);
        save(); emit();
        send(() => post('/runs/set-tag', { run_id: rec.server_run_id, key: k, value: rec.tags[k] }));
        return api;
      },
      logArtifact(path, payload, kind) {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
        rec.artifacts.push({
          path, kind: kind || (path.endsWith('.json') ? 'json' : 'text'),
          bytes: text.length,
          preview: text.length > 4000 ? text.slice(0, 4000) + '\n\u2026' : text
        });
        save(); emit();
        send(() => putArtifact(rec, path, text));
        return api;
      },
      logDict(obj, path) { return api.logArtifact(path, obj, 'json'); },
      logText(txt, path) { return api.logArtifact(path, txt, 'text'); },
      end(status) {
        rec.status = status || 'FINISHED';
        rec.end = Date.now();
        save(); emit();
        send(() => post('/runs/update', { run_id: rec.server_run_id, status: rec.status, end_time: rec.end }));
        return api;
      }
    };
    return api;
  }

  /* Write through MLflow's artifact proxy so the run's Artifacts tab shows the
     file. Requires `mlflow server --serve-artifacts` (the default since 2.x),
     which reports artifact_uri as mlflow-artifacts:/<exp>/<run>/artifacts. */
  async function putArtifact(rec, path, text) {
    const uri = rec.artifact_uri || '';
    const base = uri.startsWith('mlflow-artifacts:/')
      ? '/api/2.0/mlflow-artifacts/artifacts/' + uri.slice('mlflow-artifacts:/'.length).replace(/^\/+/, '')
      : '/api/2.0/mlflow-artifacts/artifacts/' + rec.server_run_id;
    try {
      await fetch(state.serverBase + base + '/' + path, { method: 'PUT', body: text });
    } catch (e) { /* artifact store not exposed; params/metrics/tags still land */ }
  }

  /* ── utils/provenance.py, verbatim key names ────────────────────────────
     log_param  : fixed configuration decided before/at circuit definition
     log_metric : numeric scalar produced during/after execution
     set_tag    : string metadata, identifiers, categorical labels
     log_artifact: structured / high-dimensional data                       */
  function logQuantumProvenance(run, p) {
    const tag = (k, v) => { if (v !== null && v !== undefined) run.setTag(k, v); };
    const par = (k, v) => { if (v !== null && v !== undefined) run.logParam(k, v); };
    const met = (k, v) => { if (v !== null && v !== undefined) run.logMetric(k, v); };
    const art = (k, v) => { if (v !== null && v !== undefined) run.logDict(v, k + '.json'); };

    tag('quantum_circuit/used_gates', p.used_gates);
    tag('quantum_circuit/used_measurements', p.used_measurements);
    tag('quantum_circuit/execution_order', p.execution_order);
    par('quantum_circuit/circuit_width', p.circuit_width);
    par('quantum_circuit/circuit_depth', p.circuit_depth);
    par('quantum_circuit/circuit_size', p.circuit_size);
    par('quantum_circuit/applied_encoding', p.applied_encoding);

    par('quantum_computer/num_qubits', p.num_qubits);
    art('quantum_computer/decoherence_times', p.decoherence_times);
    tag('quantum_computer/qubit_connectivity', p.qubit_connectivity);
    tag('quantum_computer/gate_set', p.gate_set);
    art('quantum_computer/gate_fidelities', p.gate_fidelities);
    art('quantum_computer/gate_times', p.gate_times);
    art('quantum_computer/readout_fidelities', p.readout_fidelities);

    par('compilation/qubit_assignments', p.qubit_assignments);
    art('compilation/gate_mappings', p.gate_mappings);
    par('compilation/optimization_goals', p.optimization_goals);
    par('compilation/random_seed', p.compilation_random_seed);
    met('compilation/compilation_time_s', p.compilation_time_s);
    par('compilation/optimization_level', p.optimization_level);

    art('execution/input_data', p.input_data);
    art('execution/output_data', p.output_data);
    par('execution/num_shots', p.num_shots);
    if (p.intermediate_results)
      p.intermediate_results.forEach((v, i) => run.logMetric('execution/intermediate_result', v, i));
    par('execution/num_iterations', p.num_iterations);
    met('execution/execution_time_s', p.execution_time_s);
    par('execution/applied_error_mitigation', p.applied_error_mitigation);
  }

  /* ── run comparison: what MLflow's compare view gives you ─────────────── */
  function lastMetric(rec, k) {
    const s = rec.metrics[k];
    return s && s.length ? s[s.length - 1].value : null;
  }
  function diff(a, b) {
    const rows = [];
    const keys = new Set([].concat(Object.keys(a.params), Object.keys(b.params)));
    keys.forEach((k) => {
      const va = a.params[k], vb = b.params[k];
      if (va !== vb) rows.push({ kind: 'param', key: k, a: va, b: vb });
    });
    const tkeys = new Set([].concat(Object.keys(a.tags), Object.keys(b.tags)));
    tkeys.forEach((k) => {
      const va = a.tags[k], vb = b.tags[k];
      if (va !== vb) rows.push({ kind: 'tag', key: k, a: va, b: vb });
    });
    const mkeys = new Set([].concat(Object.keys(a.metrics), Object.keys(b.metrics)));
    mkeys.forEach((k) => {
      const va = lastMetric(a, k), vb = lastMetric(b, k);
      if (va !== vb) rows.push({ kind: 'metric', key: k, a: va, b: vb, delta: (vb ?? 0) - (va ?? 0) });
    });
    return rows;
  }

  load();

  root.tracking = {
    state,
    setExperiment,
    startRun,
    logQuantumProvenance,
    connect,
    diff,
    lastMetric,
    onChange(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); },
    runs() { return state.runs; },
    byId(id) { return state.runs.find((r) => r.run_id === id); },
    reset() { state.runs = []; save(); emit(); },
    exportJSON() { return JSON.stringify(state.runs, null, 2); }
  };
})(window);
