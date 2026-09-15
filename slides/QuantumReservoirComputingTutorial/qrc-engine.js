/* qrc-engine.js — browser port of the Python pipeline.
   Sources:
     valterUo/quantum_reservoir_for_index_errors : qrc_fast.py, QRC_dynamic.py,
                                                   redset_experiment.py, evaluate.py
     valterUo/mackey-glass-quantum-reservoir     : classical_baseline.py, utils/evaluate.py
   Math is the same model, restricted to n<=5 qubits so it runs in a browser.
     H(u) = sum_i h_i X_i + sum_i J_i Z_i Z_{i+1} + u * sum_i w_i Z_i
     rho <- U rho U^dag,   U = exp(-i H(u) tau)
     rho <- (1-g) rho + g |0..0><0..0|
     readouts: <Z_i>, [<X_i>, <Y_i>], [<Z_i Z_j>]   (qrc_fast layout order)
*/
(function (root) {
  'use strict';

  // ── RNG (deterministic, seeded) ──────────────────────────────────────────
  function rng(seed) {
    let s = (seed | 0) || 42;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const uniform = (r, lo, hi, n) =>
    Float64Array.from({ length: n }, () => lo + (hi - lo) * r());
  function normals(r, n) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let u = 0, v = 0;
      while (u === 0) u = r();
      while (v === 0) v = r();
      out[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    return out;
  }

  // ── Mackey-Glass (reservoirpy.datasets.mackey_glass model, RK4) ──────────
  // dx/dt = a * x(t-tau) / (1 + x(t-tau)^n) - b * x(t)
  function mackeyGlass(opts) {
    const o = Object.assign(
      { n: 600, tau: 17, a: 0.2, b: 0.1, nExp: 10, x0: 1.2, h: 1.0, seed: 42, discard: 200 },
      opts || {}
    );
    const r = rng(o.seed);
    const steps = Math.round(o.tau / o.h);
    // history buffer: small random perturbation around x0, as reservoirpy does
    const hist = new Float64Array(steps + 1);
    for (let i = 0; i <= steps; i++) hist[i] = o.x0 + 0.2 * (r() - 0.5);
    let x = o.x0, hi = 0;
    const f = (xt, xtau) => (o.a * xtau) / (1 + Math.pow(xtau, o.nExp)) - o.b * xt;
    const total = o.n + o.discard;
    const out = new Float64Array(total);
    for (let t = 0; t < total; t++) {
      const xtau = hist[hi];
      const h = o.h;
      const k1 = f(x, xtau);
      const k2 = f(x + 0.5 * h * k1, xtau);
      const k3 = f(x + 0.5 * h * k2, xtau);
      const k4 = f(x + h * k3, xtau);
      x = x + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      hist[hi] = x;
      hi = (hi + 1) % (steps + 1);
      out[t] = x;
    }
    return Array.from(out.slice(o.discard)); // drop transient
  }

  // ── symmetric eigendecomposition (cyclic Jacobi) ─────────────────────────
  function eighSym(A, n) {
    const a = Float64Array.from(A);
    const V = new Float64Array(n * n);
    for (let i = 0; i < n; i++) V[i * n + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
      if (off < 1e-24) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = a[p * n + q];
          if (Math.abs(apq) < 1e-18) continue;
          const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = a[k * n + p], akq = a[k * n + q];
            a[k * n + p] = c * akp - s * akq;
            a[k * n + q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = a[p * n + k], aqk = a[q * n + k];
            a[p * n + k] = c * apk - s * aqk;
            a[q * n + k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k * n + p], vkq = V[k * n + q];
            V[k * n + p] = c * vkp - s * vkq;
            V[k * n + q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = a[i * n + i];
    return { w, V }; // columns of V are eigenvectors
  }

  // ── reservoir operators (qrc_fast.build_reservoir) ───────────────────────
  // big-endian kron order: qubit i occupies bit (nq-1-i)
  const bitOf = (j, i, nq) => (j >> (nq - 1 - i)) & 1;
  const flipBit = (j, i, nq) => j ^ (1 << (nq - 1 - i));

  function buildReservoir(cfg) {
    const c = Object.assign(
      { nQubits: 4, JScale: 1, hScale: 1, inputScale: 1, seed: 42, includeZZ: true, includeXYZ: true },
      cfg || {}
    );
    const nq = c.nQubits, d = 1 << nq, r = rng(c.seed);
    const J_w = uniform(r, 0.5, 1.5, nq - 1).map((v) => v * c.JScale);
    const h_w = uniform(r, 0.5, 1.5, nq).map((v) => v * c.hScale);
    const in_w = uniform(r, 0.5, 1.5, nq).map((v) => v * c.inputScale);

    const zdiag = [];
    for (let i = 0; i < nq; i++) {
      const v = new Float64Array(d);
      for (let j = 0; j < d; j++) v[j] = bitOf(j, i, nq) ? -1 : 1;
      zdiag.push(v);
    }
    // dense real symmetric X drive
    const H_x = new Float64Array(d * d);
    for (let i = 0; i < nq; i++)
      for (let j = 0; j < d; j++) H_x[j * d + flipBit(j, i, nq)] += h_w[i];
    const zz_diag = new Float64Array(d), in_diag = new Float64Array(d);
    for (let i = 0; i < nq - 1; i++)
      for (let j = 0; j < d; j++) zz_diag[j] += J_w[i] * zdiag[i][j] * zdiag[i + 1][j];
    for (let i = 0; i < nq; i++)
      for (let j = 0; j < d; j++) in_diag[j] += in_w[i] * zdiag[i][j];

    // readout layout, original order: Z singles, X singles, Y singles, ZZ pairs
    const layout = [];
    for (let i = 0; i < nq; i++) layout.push({ kind: 'Z', diag: zdiag[i], label: '\u27e8Z' + i + '\u27e9' });
    if (c.includeXYZ) {
      for (let i = 0; i < nq; i++) layout.push({ kind: 'X', q: i, label: '\u27e8X' + i + '\u27e9' });
      for (let i = 0; i < nq; i++) layout.push({ kind: 'Y', q: i, label: '\u27e8Y' + i + '\u27e9' });
    }
    if (c.includeZZ)
      for (let i = 0; i < nq; i++)
        for (let j = i + 1; j < nq; j++) {
          const v = new Float64Array(d);
          for (let k = 0; k < d; k++) v[k] = zdiag[i][k] * zdiag[j][k];
          layout.push({ kind: 'ZZ', diag: v, label: '\u27e8Z' + i + 'Z' + j + '\u27e9' });
        }
    return { nq, d, H_x, zz_diag, in_diag, layout, J_w, h_w, in_w, cfg: c };
  }

  // ── dissipative QRC, batched over gammas (qrc_fast.dissipative_qrc_fast) ─
  function dissipativeQRC(uSeq, opts) {
    const o = Object.assign(
      { nQubits: 4, gammas: [0.25], tau: 0.3, seed: 42, includeZZ: true, includeXYZ: true,
        nULevels: 64, JScale: 1, hScale: 1, inputScale: 1, rho0: null },
      opts || {}
    );
    const res = buildReservoir(o);
    const d = res.d, nf = res.layout.length, G = o.gammas.length, T = uSeq.length;

    // quantize inputs so unitaries can be cached
    let levels, uOfLevel;
    if (o.nULevels) {
      const lo = Math.min.apply(null, uSeq), hi = Math.max.apply(null, uSeq);
      const span = hi > lo ? hi - lo : 1;
      levels = uSeq.map((u) => Math.round(((u - lo) / span) * (o.nULevels - 1)));
      uOfLevel = Array.from({ length: o.nULevels }, (_, k) => lo + (k / (o.nULevels - 1)) * span);
    } else {
      const uniq = Array.from(new Set(uSeq));
      levels = uSeq.map((u) => uniq.indexOf(u));
      uOfLevel = uniq;
    }

    const cache = new Map();
    const H = new Float64Array(d * d);
    function unitary(lv) {
      let U = cache.get(lv);
      if (U) return U;
      H.set(res.H_x);
      for (let j = 0; j < d; j++) H[j * d + j] += res.zz_diag[j] + uOfLevel[lv] * res.in_diag[j];
      const { w, V } = eighSym(H, d);
      const Ur = new Float64Array(d * d), Ui = new Float64Array(d * d);
      for (let a = 0; a < d; a++)
        for (let b = 0; b < d; b++) {
          let sr = 0, si = 0;
          for (let k = 0; k < d; k++) {
            const vv = V[a * d + k] * V[b * d + k], ph = -w[k] * o.tau;
            sr += vv * Math.cos(ph);
            si += vv * Math.sin(ph);
          }
          Ur[a * d + b] = sr; Ui[a * d + b] = si;
        }
      U = { Ur, Ui };
      cache.set(lv, U);
      return U;
    }

    // rho stack, one per gamma
    const rhoR = [], rhoI = [];
    for (let g = 0; g < G; g++) {
      const R = new Float64Array(d * d), I = new Float64Array(d * d);
      if (o.rho0 && o.rho0[g]) { R.set(o.rho0[g].R); I.set(o.rho0[g].I); } else R[0] = 1;
      rhoR.push(R); rhoI.push(I);
    }
    const tR = new Float64Array(d * d), tI = new Float64Array(d * d);
    const emb = Array.from({ length: G }, () => []);

    for (let t = 0; t < T; t++) {
      const { Ur, Ui } = unitary(levels[t]);
      for (let g = 0; g < G; g++) {
        const R = rhoR[g], I = rhoI[g], gam = o.gammas[g];
        // tmp = U * rho
        for (let a = 0; a < d; a++)
          for (let b = 0; b < d; b++) {
            let sr = 0, si = 0;
            for (let k = 0; k < d; k++) {
              const ur = Ur[a * d + k], ui = Ui[a * d + k], rr = R[k * d + b], ri = I[k * d + b];
              sr += ur * rr - ui * ri;
              si += ur * ri + ui * rr;
            }
            tR[a * d + b] = sr; tI[a * d + b] = si;
          }
        // rho = tmp * U^dag
        for (let a = 0; a < d; a++)
          for (let b = 0; b < d; b++) {
            let sr = 0, si = 0;
            for (let k = 0; k < d; k++) {
              const tr = tR[a * d + k], ti = tI[a * d + k];
              const ur = Ur[b * d + k], ui = -Ui[b * d + k]; // conj transpose
              sr += tr * ur - ti * ui;
              si += tr * ui + ti * ur;
            }
            R[a * d + b] = sr * (1 - gam); I[a * d + b] = si * (1 - gam);
          }
        R[0] += gam; // + gamma |0..0><0..0|
        // readouts
        const row = new Float64Array(nf);
        for (let f = 0; f < nf; f++) {
          const L = res.layout[f];
          let s = 0;
          if (L.diag) { for (let j = 0; j < d; j++) s += L.diag[j] * R[j * d + j]; }
          else if (L.kind === 'X') { for (let j = 0; j < d; j++) s += R[flipBit(j, L.q, res.nq) * d + j]; }
          else { // Y: <0|Y|1> = -i, <1|Y|0> = +i  ->  tr(Y rho) = sum_j (+/-i) rho[flip(j), j]
            for (let j = 0; j < d; j++) {
              const sgn = bitOf(j, L.q, res.nq) ? 1 : -1;
              s += -sgn * I[flipBit(j, L.q, res.nq) * d + j];
            }
          }
          row[f] = s;
        }
        emb[g].push(row);
      }
    }
    return { emb, reservoir: res, nUnitaries: cache.size, labels: res.layout.map((l) => l.label) };
  }

  // ── circuit metadata (what transpilation would report) ───────────────────
  function circuitMeta(res, opts) {
    const o = Object.assign({ optimizationLevel: 3, trotterSteps: 1 }, opts || {});
    const nq = res.nq;
    // Trotterized exp(-iH tau): H = X drive (nq Rx) + ZZ chain (nq-1) + Z input (nq)
    const rz = (nq * 2) * o.trotterSteps;
    const rx = nq * o.trotterSteps;
    const cx = 2 * (nq - 1) * o.trotterSteps;
    const raw = { rz, rx, cx, size: rz + rx + cx, depth: (3 + 4 * (nq - 1)) * o.trotterSteps };
    const shrink = [1.0, 0.92, 0.78, 0.7][Math.min(3, o.optimizationLevel)];
    return {
      width: nq,
      size: Math.round(raw.size * shrink),
      depth: Math.round(raw.depth * shrink),
      cx: Math.round(cx * shrink),
      gates: ['h', 'rx', 'rz', 'cx'],
      basis: ['id', 'rz', 'sx', 'x', 'cx'],
      optimizationLevel: o.optimizationLevel,
      rawSize: raw.size, rawDepth: raw.depth
    };
  }

  // ── classical leaky ESN baseline (classical_reservoir.py model) ──────────
  function esnStates(uSeq, opts) {
    const o = Object.assign({ nUnits: 60, leak: 0.3, sr: 0.9, inputScale: 1.0, seed: 42 }, opts || {});
    const N = o.nUnits, r = rng(o.seed);
    const W = normals(r, N * N), Win = normals(r, N).map((v) => v * o.inputScale);
    // scale W to requested spectral radius (power iteration)
    let v = normals(r, N), lam = 1;
    for (let it = 0; it < 60; it++) {
      const nv = new Float64Array(N);
      for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += W[i * N + j] * v[j]; nv[i] = s; }
      lam = Math.sqrt(nv.reduce((a, b) => a + b * b, 0)) || 1;
      for (let i = 0; i < N; i++) nv[i] /= lam;
      v = nv;
    }
    const k = o.sr / lam;
    for (let i = 0; i < N * N; i++) W[i] *= k;
    let x = new Float64Array(N);
    const out = [];
    for (let t = 0; t < uSeq.length; t++) {
      const pre = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        let s = Win[i] * uSeq[t];
        for (let j = 0; j < N; j++) s += W[i * N + j] * x[j];
        pre[i] = Math.tanh(s);
      }
      for (let i = 0; i < N; i++) x[i] = (1 - o.leak) * x[i] + o.leak * pre[i];
      out.push(Float64Array.from(x));
    }
    return out;
  }

  // ── ridge readout with standardisation (make_pipeline(StandardScaler, Ridge)) ─
  function solve(A, b, n) {
    const M = Float64Array.from(A), y = Float64Array.from(b);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r2 = c + 1; r2 < n; r2++) if (Math.abs(M[r2 * n + c]) > Math.abs(M[p * n + c])) p = r2;
      if (p !== c) {
        for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[p * n + k]; M[p * n + k] = t; }
        const t = y[c]; y[c] = y[p]; y[p] = t;
      }
      const piv = M[c * n + c] || 1e-12;
      for (let r2 = 0; r2 < n; r2++) {
        if (r2 === c) continue;
        const f = M[r2 * n + c] / piv;
        if (!f) continue;
        for (let k = c; k < n; k++) M[r2 * n + k] -= f * M[c * n + k];
        y[r2] -= f * y[c];
      }
    }
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = y[i] / (M[i * n + i] || 1e-12);
    return w;
  }

  function ridgeFit(X, y, alpha) {
    const n = X.length, p = X[0].length;
    const mean = new Float64Array(p), std = new Float64Array(p);
    for (let j = 0; j < p; j++) {
      let s = 0; for (let i = 0; i < n; i++) s += X[i][j];
      mean[j] = s / n;
      let v = 0; for (let i = 0; i < n; i++) v += (X[i][j] - mean[j]) ** 2;
      std[j] = Math.sqrt(v / n) || 1;
    }
    let ymean = 0; for (let i = 0; i < n; i++) ymean += y[i]; ymean /= n;
    const G = new Float64Array(p * p), b = new Float64Array(p);
    for (let i = 0; i < n; i++) {
      const z = new Float64Array(p);
      for (let j = 0; j < p; j++) z[j] = (X[i][j] - mean[j]) / std[j];
      const dy = y[i] - ymean;
      for (let a = 0; a < p; a++) {
        b[a] += z[a] * dy;
        for (let c = a; c < p; c++) G[a * p + c] += z[a] * z[c];
      }
    }
    for (let a = 0; a < p; a++) { G[a * p + a] += alpha; for (let c = a + 1; c < p; c++) G[c * p + a] = G[a * p + c]; }
    const w = solve(G, b, p);
    return { w, mean, std, ymean, alpha, predict: (row) => {
      let s = ymean;
      for (let j = 0; j < p; j++) s += w[j] * ((row[j] - mean[j]) / std[j]);
      return s;
    } };
  }

  const r2score = (yt, yp) => {
    const n = yt.length; let m = 0;
    for (let i = 0; i < n; i++) m += yt[i]; m /= n;
    let ss = 0, tt = 0;
    for (let i = 0; i < n; i++) { ss += (yt[i] - yp[i]) ** 2; tt += (yt[i] - m) ** 2; }
    return 1 - ss / (tt || 1e-12);
  };
  const mae = (yt, yp) => yt.reduce((a, v, i) => a + Math.abs(v - yp[i]), 0) / yt.length;
  const rmse = (yt, yp) => Math.sqrt(yt.reduce((a, v, i) => a + (v - yp[i]) ** 2, 0) / yt.length);
  const nrmse = (yt, yp) => {
    const rng2 = Math.max.apply(null, yt) - Math.min.apply(null, yt);
    return rmse(yt, yp) / (rng2 || 1);
  };
  const quantile = (arr, q) => {
    const s = Array.from(arr).sort((a, b) => a - b);
    const i = (s.length - 1) * q;
    return s[Math.floor(i)] + (s[Math.min(s.length - 1, Math.ceil(i))] - s[Math.floor(i)]) * (i - Math.floor(i));
  };

  // ── embedding cache, faithfully including the historical bug ─────────────
  // redset_experiment.py protocol fix 2: "Embedding cache filenames include a
  // hash of ALL generating parameters (original cache was keyed by dataset
  // name + split only -> stale caches)."
  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0').slice(0, 8);
  };
  const EmbeddingCache = {
    store: new Map(),
    buggyKey: true, // true = key on dataset + split only (the bug)
    key(params) {
      return this.buggyKey
        ? 'dqrc_' + params.dataset + '_' + params.split
        : 'dqrc_' + params.dataset + '_' + params.split + '_' + hash(JSON.stringify(params, Object.keys(params).sort()));
    },
    get(params) { return this.store.get(this.key(params)); },
    put(params, value, meta) { this.store.set(this.key(params), { value, meta, key: this.key(params) }); },
    clear() { this.store.clear(); }
  };

  root.QRC = {
    rng, normals, mackeyGlass, eighSym, buildReservoir, dissipativeQRC, circuitMeta,
    esnStates, ridgeFit, r2score, mae, rmse, nrmse, quantile, hash, EmbeddingCache
  };
})(window);
