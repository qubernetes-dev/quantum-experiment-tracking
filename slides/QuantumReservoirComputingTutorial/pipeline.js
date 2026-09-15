/* pipeline.js — the Mackey-Glass / dissipative-QRC experiment, instrumented.

   Combines:
     mackey-glass-quantum-reservoir/classical_baseline.py  (task, MLflow logging shape)
     quantum_reservoir_for_index_errors/qrc_fast.py        (dissipative QRC dynamics)
     quantum_reservoir_for_index_errors/redset_experiment.py (protocol: strict
        pre-validation scaling, parameter-hashed embedding cache, validation-
        selected gamma/alpha, rolling-origin refits, skill vs naive baselines)

   Every stage writes to the tracking client the same way the Python writes to
   MLflow. The three CONFIG.fixes flags reproduce, and repair, three real bugs
   named in redset_experiment.py's own protocol-fix list.
*/
(function (root) {
  'use strict';
  const Q = root.QRC;

  const DEFAULTS = {
    // ── data ──
    dataset: 'mackey_glass',
    T: 600,
    mgTau: 17,
    seed: 42,
    horizon: 12,         // predict y[t+h] — far enough out that chaos matters
    cycle: 50,           // quasi-period of Mackey-Glass tau=17, for seasonal-naive
    // ── reservoir ──
    nQubits: 4,
    gammas: [0.10, 0.25, 0.40],
    tau: 0.3,
    includeXYZ: true,
    includeZZ: true,
    nULevels: 64,
    resSeed: 42,
    // ── readout / protocol ──
    washout: 100,
    trainFrac: 0.6,
    valFrac: 0.8,
    retrainEvery: 100,
    alphas: [1e-3, 1e-2, 1e-1, 1.0, 10.0, 100.0],
    rawLags: 8,
    // ── classical baseline ──
    esnUnits: 17,        // 17 units + skip = 18 features: matched to the 4-qubit readout
    esnLeak: 0.3,
    esnSR: 0.9,
    // ── the three protocol fixes ──
    fixes: {
      cacheKeyIncludesParams: true,   // redset fix 2
      scalerFitRange: 'pre_validation', // redset fix 1 ('full_stream' = leakage)
      applyWashout: true              // discard reservoir transient
    }
  };

  function cfg(over) {
    const c = JSON.parse(JSON.stringify(DEFAULTS));
    Object.assign(c, over || {});
    c.fixes = Object.assign({}, DEFAULTS.fixes, (over && over.fixes) || {});
    return c;
  }

  // ── feature assembly helpers ────────────────────────────────────────────
  function hstackSkip(emb, u) {
    return emb.map((row, t) => {
      const out = new Float64Array(row.length + 1);
      out.set(row);
      out[row.length] = u[t];
      return out;
    });
  }
  function lagMatrix(y, lags) {
    return y.map((_, t) => {
      const row = new Float64Array(lags);
      for (let k = 0; k < lags; k++) row[k] = t - lags + 1 + k >= 0 ? y[t - lags + 1 + k] : y[0];
      return row;
    });
  }

  function fitPredict(F, y, h, fitLo, fitHi, predLo, predHi, alpha) {
    const Xtr = [], ytr = [];
    for (let t = fitLo; t < fitHi; t++) { Xtr.push(F[t]); ytr.push(y[t + h]); }
    const m = Q.ridgeFit(Xtr, ytr, alpha);
    const pred = [];
    for (let t = predLo; t < predHi; t++) pred.push(m.predict(F[t]));
    return { pred, model: m };
  }

  function makeEvaluator(c, y) {
    const T = y.length, h = c.horizon;
    const trainEnd = Math.floor(c.trainFrac * T);
    const valStart = Math.floor(c.valFrac * trainEnd);
    const washout = c.fixes.applyWashout ? c.washout : 0;
    return {
      T, h, trainEnd, valStart, washout,
      validationR2(F, alpha) {
        const { pred } = fitPredict(F, y, h, washout, valStart - h, valStart, trainEnd - h, alpha);
        const target = [];
        for (let t = valStart; t < trainEnd - h; t++) target.push(y[t + h]);
        return Q.r2score(target, pred);
      },
      rollingTest(F, alpha) {
        const preds = [], targets = [], idx = [];
        for (let origin = trainEnd; origin < T - h; origin += c.retrainEvery) {
          const stop = Math.min(origin + c.retrainEvery, T - h);
          const { pred } = fitPredict(F, y, h, washout, origin - h + 1, origin, stop, alpha);
          for (let i = 0; i < pred.length; i++) {
            preds.push(pred[i]);
            targets.push(y[origin + i + h]);
            idx.push(origin + i);
          }
        }
        return { pred: preds, target: targets, idx };
      },
      select(featsByKey, keys) {
        let best = { r2: -Infinity };
        const grid = [];
        keys.forEach((k) => c.alphas.forEach((a) => {
          const r2 = this.validationR2(featsByKey[k], a);
          grid.push({ key: k, alpha: a, r2 });
          if (r2 > best.r2) best = { r2, key: k, alpha: a };
        }));
        return { best, grid };
      }
    };
  }

  function report(name, pred, target, idx, y, h, cycle) {
    const mse = (p) => target.reduce((a, v, i) => a + (v - p[i]) ** 2, 0) / target.length;
    const pers = idx.map((t) => y[t]);
    const seas = idx.map((t) => y[Math.max(0, t + h - cycle)]);
    return {
      model: name,
      r2: Q.r2score(target, pred),
      mae: Q.mae(target, pred),
      rmse: Q.rmse(target, pred),
      nrmse: Q.nrmse(target, pred),
      skill_vs_persistence: 1 - mse(pred) / (mse(pers) || 1e-12),
      skill_vs_seasonal: 1 - mse(pred) / (mse(seas) || 1e-12),
      pred, target, idx
    };
  }

  // ── the run ─────────────────────────────────────────────────────────────
  async function runExperiment(over, hooks) {
    const c = cfg(over);
    const hk = hooks || {};
    const say = (stage, msg) => { if (hk.onStage) hk.onStage(stage, msg); return new Promise((r) => setTimeout(r, 0)); };
    const t0 = performance.now();

    root.tracking.setExperiment('mackey_glass_dqrc');
    const run = root.tracking.startRun({
      runName: c.runName || 'dqrc_h' + c.horizon,
      tags: { 'mlflow.source.name': 'redset_experiment.py (browser port)', stage: 'part4-demo' }
    });

    // ── 1. data ───────────────────────────────────────────────────────────
    await say('data', 'Integrating Mackey-Glass, \u03c4=' + c.mgTau);
    const y = Q.mackeyGlass({ n: c.T, tau: c.mgTau, seed: c.seed });
    const T = y.length;
    const ev = makeEvaluator(c, y);

    run.logParams({
      dataset: c.dataset, series_length: T, tau_mg: c.mgTau, seed: c.seed,
      horizon: c.horizon, train_frac: c.trainFrac, val_frac: c.valFrac,
      washout: ev.washout, retrain_every: c.retrainEvery
    });
    run.setTag('task', 'one-step-ahead forecasting, h=' + c.horizon + ' bins');

    // ── 2. input scaling (redset fix 1) ───────────────────────────────────
    await say('encode', 'Scaling input for the reservoir');
    const fitRange = c.fixes.scalerFitRange;
    const scaleSlice = fitRange === 'pre_validation' ? y.slice(0, ev.valStart) : y;
    const uHi = Q.quantile(scaleSlice, 0.995);
    const u = y.map((v) => Math.min(1, Math.max(0, v / uHi)) * 0.5);
    const theta = u.map((v) => v * 2 * Math.PI * 0.5); // angle view, [0, pi/2]*
    run.logParams({
      'input_scaling/fit_range': fitRange,
      'input_scaling/u_hi': uHi.toFixed(6),
      'input_scaling/target_range': '[0, 0.5]',
      'quantum_circuit/applied_encoding': 'angle'
    });
    if (fitRange !== 'pre_validation')
      run.setTag('warning', 'input scaler fitted on the full stream (test data leaked into preprocessing)');

    // ── 3. reservoir embeddings, with the cache ───────────────────────────
    await say('reservoir', 'Evolving the dissipative reservoir');
    Q.EmbeddingCache.buggyKey = !c.fixes.cacheKeyIncludesParams;
    const genParams = {
      dataset: c.dataset, split: c.trainFrac + '/' + c.valFrac,
      n_qubits: c.nQubits, gammas: c.gammas, tau: c.tau, seed: c.resSeed,
      include_xyz: c.includeXYZ, include_zz: c.includeZZ,
      n_u_levels: c.nULevels, u_hi: Number(uHi.toFixed(10)), T: T
    };
    const cacheKey = Q.EmbeddingCache.key(genParams);
    let hit = Q.EmbeddingCache.get(genParams);
    let embAll, embMeta, embTime;

    if (hit) {
      embAll = hit.value; embMeta = hit.meta; embTime = 0;
      await say('reservoir', 'Cache hit \u2014 reusing embeddings ' + cacheKey);
    } else {
      const te0 = performance.now();
      const out = Q.dissipativeQRC(u, {
        nQubits: c.nQubits, gammas: c.gammas, tau: c.tau, seed: c.resSeed,
        includeXYZ: c.includeXYZ, includeZZ: c.includeZZ, nULevels: c.nULevels
      });
      embTime = (performance.now() - te0) / 1000;
      embAll = out.emb;
      embMeta = {
        generated_by: genParams, labels: out.labels, n_features: out.labels.length,
        n_unitaries_cached: out.nUnitaries, shape: [out.emb.length, T, out.labels.length]
      };
      Q.EmbeddingCache.put(genParams, embAll, embMeta);
    }

    run.logParams({
      'reservoir/model': 'dissipative_qrc',
      'reservoir/n_qubits': c.nQubits,
      'reservoir/tau': c.tau,
      'reservoir/gammas': JSON.stringify(c.gammas),
      'reservoir/include_xyz': c.includeXYZ,
      'reservoir/seed': c.resSeed,
      'reservoir/n_u_levels': c.nULevels,
      'reservoir/n_features_expected': c.nQubits * (c.includeXYZ ? 3 : 1) + (c.includeZZ ? (c.nQubits * (c.nQubits - 1)) / 2 : 0),
      'reservoir/embedding_cache_key': cacheKey,
      'reservoir/embedding_cache_keyed_on': c.fixes.cacheKeyIncludesParams ? 'dataset+split+param_hash' : 'dataset+split',
      'reservoir/embedding_loaded_from_cache': String(!!hit)
    });
    run.logDict(embMeta, 'qrc_embeddings/cache_meta.json');
    if (embTime) run.logMetric('reservoir/embedding_generation_time_s', embTime);

    const nFeat = embAll[0][0].length;
    run.logMetric('reservoir/n_features_actual', nFeat);

    const meta = Q.circuitMeta({ nq: c.nQubits }, { optimizationLevel: c.optimizationLevel ?? 3, trotterSteps: 1 });
    root.tracking.logQuantumProvenance(run, {
      used_gates: meta.gates,
      used_measurements: (embMeta.labels || []).slice(0, 64),
      execution_order: 'H^n \u2192 [exp(-iH(u_t)\u03c4) \u2192 amplitude damping \u03b3]\u00d7T \u2192 readout',
      circuit_width: meta.width,
      circuit_depth: meta.depth,
      circuit_size: meta.size,
      applied_encoding: 'angle',
      num_qubits: c.nQubits,
      qubit_connectivity: 'linear chain (nearest-neighbour ZZ)',
      gate_set: meta.basis,
      optimization_level: meta.optimizationLevel,
      optimization_goals: ['depth'],
      compilation_random_seed: c.resSeed,
      input_data: { n_steps: T, u_range: [Math.min.apply(null, u), Math.max.apply(null, u)], encoding: 'angle' },
      output_data: { artifact_path: 'qrc_embeddings/embeddings.npy', embeddings_shape: [embAll.length, T, nFeat] },
      execution_time_s: embTime,
      num_shots: null,
      applied_error_mitigation: 'none (exact density-matrix simulation)'
    });

    // ── 4. feature sets ───────────────────────────────────────────────────
    const qrcFeats = {};
    c.gammas.forEach((g, k) => { qrcFeats[g] = hstackSkip(Array.from(embAll[k]), u); });

    await say('baseline', 'Running the classical ESN baseline');
    const esn = Q.esnStates(u, { nUnits: c.esnUnits, leak: c.esnLeak, sr: c.esnSR, seed: c.resSeed });
    const esnFeats = hstackSkip(esn, u);
    const lagFeats = lagMatrix(y, c.rawLags);
    run.logParams({
      'baseline/esn_units': c.esnUnits, 'baseline/esn_leak': c.esnLeak,
      'baseline/esn_spectral_radius': c.esnSR, 'baseline/raw_lags': c.rawLags
    });

    // ── 5. model selection on the validation slice ─────────────────────────
    await say('select', 'Selecting \u03b3 and \u03b1 on the validation slice');
    const sel = ev.select(qrcFeats, c.gammas);
    run.logParams({
      'readout/selected_gamma': sel.best.key,
      'readout/selected_alpha': sel.best.alpha,
      'readout/selection_slice': '[' + ev.valStart + ', ' + ev.trainEnd + ')'
    });
    run.logMetric('validation/r2_selected', sel.best.r2);
    sel.grid.forEach((g) => run.logMetric('validation/r2_gamma_' + String(g.key).replace('.', '_') + '_alpha_' + String(g.alpha).replace('.', '_'), g.r2));
    run.logDict(sel.grid.map((g) => ({ gamma: g.key, alpha: g.alpha, val_r2: Number(g.r2.toFixed(5)) })), 'readout/validation_grid.json');

    // ── 6. rolling-origin test ────────────────────────────────────────────
    await say('evaluate', 'Rolling-origin test with periodic readout refits');
    const results = [];

    const tTest = [];
    for (let t = ev.trainEnd; t < T - c.horizon; t++) tTest.push(t);
    const targetNaive = tTest.map((t) => y[t + c.horizon]);
    results.push(report('persistence', tTest.map((t) => y[t]), targetNaive, tTest, y, c.horizon, c.cycle));
    results.push(report('seasonal-naive (1 cycle)', tTest.map((t) => y[Math.max(0, t + c.horizon - c.cycle)]), targetNaive, tTest, y, c.horizon, c.cycle));

    const lagSel = ev.select({ raw: lagFeats }, ['raw']);
    let r = ev.rollingTest(lagFeats, lagSel.best.alpha);
    results.push(report('Ridge on ' + c.rawLags + ' raw lags', r.pred, r.target, r.idx, y, c.horizon, c.cycle));

    const esnSel = ev.select({ esn: esnFeats }, ['esn']);
    r = ev.rollingTest(esnFeats, esnSel.best.alpha);
    const esnRes = report('Classical ESN (' + (c.esnUnits + 1) + ' features)', r.pred, r.target, r.idx, y, c.horizon, c.cycle);
    results.push(esnRes);

    r = ev.rollingTest(qrcFeats[sel.best.key], sel.best.alpha);
    const qrcRes = report('Dissipative QRC (\u03b3=' + sel.best.key + ')', r.pred, r.target, r.idx, y, c.horizon, c.cycle);
    results.push(qrcRes);

    // ── 7. log metrics the way evaluate.py does ───────────────────────────
    ['r2', 'mae', 'rmse', 'nrmse', 'skill_vs_persistence', 'skill_vs_seasonal'].forEach((k) => {
      run.logMetric('DQRC_' + k, qrcRes[k]);
      run.logMetric('ESN_' + k, esnRes[k]);
    });
    run.logMetric('DQRC_minus_ESN_r2', qrcRes.r2 - esnRes.r2);
    run.logMetric('total_runtime_s', (performance.now() - t0) / 1000);
    run.logDict(results.map((x) => ({
      model: x.model, h: c.horizon,
      R2: Number(x.r2.toFixed(4)), MAE: Number(x.mae.toFixed(4)),
      skill_vs_persistence: Number(x.skill_vs_persistence.toFixed(4)),
      skill_vs_seasonal: Number(x.skill_vs_seasonal.toFixed(4))
    })), 'results/summary.json');
    run.logDict({
      predictions: qrcRes.pred.map((v) => Number(v.toFixed(5))),
      targets: qrcRes.target.map((v) => Number(v.toFixed(5))),
      index: qrcRes.idx
    }, 'DQRC_predictions/predictions.json');

    const consistent = nFeat === Number(run.record.params['reservoir/n_features_expected']);
    run.setTag('provenance_self_consistent', String(consistent));
    if (!consistent)
      run.logText(
        'Embedding array has ' + nFeat + ' observables but reservoir/n_features_expected = ' +
        run.record.params['reservoir/n_features_expected'] + '.\nThe array came from cache key ' + cacheKey +
        ', generated with:\n' + JSON.stringify(embMeta.generated_by, null, 2),
        'diagnostics/provenance_mismatch.txt'
      );
    run.end('FINISHED');

    return {
      cfg: c, y, u, theta, ev, results, qrcRes, esnRes, sel, run: run.record,
      embAll, embMeta, nFeat, cacheKey, cacheHit: !!hit, embTime, meta, consistent,
      labels: embMeta.labels || []
    };
  }

  /* Seed the cache the way a morning of exploration would: a throwaway
     configuration whose embeddings then get silently reused by the real run,
     because the cache key only knows dataset + split. */
  function poisonCache(over) {
    const c = cfg(over);
    Q.EmbeddingCache.buggyKey = true;
    const y = Q.mackeyGlass({ n: c.T, tau: c.mgTau, seed: c.seed });
    const ev = makeEvaluator(c, y);
    const uHi = Q.quantile(y.slice(0, ev.valStart), 0.995);
    const u = y.map((v) => Math.min(1, Math.max(0, v / uHi)) * 0.5);
    const stale = { nQubits: 3, tau: 2.6, includeXYZ: false, gammas: c.gammas, seed: 7 };
    const out = Q.dissipativeQRC(u, {
      nQubits: stale.nQubits, gammas: stale.gammas, tau: stale.tau,
      seed: stale.seed, includeXYZ: stale.includeXYZ, includeZZ: true, nULevels: c.nULevels
    });
    Q.EmbeddingCache.put(
      { dataset: c.dataset, split: c.trainFrac + '/' + c.valFrac },
      out.emb,
      {
        generated_by: {
          dataset: c.dataset, split: c.trainFrac + '/' + c.valFrac,
          n_qubits: stale.nQubits, tau: stale.tau, include_xyz: stale.includeXYZ,
          gammas: stale.gammas, seed: stale.seed, note: 'morning scratch run, tau sweep'
        },
        labels: out.labels, n_features: out.labels.length,
        shape: [out.emb.length, u.length, out.labels.length]
      }
    );
    return Q.EmbeddingCache.key({ dataset: c.dataset, split: c.trainFrac + '/' + c.valFrac });
  }

  root.pipeline = { DEFAULTS, cfg, runExperiment, poisonCache, makeEvaluator, report };
})(window);
