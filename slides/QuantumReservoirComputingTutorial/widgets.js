/* widgets.js — interactive panels for the tutorial deck.
   Plain custom elements: no build step, no framework. Each one reads the
   engine in qrc-engine.js and writes to the tracking client in tracking.js. */
(function () {
  'use strict';

  const T = {
    bg: '#f6f2ec', panel: '#ffffff', panel2: '#f0eae0', line: '#e2dad0',
    text: '#2f2b27', dim: '#6b6359', faint: '#6f675e',
    teal: '#28697a', amber: '#8c5731', violet: '#71578b', rose: '#8e5460',
    mono: "'JetBrains Mono', ui-monospace, monospace",
    sans: "'IBM Plex Sans', system-ui, sans-serif",
    serif: "'Source Serif 4', Georgia, serif"
  };
  const fmt = (v, n) => (v === null || v === undefined || Number.isNaN(v) ? '\u2014' : Number(v).toFixed(n === undefined ? 3 : n));
  const el = (tag, style, text) => {
    const e = document.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const css = (s) => s.replace(/\s+/g, ' ').trim();

  /* Any click, pointer or key event that lands inside one of these panels is
     for the panel. Stop it reaching slide-advance handlers on ancestors or on
     window — registered in the capture phase at window so it wins over
     bubble-phase navigation, and again on each host for capture listeners
     registered later. */
  const PANEL_TAGS = ['MG-LAB', 'DQRC-LAB', 'PIPELINE-RUN', 'DEBUG-LAB', 'SWEEP-LAB', 'MLFLOW-PANEL', 'ESN-VS-QRC', 'PY-CODE'];
  function insidePanel(e) {
    const path = e.composedPath ? e.composedPath() : [];
    for (const n of path) if (n.tagName && PANEL_TAGS.indexOf(n.tagName) > -1) return true;
    return false;
  }
  const CONTROL_SEL = 'input, button, select, textarea, a[href], [tabindex]:not([tabindex^="-"])';
  function shieldHost(host) {
    ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'keydown'].forEach((type) => {
      host.addEventListener(type, (e) => {
        // bubble phase: the control has already handled it, so stopping here is
        // safe and keeps ancestor / window navigation handlers out of it
        e.stopPropagation();
        // a click on panel background hits no control — cancel it too, in case a
        // host shell navigates from a capture-phase listener we cannot reach
        if (e.type === 'click' || e.type === 'dblclick') {
          const path = e.composedPath ? e.composedPath() : [];
          const onControl = path.some((n) => n.matches && n.matches(CONTROL_SEL));
          if (!onControl) e.preventDefault();
        }
      });
    });
  }

  /* Custom elements must never mutate their light DOM — React owns those
     children. Everything renders into a shadow root instead; light children
     stay untouched and are simply not slotted. */
  function shadow(host, hostCss) {
    shieldHost(host);
    const root = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = ':host{' + hostCss + '}*{box-sizing:border-box}' +
      '::-webkit-scrollbar{width:9px;height:9px}' +
      '::-webkit-scrollbar-thumb{background:#e2dad0;border-radius:5px}' +
      '::-webkit-scrollbar-track{background:transparent}' +
      'button{font-family:inherit}';
    root.append(st);
    return root;
  }

  const S = {
    card: css(`background:${T.panel};border:1px solid ${T.line};border-radius:10px;`),
    label: css(`font:600 23px ${T.sans};letter-spacing:.06em;text-transform:uppercase;color:#6b6359;`),
    btn: css(`font:600 17px ${T.sans};padding:11px 20px;border-radius:7px;border:1px solid ${T.line};
              background:${T.panel2};color:${T.text};cursor:pointer;min-height:46px;`),
    btnPrimary: css(`font:600 17px ${T.sans};padding:11px 22px;border-radius:7px;border:1px solid ${T.teal};
              background:rgba(40,105,122,.14);color:${T.teal};cursor:pointer;min-height:46px;`),
    btnWarn: css(`font:600 17px ${T.sans};padding:11px 22px;border-radius:7px;border:1px solid ${T.amber};
              background:rgba(140,87,49,.14);color:${T.amber};cursor:pointer;min-height:46px;`),
    mono: css(`font:400 16px ${T.mono};color:${T.text};`),
    dimMono: css(`font:400 15px ${T.mono};color:${T.dim};`)
  };

  /* ── canvas plotting ──────────────────────────────────────────────────── */
  function ctxOf(canvas, w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    return c;
  }

  function linePlot(canvas, w, h, opts) {
    const o = Object.assign({ series: [], bands: [], pad: { l: 52, r: 12, t: 12, b: 26 }, yLabel: '', xLabel: '', grid: true }, opts);
    const c = ctxOf(canvas, w, h);
    const p = o.pad;
    const iw = w - p.l - p.r, ih = h - p.t - p.b;
    let lo = Infinity, hi = -Infinity, n = 0, x0 = Infinity;
    o.series.forEach((s) => {
      s.data.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; });
      n = Math.max(n, (s.x ? Math.max.apply(null, s.x) + 1 : s.data.length));
      x0 = Math.min(x0, s.x ? Math.min.apply(null, s.x) : 0);
    });
    if (!o.fitX) x0 = 0;
    if (o.yMin !== undefined) lo = o.yMin;
    if (o.yMax !== undefined) hi = o.yMax;
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const span = hi - lo || 1;
    // explicit bounds are respected exactly, so tick labels land on round values
    if (o.yMin === undefined) lo -= span * 0.08;
    if (o.yMax === undefined) hi += span * 0.08;
    const X = (i) => p.l + ((i - x0) / Math.max(1, n - 1 - x0)) * iw;
    const Y = (v) => p.t + ih - ((v - lo) / (hi - lo)) * ih;

    // band labels stagger onto a second row when a narrow band would push its
    // label into the neighbour's
    const rowRight = [-Infinity, -Infinity];
    o.bands.forEach((b) => {
      const xa = X(b.from), xb = X(b.to);
      c.fillStyle = b.color;
      c.fillRect(xa, p.t, xb - xa, ih);
      c.strokeStyle = 'rgba(111,103,94,.28)';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(xa + 0.5, p.t); c.lineTo(xa + 0.5, p.t + ih); c.stroke();
      if (!b.label) return;
      c.font = '16px ' + T.mono;
      const tw = c.measureText(b.label).width, x = xa + 6;
      const row = x >= rowRight[0] + 10 ? 0 : (x >= rowRight[1] + 10 ? 1 : 0);
      rowRight[row] = x + tw;
      c.fillStyle = b.textColor || '#6b6359';
      c.fillText(b.label, x, p.t + 16 + row * 20);
    });
    if (o.grid) {
      c.strokeStyle = '#ded5c9'; c.lineWidth = 1;
      for (let k = 0; k <= 4; k++) {
        const yy = p.t + (k / 4) * ih;
        c.beginPath(); c.moveTo(p.l, yy); c.lineTo(p.l + iw, yy); c.stroke();
        c.fillStyle = '#6b6359'; c.font = '21px ' + T.mono; c.textAlign = 'right';
        const tv = hi - (k / 4) * (hi - lo);
        c.fillText(o.yTickFmt ? o.yTickFmt(tv) : tv.toFixed(2), p.l - 8, yy + 5);
        c.textAlign = 'left';
      }
    }
    o.series.forEach((s) => {
      c.strokeStyle = s.color; c.lineWidth = s.width || 1.8;
      if (s.dash) c.setLineDash(s.dash); else c.setLineDash([]);
      c.globalAlpha = s.alpha === undefined ? 1 : s.alpha;
      c.beginPath();
      s.data.forEach((v, i) => {
        const xi = s.x ? s.x[i] : i;
        if (i === 0) c.moveTo(X(xi), Y(v)); else c.lineTo(X(xi), Y(v));
      });
      c.stroke();
      c.globalAlpha = 1; c.setLineDash([]);
    });
    (o.hlines || []).forEach((hl) => {
      const yy = Y(hl.y);
      c.strokeStyle = hl.color || '#8c5731'; c.lineWidth = 1.4; c.setLineDash([6, 5]);
      c.beginPath(); c.moveTo(p.l, yy); c.lineTo(p.l + iw, yy); c.stroke();
      c.setLineDash([]);
      if (hl.label) {
        c.fillStyle = hl.color || '#8c5731'; c.font = '21px ' + T.mono; c.textAlign = 'right';
        c.fillText(hl.label, p.l + iw - 6, yy - 7); c.textAlign = 'left';
      }
    });
    if (o.xLabel) { c.fillStyle = '#6b6359'; c.font = '22px ' + T.mono; c.textAlign = 'center'; c.fillText(o.xLabel, p.l + iw / 2, h - 5); c.textAlign = 'left'; }
    if (o.yLabel) {
      c.save(); c.translate(20, p.t + ih / 2); c.rotate(-Math.PI / 2);
      c.fillStyle = '#6b6359'; c.font = '21px ' + T.mono; c.textAlign = 'center';
      c.fillText(o.yLabel, 0, 0); c.restore();
    }
    return { X, Y };
  }

  function heatmap(canvas, w, h, matrix, opts) {
    const o = Object.assign({ pad: { l: 118, r: 10, t: 8, b: 30 }, rowLabels: [], max: null, perRow: true }, opts || {});
    const c = ctxOf(canvas, w, h);
    const rows = matrix.length, cols = matrix[0] ? matrix[0].length : 0;
    if (!rows || !cols) return;
    // per-row scaling: each observable has its own dynamic range, and one
    // shared scale washes the small ones out completely
    const mean = matrix.map((r) => r.reduce((a, v) => a + v, 0) / r.length);
    const scale = matrix.map((r, i) => {
      if (o.max) return o.max;
      const s2 = r.map((v) => Math.abs(v - mean[i])).sort((a, b) => a - b);
      return (s2[Math.floor(s2.length * 0.97)] || s2[s2.length - 1]) || 1;
    });
    let gmax = 0; matrix.forEach((r) => r.forEach((v) => { if (Math.abs(v) > gmax) gmax = Math.abs(v); }));
    gmax = gmax || 1;
    const iw = w - o.pad.l - o.pad.r, ih = h - o.pad.t - o.pad.b;
    const cw = iw / cols, chh = ih / rows;
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        const v = o.perRow ? (matrix[r][k] - mean[r]) / scale[r] : matrix[r][k] / gmax;
        // teal for positive, amber for negative — matched lightness accents
        const a = Math.min(1, Math.abs(v));
        c.fillStyle = v >= 0
          ? 'rgba(40,105,122,' + (0.05 + 0.95 * a) + ')'
          : 'rgba(140,87,49,' + (0.05 + 0.95 * a) + ')';
        c.fillRect(o.pad.l + k * cw, o.pad.t + r * chh, Math.ceil(cw) + 0.5, Math.ceil(chh) + 0.5);
      }
    c.font = '23px ' + T.mono; c.fillStyle = '#6f675e'; c.textAlign = 'right';
    const step = Math.max(1, Math.ceil(27 / chh));
    o.rowLabels.forEach((lb, r) => {
      if (r % step) return;
      c.fillText(lb, o.pad.l - 8, o.pad.t + r * chh + chh / 2 + 4);
    });
    c.textAlign = 'left';
    c.fillStyle = '#6b6359'; c.font = '23px ' + T.mono;
    c.fillText('time step \u2192', o.pad.l, h - 4);
  }

  /* ── controls ─────────────────────────────────────────────────────────── */
  function slider(name, opts, onChange) {
    const wrap = el('div', 'display:grid;grid-template-columns:1fr auto;align-items:center;gap:4px 10px;');
    const lab = el('div', `font:500 24px ${T.sans};color:${T.dim};`, name);
    const val = el('div', `font:600 24px ${T.mono};color:${T.teal};`, String(opts.value));
    const inp = el('input', `grid-column:1/3;width:100%;accent-color:${T.teal};height:22px;`);
    // opts.values: non-uniform scale (e.g. finer near zero). The input then
    // runs over indices and reports the value at that index.
    const vals = opts.values || null;
    const show = (v) => (opts.format ? opts.format(v) : String(v));
    if (vals) {
      const start = Math.max(0, vals.indexOf(opts.value));
      inp.type = 'range'; inp.min = 0; inp.max = vals.length - 1; inp.step = 1; inp.value = start;
      val.textContent = show(vals[start]);
      inp.oninput = () => { const v = vals[+inp.value]; val.textContent = show(v); onChange(v); };
    } else {
      inp.type = 'range'; inp.min = opts.min; inp.max = opts.max; inp.step = opts.step; inp.value = opts.value;
      inp.oninput = () => { val.textContent = show(parseFloat(inp.value)); onChange(parseFloat(inp.value)); };
    }
    wrap.append(lab, val, inp);
    wrap.set = (v) => {
      if (vals) { const i = Math.max(0, vals.indexOf(v)); inp.value = i; val.textContent = show(vals[i]); }
      else { inp.value = v; val.textContent = show(v); }
    };
    return wrap;
  }
  function segmented(options, value, onChange) {
    const wrap = el('div', `display:flex;gap:0;border:1px solid ${T.line};border-radius:7px;overflow:hidden;`);
    options.forEach((o) => {
      const b = el('button', css(`font:600 24px ${T.sans};padding:9px 18px;border:0;cursor:pointer;min-height:44px;
        background:${o.value === value ? 'rgba(40,105,122,.16)' : 'transparent'};
        color:${o.value === value ? T.teal : T.dim};`), o.label);
      b.onclick = () => { value = o.value; onChange(o.value); Array.from(wrap.children).forEach((ch, i) => {
        const sel = options[i].value === value;
        ch.style.background = sel ? 'rgba(40,105,122,.16)' : 'transparent';
        ch.style.color = sel ? T.teal : T.dim;
      }); };
      wrap.append(b);
    });
    return wrap;
  }

  /* ── <py-code> : python with light syntax colouring ───────────────────── */
  const ESC = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const TOK = new RegExp([
    '(#[^\\n]*)',                                              // 1 comment
    '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')',              // 2 string
    '\\b(mlflow|log_params?|log_metrics?|set_tag|log_artifact|log_dict|log_text|start_run|log_quantum_provenance)\\b', // 3 tracking api
    '\\b(def|return|for|in|if|else|elif|import|from|as|with|while|not|and|or|None|True|False|class|try|except|lambda|await|async|is|break|continue|pass|raise|const|let|new)\\b' // 4 keyword
  ].join('|'), 'g');
  const COLOR = { 1: '#6f675e', 2: T.amber, 3: T.teal, 4: T.violet };
  function highlight(line) {
    let out = '', last = 0, m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(line)) !== null) {
      out += ESC(line.slice(last, m.index));
      const g = m[1] !== undefined ? 1 : m[2] !== undefined ? 2 : m[3] !== undefined ? 3 : 4;
      out += '<span style="color:' + COLOR[g] + '">' + ESC(m[g]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + ESC(line.slice(last));
  }
  class PyCode extends HTMLElement {
    static get observedAttributes() { return ['size', 'hl', 'hlgroups', 'file', 'note']; }
    attributeChangedCallback() {
      if (!this._done || !this.shadowRoot) return;
      this._raw = this._raw || this.textContent;
      this.shadowRoot.innerHTML = '';
      this._done = false;
      this._rerender = true;
      this.connectedCallback();
    }
    connectedCallback() {
      if (this._done) return;
      this._done = true;
      if (this._raw == null) this._raw = this.textContent || '';
      const raw = this._raw.replace(/^\n/, '').replace(/\s+$/, '');
      if (!raw) { this._done = false; requestAnimationFrame(() => this.connectedCallback()); return; }
      const file = this.getAttribute('file');
      const hl = (this.getAttribute('hl') || '').split(',').filter(Boolean).map(Number);
      /* hlgroups="#28697a=5-10;#8c5731=14,15" — per-line tint keyed by colour */
      const groups = {};
      (this.getAttribute('hlgroups') || '').split(';').filter(Boolean).forEach((g) => {
        const [col, spec] = g.split('=');
        (spec || '').split(',').filter(Boolean).forEach((part) => {
          const [a, b] = part.split('-').map(Number);
          for (let n = a; n <= (isNaN(b) ? a : b); n++) groups[n] = col.trim();
        });
      });
      const tint = (hex, alpha) => {
        const h = hex.replace('#', '');
        const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
      };
      const lines = raw.split('\n');
      const minIndent = Math.min.apply(null, lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
      const hostCss = css(`display:block;background:${T.panel};border:1px solid ${T.line};
        border-radius:10px;overflow:hidden;min-height:0;display:flex;flex-direction:column;`);
      let root;
      if (this._rerender && this.shadowRoot) { root = this.shadowRoot; root.innerHTML = ''; }
      else root = shadow(this, hostCss);
      if (file) {
        const head = el('div', css(`display:flex;justify-content:space-between;align-items:center;
          padding:9px 14px;border-bottom:1px solid ${T.line};background:${T.panel2};
          font:500 ${Math.round((+this.getAttribute('size') || 19) * 0.85)}px ${T.mono};color:#6b6359;`));
        head.append(el('span', '', file));
        if (this.getAttribute('note')) head.append(el('span', `color:${T.teal};`, this.getAttribute('note')));
        root.append(head);
      }
      const pre = el('pre', css(`margin:0;padding:12px 14px;overflow:auto;flex:1;min-height:0;
        font:400 ${this.getAttribute('size') || '19'}px/1.45 ${T.mono};color:#3f3a34;tab-size:4;`));
      lines.forEach((l, i) => {
        const gc = groups[i + 1];
        const row = el('div', gc
          ? `background:${tint(gc, 0.13)};box-shadow:inset 4px 0 0 ${gc};margin:0 -14px;padding:0 10px;`
          : hl.includes(i + 1)
            ? `background:rgba(40,105,122,.10);box-shadow:inset 3px 0 0 ${T.teal};margin:0 -14px;padding:0 11px;`
            : 'margin:0 -14px;padding:0 14px;');
        const html = highlight(l.slice(minIndent));
        row.innerHTML = html || '&nbsp;';
        pre.append(row);
      });
      root.append(pre);
      // `size` is a MAXIMUM: white-space:pre means a fixed size can always
      // outgrow the panel (deck-wide type changes, narrower columns), and the
      // overflow is silently cut. Shrink to whatever fits both axes.
      const maxSize = +this.getAttribute('size') || 19;
      const fit = () => {
        if (!pre.clientWidth || !pre.clientHeight) return;
        let fs = maxSize;
        pre.style.fontSize = fs + 'px';
        while (fs > 11 && (pre.scrollWidth > pre.clientWidth + 1 || pre.scrollHeight > pre.clientHeight + 1)) {
          fs -= 0.5;
          pre.style.fontSize = fs + 'px';
        }
      };
      requestAnimationFrame(fit);
      requestAnimationFrame(() => requestAnimationFrame(fit));
      setTimeout(fit, 150);
      setTimeout(fit, 450);
      if (window.ResizeObserver) {
        let t = null;
        new ResizeObserver(() => { clearTimeout(t); t = setTimeout(fit, 40); }).observe(pre);
      }
    }
  }
  if (!customElements.get('py-code')) customElements.define('py-code', PyCode);

  /* ── <mg-lab> : the task ──────────────────────────────────────────────── */
  class MGLab extends HTMLElement {
    connectedCallback() {
      if (this._d) return; this._d = true;
      const root = shadow(this, 'display:flex;flex-direction:column;gap:20px;height:100%;min-height:0');
      const left = el('div', `${S.card}padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0;flex:1;min-height:0;overflow:hidden;`);
      const cv = el('canvas');
      const cap1 = el('div', S.label, 'Mackey-Glass series \u2014 train / validation / rolling test');
      left.append(cap1, cv);
      const params = el('div', `${S.card}padding:16px 18px;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:0 22px;align-items:start;flex:none;`);
      const knobs = el('div', 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 24px;');
      root.append(left, params);

      const st = { tau: 17, seed: 42, T: 600, h: 12 };
      const out = el('div', css(`grid-column:2;grid-row:1 / span 2;font:400 24px/1.5 ${T.mono};color:${T.dim};border-left:1px solid ${T.line};padding-left:20px;`));
      const draw = () => {
        const y = QRC.mackeyGlass({ n: st.T, tau: st.tau, seed: st.seed });
        const trainEnd = Math.floor(0.6 * y.length), valStart = Math.floor(0.8 * trainEnd);
        const uHi = QRC.quantile(y.slice(0, valStart), 0.995);
        const w = left.clientWidth - 32;
        const avail = Math.max(220, left.clientHeight - (cap1.offsetHeight + 10 + 32));
        linePlot(cv, w, avail, {
          bands: [
            { from: 0, to: 100, color: 'rgba(123,115,106,.10)', label: 'washout' },
            { from: 100, to: valStart, color: 'rgba(40,105,122,.09)', label: 'fit' },
            { from: valStart, to: trainEnd, color: 'rgba(113,87,139,.13)', label: 'validation' },
            { from: trainEnd, to: y.length, color: 'rgba(140,87,49,.12)', label: 'rolling test' }
          ],
          series: [{ data: y, color: T.text, width: 1.4 }], xLabel: 'time step t'
        });
        out.textContent = '';
        [['T', y.length], ['q\u2080.\u2089\u2089\u2085 (train only)', uHi.toFixed(4)],
         ['fit', '[100, ' + valStart + ')'], ['val', '[' + valStart + ', ' + trainEnd + ')'],
         ['test', '[' + trainEnd + ', ' + y.length + ')'], ['target', 'y[t + ' + st.h + ']']]
          .forEach(([k, v]) => {
            const r = el('div', 'display:grid;grid-template-columns:1fr auto;gap:4px 14px;align-items:baseline;');
            r.append(el('span', 'line-height:1.35;', k),
              el('span', `color:${T.text};white-space:nowrap;`, String(v)));
            out.append(r);
          });
      };
      const head = el('div', css(S.label + 'grid-column:1;grid-row:1;margin-bottom:12px;'), 'dataset parameters');
      knobs.style.gridColumn = '1';
      knobs.style.gridRow = '2';
      knobs.append(
        slider('delay \u03c4', { min: 8, max: 30, step: 1, value: 17 }, (v) => { st.tau = v; draw(); }),
        slider('series length T', { min: 300, max: 900, step: 50, value: 600 }, (v) => { st.T = v; draw(); }),
        slider('seed', { min: 1, max: 99, step: 1, value: 42 }, (v) => { st.seed = v; draw(); }),
        slider('horizon h', { min: 1, max: 24, step: 1, value: 12 }, (v) => { st.h = v; draw(); })
      );
      params.append(head, knobs, out);
      requestAnimationFrame(draw);
      // the card's height only settles after the params block claims its
      // row, so redraw once layout has landed (and again on real resizes)
      requestAnimationFrame(() => requestAnimationFrame(draw));
      setTimeout(draw, 120);
      setTimeout(draw, 400);
      if (window.ResizeObserver) {
        let t = null;
        const ro = new ResizeObserver(() => {
          clearTimeout(t);
          t = setTimeout(draw, 40);
        });
        ro.observe(left);
        ro.observe(params);
      }
    }
  }
  if (!customElements.get('mg-lab')) customElements.define('mg-lab', MGLab);

  /* ── <dqrc-lab> : the reservoir ───────────────────────────────────────── */
  class DQRCLab extends HTMLElement {
    connectedCallback() {
      if (this._d) return; this._d = true;
      const root = shadow(this, 'display:grid;grid-template-columns:1fr 360px;gap:20px;height:100%;min-height:0');
      const left = el('div', `${S.card}padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0;overflow:hidden;`);
      const hm = el('canvas'), tr = el('canvas');
      const cap = el('div', S.label + 'font-size:26px;', 'reservoir observables  \u27e8Z\u1d62\u27e9 \u27e8X\u1d62\u27e9 \u27e8Y\u1d62\u27e9 \u27e8Z\u1d62Z\u2c7c\u27e9  over time');
      const cap2 = el('div', S.label + 'font-size:26px;', 'echo-state property \u2014 two different initial states, same input');
      left.append(cap, hm, cap2, tr);
      const right = el('div', `${S.card}padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto;`);
      root.append(left, right);

      const st = { nq: 4, gamma: 0.25, tau: 0.3, xyz: true };
      const info = el('div', css(`font:400 25px/1.6 ${T.mono};color:${T.dim};border-top:1px solid ${T.line};padding-top:12px;`));
      const draw = () => {
        const y = QRC.mackeyGlass({ n: 320, tau: 17, seed: 42 });
        const uHi = QRC.quantile(y, 0.995);
        const u = y.map((v) => Math.min(1, Math.max(0, v / uHi)) * 0.5);
        const r = QRC.dissipativeQRC(u, { nQubits: st.nq, gammas: [st.gamma], tau: st.tau, includeXYZ: st.xyz, seed: 42 });
        const emb = r.emb[0];
        const mat = r.labels.map((_, f) => emb.map((row) => row[f]));
        const w = left.clientWidth - 32;
        // measure the captions instead of assuming their height: S.label size
        // changes with the deck-wide type scale
        const chrome = cap.offsetHeight + cap2.offsetHeight + 30 + 40;
        const avail = Math.max(240, left.clientHeight - chrome);
        heatmap(hm, w, Math.round(avail * 0.66), mat, { rowLabels: r.labels });

        // echo-state: perturbed initial state, same drive
        const d = 1 << st.nq;
        const R = new Float64Array(d * d), I = new Float64Array(d * d);
        R[(d - 1) * d + (d - 1)] = 1; // start in |1..1> instead of |0..0>
        const r2 = QRC.dissipativeQRC(u, {
          nQubits: st.nq, gammas: [st.gamma], tau: st.tau, includeXYZ: st.xyz, seed: 42,
          rho0: [{ R, I }]
        });
        const dist = emb.map((row, t) => {
          let s = 0;
          for (let f = 0; f < row.length; f++) s += (row[f] - r2.emb[0][t][f]) ** 2;
          return Math.sqrt(s);
        });
        // log scale: exponential forgetting is a straight line, gamma = 0 is flat
        const FLOOR = 1e-14;
        linePlot(tr, w, Math.round(avail * 0.34), {
          series: [{ data: dist.map((v) => Math.log10(Math.max(v, FLOOR))), color: st.gamma === 0 ? T.amber : T.teal, width: 2 }],
          yMin: -15, yMax: 1, pad: { l: 128, r: 12, t: 14, b: 40 },
          yTickFmt: (v) => '10' + String(Math.round(v)).replace('-', '\u207b').replace(/[0-9]/g, (ch) => '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'[+ch]),
          yLabel: '\u2016\u0394\u2016  (log)', xLabel: 'time step t',
          hlines: [{ y: -6, label: 'forgotten', color: '#8c5731' }]
        });
        info.textContent = '';
        const nf = r.labels.length;
        [['qubits', st.nq + '  (dim ' + d + ')'], ['observables', nf],
         ['\u2016\u0394\u2016 at t=100', dist[100].toExponential(1)]]
          .forEach(([k, v]) => {
            const row = el('div', 'display:grid;grid-template-columns:1fr auto;gap:4px 14px;align-items:baseline;');
            row.append(el('span', 'line-height:1.35;', k),
              el('span', `color:${T.text};white-space:nowrap;`, String(v)));
            info.append(row);
          });
      };
      const GAMMAS = [0, 0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.45, 0.6];
      const gs = slider('memory decay \u03b3', { values: GAMMAS, value: 0.25, format: (v) => v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') },
        (v) => { st.gamma = v; draw(); });
      right.append(
        el('div', S.label + 'font-size:26px;', 'reservoir hyperparameters'),
        gs,
        slider('evolution time \u03c4', { min: 0.1, max: 2.0, step: 0.1, value: 0.3 }, (v) => { st.tau = v; draw(); }),
        slider('qubits n', { min: 2, max: 5, step: 1, value: 4 }, (v) => { st.nq = v; draw(); }),
        segmented([{ label: '\u27e8Z\u27e9 + \u27e8ZZ\u27e9', value: false }, { label: '+ \u27e8X\u27e9 \u27e8Y\u27e9', value: true }], true, (v) => { st.xyz = v; draw(); }),
        info,
        (() => {
          const b = el('button', S.btnWarn, 'Set \u03b3 = 0  (unitary, no forgetting)');
          b.onclick = () => { st.gamma = 0; gs.set(0); draw(); };
          return b;
        })()
      );
      [...right.children].forEach((k) => { k.style.flex = '0 0 auto'; });
      requestAnimationFrame(draw);
    }
  }
  if (!customElements.get('dqrc-lab')) customElements.define('dqrc-lab', DQRCLab);

  /* ── shared: tracking panel ───────────────────────────────────────────── */
  function runRow(rec, opts) {
    const o = opts || {};
    const r2 = tracking.lastMetric(rec, 'DQRC_r2');
    const esn = tracking.lastMetric(rec, 'ESN_r2');
    const bad = rec.tags.provenance_self_consistent === 'false' || rec.status === 'FAILED';
    const row = el('div', css(`display:grid;grid-template-columns:20px 1fr 92px 92px 84px;gap:10px;align-items:center;
      padding:9px 12px;border-radius:6px;cursor:pointer;border:1px solid ${o.selected ? T.teal : 'transparent'};
      background:${o.selected ? 'rgba(40,105,122,.08)' : 'transparent'};`));
      row.append(
      el('div', `width:9px;height:9px;border-radius:50%;background:${bad ? T.amber : T.teal};`),
      el('div', css(`font:500 16px ${T.mono};color:${T.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`), rec.name),
      el('div', css(`font:400 15px ${T.mono};color:${T.dim};text-align:right;`), 'γ=' + (rec.params['readout/selected_gamma'] || '—')),
      el('div', css(`font:600 16px ${T.mono};color:${T.violet};text-align:right;`), fmt(esn)),
      el('div', css(`font:600 16px ${T.mono};color:${r2 !== null && esn !== null && r2 > esn ? T.teal : T.amber};text-align:right;`), fmt(r2))
    );
    return row;
  }

  class MLPanel extends HTMLElement {
    connectedCallback() {
      if (this._d) return; this._d = true;
      const compact = this.hasAttribute('compact');
      const latest = this.hasAttribute('latest');
      const root = shadow(this, css(`display:flex;flex-direction:column;background:${T.panel};
        border:1px solid ${T.line};border-radius:10px;overflow:hidden;height:100%;min-height:0;`));
      const head = el('div', css(`display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:10px 14px;border-bottom:1px solid ${T.line};background:${T.panel2};`));
      const title = el('div', css(`font:600 19px ${T.mono};color:${T.text};`), 'experiment: mackey_glass_dqrc');
      const badge = el('div', css(`font:600 16px ${T.mono};padding:4px 9px;border-radius:5px;`));
      const conn = el('button', css(`font:600 17px ${T.sans};padding:6px 12px;border-radius:6px;
        border:1px solid ${T.line};background:transparent;color:${T.dim};cursor:pointer;`), 'connect MLflow');
      conn.onclick = async () => {
        conn.textContent = 'probing…';
        const ok = await tracking.connect('');
        conn.textContent = ok ? 'connected' : 'no server \u2014 local store';
        setTimeout(() => { conn.textContent = 'connect MLflow'; }, 2600);
      };
      const headRight = el('div', 'display:flex;gap:8px;align-items:center;');
      headRight.append(badge, conn);
      head.append(title, headRight);

      const cols = el('div', css(`display:grid;grid-template-columns:20px 1fr 92px 92px 84px;gap:10px;
        padding:8px 12px;border-bottom:1px solid ${T.line};${S.label}font-size:14.5px;`));
      ['', 'run', '\u03b3', 'ESN R\u00b2', 'DQRC R\u00b2'].forEach((h, i) =>
        cols.append(el('div', i > 1 ? 'text-align:right;' : '', h)));
      const list = el('div', 'overflow:auto;flex:1;min-height:0;padding:6px;');
      const detail = el('div', css(`border-top:1px solid ${T.line};padding:14px 16px;overflow:auto;
        max-height:${compact ? '0' : (latest ? 'none' : '560px')};display:${compact ? 'none' : 'block'};
        ${latest ? 'flex:1;min-height:0;border-top:none;' : ''}`));
      if (latest) root.append(head, detail); else root.append(head, cols, list, detail);

      let selected = null;
      const render = () => {
        badge.textContent = tracking.state.backend === 'server' ? 'MLflow REST \u00b7 live' : 'local store';
        badge.style.background = tracking.state.backend === 'server' ? 'rgba(40,105,122,.16)' : 'rgba(123,115,106,.12)';
        badge.style.color = tracking.state.backend === 'server' ? T.teal : T.dim;
        const runs = tracking.runs().slice().reverse();
        if (latest) { renderDetail(runs[0] || null); return; }
        list.textContent = '';
        if (!runs.length) list.append(el('div', css(`font:400 16px ${T.mono};color:#6b6359;padding:14px;`), 'no runs yet'));
        runs.forEach((rec) => {
          const row = runRow(rec, { selected: selected === rec.run_id });
          row.onclick = () => { selected = rec.run_id; render(); };
          list.append(row);
        });
        if (compact) return;
        renderDetail(selected ? tracking.byId(selected) : runs[0]);
      };
      const renderDetail = (rec) => {
        detail.textContent = '';
        if (!rec) {
          detail.append(el('div', css(`font:400 22px ${T.mono};color:#6b6359;padding:16px 2px;`),
            'no runs yet \u2014 press Run experiment'));
          return;
        }
        const grid = el('div', 'display:grid;grid-template-columns:1fr;gap:18px;');
        const kv = (obj, heading, color) => {
          const box = el('div');
          box.append(el('div', `${S.label}margin-bottom:6px;`, heading));
          Object.keys(obj).sort().forEach((k) => {
            const r = el('div', 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 14px;padding:3px 0;');
            r.append(el('div', css(`font:400 22px ${T.mono};color:#6b6359;word-break:break-all;`), k),
              el('div', css(`font:500 22px ${T.mono};color:${color};text-align:right;word-break:break-all;`),
                typeof obj[k] === 'number' ? fmt(obj[k], 4) : String(obj[k]).slice(0, 46)));
            box.append(r);
          });
          return box;
        };
        const metrics = {};
        Object.keys(rec.metrics).forEach((k) => { metrics[k] = tracking.lastMetric(rec, k); });
        grid.append(kv(rec.params, 'parameters (' + Object.keys(rec.params).length + ')', T.text));
        const rcol = el('div', 'display:flex;flex-direction:column;gap:16px;');
        rcol.append(kv(metrics, 'metrics (' + Object.keys(metrics).length + ')', T.teal));
        rcol.append(kv(rec.tags, 'tags', T.violet));
        const arts = el('div');
        arts.append(el('div', `${S.label}margin-bottom:6px;`, 'artifacts'));
        rec.artifacts.forEach((a) => arts.append(el('div', css(`font:400 22px ${T.mono};color:${T.dim};word-break:break-all;`), '\u2b13 ' + a.path + '  (' + a.bytes + ' B)')));
        rcol.append(arts);
        grid.append(rcol);
        detail.append(grid);
      };
      this._render = render;
      tracking.onChange(render);
      if (latest) {
        let sig = '';
        setInterval(() => {
          const rs = tracking.runs();
          const last = rs[rs.length - 1];
          const s = rs.length + '|' + (last ? last.run_id + last.status + Object.keys(last.params).length + '|' + Object.keys(last.metrics).length + '|' + last.artifacts.length : '');
          if (s !== sig) { sig = s; render(); }
        }, 400);
      }
      render();
    }
  }
  if (!customElements.get('mlflow-panel')) customElements.define('mlflow-panel', MLPanel);

  /* ── <pipeline-run> : run the whole thing ─────────────────────────────── */
  const STAGES = [
    ['data', 'Mackey-Glass'], ['encode', 'angle encoding'], ['reservoir', 'DQRC evolution'],
    ['baseline', 'classical ESN'], ['select', '\u03b3 / \u03b1 selection'], ['evaluate', 'rolling test']
  ];
  class PipelineRun extends HTMLElement {
    connectedCallback() {
      if (this._d) return; this._d = true;
      const root = shadow(this, 'display:grid;grid-template-columns:318px 1fr 492px;gap:18px;height:100%;min-height:0');

      /* ── stage list ── */
      const steps = el('div', `${S.card}padding:20px 22px;display:flex;flex-direction:column;gap:14px;min-height:0;overflow:auto;`);
      steps.append(el('div', S.label, 'pipeline stages'));
      const rows = {};
      STAGES.forEach(([k, lbl], i) => {
        const r = el('div', 'display:grid;grid-template-columns:34px 1fr;gap:6px 12px;align-items:baseline;padding:8px 10px;margin:0 -10px;border-radius:8px;cursor:pointer;');
        const num = el('div', css(`font:600 23px ${T.mono};color:#a99f93;`), String(i + 1) + '.');
        const name = el('div', css(`font:600 25px/1.25 ${T.sans};color:#8b8378;`), lbl);
        const det = el('div', css(`grid-column:2;font:400 19px/1.35 ${T.mono};color:#a99f93;min-height:26px;`), '');
        r.append(num, name, det);
        rows[k] = { row: r, num, name, det };
        r.onclick = () => showStage(k);
        steps.append(r);
      });
      const mark = (k, state, detail) => {
        const r = rows[k]; if (!r) return;
        if (detail !== undefined) r.det.textContent = detail;
        if (state === 'active') {
          r.num.textContent = '\u2192'; r.num.style.color = T.amber;
          r.name.style.color = T.amber; r.det.style.color = T.dim;
        } else if (state === 'done') {
          r.num.textContent = '\u2713'; r.num.style.color = '#3f7d4e';
          r.name.style.color = '#3f7d4e'; r.det.style.color = T.dim;
        } else {
          r.num.textContent = String(STAGES.findIndex(([s]) => s === k) + 1) + '.';
          r.num.style.color = '#a99f93'; r.name.style.color = '#8b8378';
          r.det.textContent = ''; r.det.style.color = '#a99f93';
        }
      };

      /* ── centre: controls + figure ── */
      const mid = el('div', 'display:flex;flex-direction:column;gap:14px;min-width:0;min-height:0;');
      const bar = el('div', 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;');
      const plotCard = el('div', `${S.card}padding:16px;flex:1;display:flex;flex-direction:column;gap:8px;min-height:0;`);
      const cap = el('div', S.label, 'press run');
      const cv = el('canvas');
      plotCard.append(cap, cv);
      mid.append(bar, plotCard);
      const right = el('mlflow-panel');
      right.setAttribute('latest', '');
      tracking.onChange(() => { if (right._render) right._render(); });
      root.append(steps, mid, right);

      const run = el('button', S.btnPrimary + 'white-space:nowrap;', 'Run experiment');
      const wipe = el('button', S.btn + 'white-space:nowrap;', 'Clear log');
      wipe.onclick = () => tracking.reset();
      const status = el('div', 'display:none;');
      bar.append(run, wipe);

      /* ── the middle panel: one real view per stage ── */
      let shown = { stage: null, res: null }, lastRes = null;
      // every stage view is replayable: click a step to go back to it
      const showStage = (s) => {
        if (!lastRes) return;
        shown = { stage: s, res: lastRes };
        const v = VIEW[s] || ['', ''];
        cap.textContent = v[0];
        Object.keys(rows).forEach((k) => { rows[k].row.style.background = k === s ? 'rgba(40,105,122,.09)' : 'transparent'; });
        drawFig();
      };

      const gridPlot = (canvas, wpx, hpx, grid, best) => {
        const c = ctxOf(canvas, wpx, hpx);
        const gammas = [], alphas = [];
        grid.forEach((g) => {
          if (gammas.indexOf(String(g.key)) < 0) gammas.push(String(g.key));
          if (alphas.indexOf(g.alpha) < 0) alphas.push(g.alpha);
        });
        const pad = { l: 92, r: 16, t: 16, b: 52 };
        const iw = wpx - pad.l - pad.r, ih = hpx - pad.t - pad.b;
        const cw = iw / alphas.length, ch = ih / gammas.length;
        let lo = Infinity, hi = -Infinity;
        grid.forEach((g) => { if (g.r2 < lo) lo = g.r2; if (g.r2 > hi) hi = g.r2; });
        grid.forEach((g) => {
          const gi = gammas.indexOf(String(g.key)), ai = alphas.indexOf(g.alpha);
          const v = (g.r2 - lo) / ((hi - lo) || 1);
          c.fillStyle = 'rgba(40,105,122,' + (0.06 + 0.9 * v) + ')';
          c.fillRect(pad.l + ai * cw, pad.t + gi * ch, cw - 2, ch - 2);
          c.fillStyle = v > 0.55 ? '#ffffff' : '#55504a';
          c.font = '17px ' + T.mono; c.textAlign = 'center';
          c.fillText(g.r2.toFixed(3), pad.l + ai * cw + cw / 2, pad.t + gi * ch + ch / 2 + 6);
          if (String(best.key) === String(g.key) && best.alpha === g.alpha) {
            c.strokeStyle = T.amber; c.lineWidth = 3;
            c.strokeRect(pad.l + ai * cw + 1, pad.t + gi * ch + 1, cw - 4, ch - 4);
          }
        });
        c.textAlign = 'right'; c.fillStyle = '#6b6359'; c.font = '19px ' + T.mono;
        gammas.forEach((g, i) => c.fillText('\u03b3 ' + g, pad.l - 10, pad.t + i * ch + ch / 2 + 6));
        c.textAlign = 'center';
        alphas.forEach((al, i) => c.fillText('\u03b1 ' + al, pad.l + i * cw + cw / 2, pad.t + ih + 24));
        c.fillStyle = '#6b6359'; c.fillText('validation R\u00b2 per (\u03b3, \u03b1) \u2014 amber box is the choice', pad.l + iw / 2, hpx - 8);
        c.textAlign = 'left';
      };

      const drawFig = () => {
        const wpx = Math.max(200, plotCard.clientWidth - 32);
        const hpx = Math.max(200, plotCard.clientHeight - cap.offsetHeight - 34);
        const res = shown.res, s = shown.stage;
        if (!res || !s) { ctxOf(cv, wpx, hpx); return; }
        const c = res.cfg;
        if (s === 'data') {
          linePlot(cv, wpx, hpx, {
            series: [{ data: Array.from(res.y), color: T.text, width: 1.6 }],
            bands: [
              { from: 0, to: res.ev.valStart, color: 'rgba(40,105,122,.09)', label: 'fit' },
              { from: res.ev.valStart, to: res.ev.trainEnd, color: 'rgba(113,87,139,.13)', label: 'validation' },
              { from: res.ev.trainEnd, to: res.y.length, color: 'rgba(140,87,49,.12)', label: 'rolling test' }
            ],
            pad: { l: 84, r: 14, t: 14, b: 36 }, yLabel: 'x(t)', xLabel: 'time step t'
          });
        } else if (s === 'encode') {
          linePlot(cv, wpx, hpx, {
            series: [
              { data: Array.from(res.y).map((v) => v / Math.max.apply(null, Array.from(res.y))), color: T.text, width: 1.3, alpha: .35 },
              { data: Array.from(res.u), color: T.teal, width: 1.8 }
            ],
            pad: { l: 84, r: 14, t: 14, b: 36 }, yMin: 0, yMax: 1,
            yLabel: 'u(t)', xLabel: 'time step t \u2014 faint: raw series, teal: encoded angle'
          });
        } else if (s === 'reservoir') {
          const gi = Math.max(0, c.gammas.indexOf(res.sel && res.sel.best ? res.sel.best.key : c.gammas[0]));
          const emb = res.embAll[gi] || res.embAll[0];
          const labels = res.labels && res.labels.length ? res.labels : emb[0].map((_, i) => 'f' + i);
          const rows = labels.map((_, f) => Array.from(emb).slice(0, 260).map((r) => r[f]));
          heatmap(cv, wpx, hpx, rows, { rowLabels: labels, pad: { l: 124, r: 12, t: 8, b: 30 } });
        } else if (s === 'baseline') {
          const esn = QRC.esnStates(res.u, { nUnits: c.esnUnits, leak: c.esnLeak, sr: c.esnSR, seed: c.resSeed });
          // esn rows are Float64Arrays: .map on one would coerce back to numbers
          const cols = Array.from(esn).slice(0, 260);
          const rows = Array.from({ length: esn[0].length }, (_, f) => cols.map((r) => r[f]));
          heatmap(cv, wpx, hpx, rows, { rowLabels: rows.map((_, i) => 'h' + i), pad: { l: 96, r: 12, t: 8, b: 30 } });
        } else if (s === 'select') {
          gridPlot(cv, wpx, hpx, res.sel.grid, res.sel.best);
        } else {
          linePlot(cv, wpx, hpx, {
            series: [
              { data: res.qrcRes.target, x: res.qrcRes.idx, color: T.text, width: 2 },
              { data: res.qrcRes.pred, x: res.qrcRes.idx, color: T.teal, width: 1.8 },
              { data: res.esnRes.pred, x: res.esnRes.idx, color: T.violet, width: 1.5, alpha: .8, dash: [4, 3] }
            ],
            fitX: true, pad: { l: 84, r: 14, t: 14, b: 36 }, yLabel: 'y[t+h]',
            xLabel: 'time step t \u2014 test period, refit every ' + c.retrainEvery + ' steps'
          });
        }
      };

      const VIEW = {
        data: ['Mackey-Glass series \u2014 and where it is cut',
          'A delay differential equation integrated with RK4. The split is fixed before anything is fitted: the readout only ever sees the fit slice, \u03b3 and \u03b1 are chosen on validation, and the test period is walked forward.'],
        encode: ['input scaling \u2192 rotation angle u(t)',
          'The series is divided by the 99.5th percentile of the TRAIN slice only, clipped to [0,1] and halved. u(t) is the angle of the input rotation on every qubit \u2014 one circuit per time step.'],
        reservoir: ['reservoir observables over time \u2014 the feature matrix',
          'Each column is one time step: evolve exp(-iH(u_t)\u03c4), damp a fraction \u03b3 back towards |0\u2026 0\u27e9, then read \u27e8Z\u1d62\u27e9, \u27e8X\u1d62\u27e9, \u27e8Y\u1d62\u27e9, \u27e8Z\u1d62Z\u2c7c\u27e9. This matrix is the only thing the readout ever sees.'],
        baseline: ['classical ESN states \u2014 the honest comparison',
          'A leaky echo state network with the same feature count, driven by the same input. Without it an R\u00b2 from the quantum reservoir means nothing.'],
        select: ['validation sweep over \u03b3 and \u03b1',
          'Every cell is a readout fitted on the fit slice and scored on validation. The amber cell is what the run adopts \u2014 and the whole grid is logged, not just the winner.'],
        evaluate: ['rolling-origin test \u2014 truth, QRC, ESN',
          'The origin walks forward; the readout is refitted periodically on data that was already observable, the reservoir never. Metrics are computed on the test period only.']
      };

      const HOLD = 3200;
      const hold = (ms) => new Promise((r) => setTimeout(r, ms === undefined ? HOLD : ms));

      run.onclick = async () => {
        run.disabled = true; run.style.opacity = .5;
        STAGES.forEach(([k]) => mark(k, 'idle'));
        shown = { stage: null, res: null }; cap.textContent = 'press run'; drawFig();
        // the computation itself takes under a second; the stages are then
        // replayed at reading speed, each with the artefact it produced
        const seen = [];
        status.textContent = 'running\u2026';
        const res = await pipeline.runExperiment({ runName: 'dqrc_' + (tracking.runs().length + 1) }, {
          onStage: (s, msg) => { if (!seen.length || seen[seen.length - 1][0] !== s) seen.push([s, msg]); }
        });
        const qrc = res.results.find((r) => r.model.indexOf('QRC') > -1) || res.results[res.results.length - 1];
        const esn = res.results.find((r) => r.model.indexOf('ESN') > -1);
        const DET = {
          data: 'T = ' + res.cfg.T + ' \u00b7 \u03c4 = ' + res.cfg.mgTau + ' \u00b7 h = ' + res.cfg.horizon,
          encode: 'u \u2208 [0, 0.5], scaled on the pre-validation slice',
          reservoir: res.cfg.nQubits + ' qubits \u2192 ' + res.nFeat + ' observables' + (res.cacheHit ? ' \u00b7 cache hit' : ''),
          baseline: 'ESN ' + res.cfg.esnUnits + ' units + input skip',
          select: '\u03b3 = ' + res.sel.best.key + ' \u00b7 \u03b1 = ' + res.sel.best.alpha + ' \u00b7 val R\u00b2 ' + fmt(res.sel.best.r2),
          evaluate: 'R\u00b2 ' + fmt(qrc.r2) + (esn ? '  vs ESN ' + fmt(esn.r2) : '')
        };
        for (let i = 0; i < seen.length; i++) {
          const [s, msg] = seen[i];
          if (i) mark(seen[i - 1][0], 'done', DET[seen[i - 1][0]]);
          status.textContent = msg;
          mark(s, 'active', msg);
          lastRes = res;
          showStage(s);
          await hold();
        }
        if (seen.length) {
          const last = seen[seen.length - 1][0];
          mark(last, 'done', DET[last]);
        }
        Object.keys(DET).forEach((k) => mark(k, 'done', DET[k]));
        status.textContent = 'finished \u2014 click a step to revisit it';
        run.disabled = false; run.style.opacity = 1;
      };

      requestAnimationFrame(drawFig);
      if (window.ResizeObserver) new ResizeObserver(() => drawFig()).observe(this);
    }
  }
  if (!customElements.get('pipeline-run')) customElements.define('pipeline-run', PipelineRun);

  /* ── <debug-lab> : the real bug, found in the logs ────────────────────── */
  class DebugLab extends HTMLElement {
    connectedCallback() {
      if (this._d) return; this._d = true;
      const root = shadow(this, 'display:grid;grid-template-columns:1fr 1fr;gap:20px;height:100%;min-height:0');
      const left = el('div', 'display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;');
      const right = el('div', 'display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;');
      root.append(left, right);

      const bar = el('div', 'display:flex;gap:10px;flex-wrap:wrap;');
      const nw = 'white-space:nowrap;font-size:24px;padding:14px 20px;';
      const b1 = el('button', S.btnWarn + nw, '1 \u00b7 Run the experiment');
      const b2 = el('button', S.btn + nw, '2 \u00b7 Diff against the good run');
      const b3 = el('button', S.btnPrimary + nw, '3 \u00b7 Apply the fix and rerun');
      const reset = el('button', S.btn + nw, 'Start again');
      bar.append(b1, b2, b3, reset);
      const verdict = el('div', css(`${S.card}padding:16px 18px;font:500 24px/1.5 ${T.sans};color:${T.dim};`), '');
      const cv = el('canvas');
      const plotCard = el('div', `${S.card}padding:16px;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;`);
      plotCard.append(el('div', S.label, 'test period \u2014 DQRC vs classical ESN'), cv);
      left.append(bar, verdict, plotCard);

      const cmp = el('div', css(`${S.card}padding:0;overflow:auto;flex:1;min-height:0;`));
      const showHint = () => {
        cmp.textContent = '';
        cmp.append(el('div', css(`padding:22px 20px;font:400 24px/1.5 ${T.sans};color:${T.dim};`),
          'Press 2 to compare what the run claims against what it actually consumed.'));
      };
      showHint();
      right.append(cmp);

      let bad = null, good = null;

      reset.onclick = () => {
        tracking.reset();
        QRC.EmbeddingCache.clear();
        bad = null; good = null;
        verdict.textContent = '';
        showHint();
        const ctx = cv.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
        [b1, b2, b3].forEach((b) => { b.disabled = false; b.style.opacity = 1; });
      };

      /* one true side-by-side: two labelled columns, differing rows highlighted */
      const sideBySide = (title, colA, colB, rows, footer) => {
        cmp.textContent = '';
        cmp.append(el('div', css(`padding:18px 20px;border-bottom:1px solid ${T.line};background:${T.panel2};
          font:600 26px ${T.sans};color:${T.text};`), title));
        const grid = 'display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:16px;padding:14px 20px;';
        const head = el('div', css(grid + `border-bottom:1px solid ${T.line};`));
        head.append(el('div', ''),
          el('div', css(`font:600 24px ${T.mono};color:${T.amber};`), colA),
          el('div', css(`font:600 24px ${T.mono};color:${T.teal};`), colB));
        cmp.append(head);
        rows.forEach(([k, a, b]) => {
          const f = (v) => {
            if (v === undefined || v === null || v === '') return '\u2014';
            if (typeof v === 'number') return Number.isInteger(v) ? String(v) : fmt(v);
            return String(v);
          };
          const differs = f(a) !== f(b);
          const fs = (t) => (String(t).length > 26 ? 16 : 22);
          const row = el('div', css(grid + `border-bottom:1px solid ${T.line};` +
            (differs ? 'background:rgba(140,87,49,.07);' : '')));
          row.append(el('div', css(`font:400 ${fs(k)}px ${T.mono};color:#6b6359;word-break:break-word;`), k),
            el('div', css(`font:${differs ? 600 : 400} ${fs(f(a))}px ${T.mono};color:${differs ? T.amber : T.dim};word-break:break-word;`), f(a)),
            el('div', css(`font:${differs ? 600 : 400} ${fs(f(b))}px ${T.mono};color:${differs ? T.teal : T.dim};word-break:break-word;`), f(b)));
          cmp.append(row);
        });
        if (footer) cmp.append(el('div', css(`padding:16px 20px;font:400 23px/1.55 ${T.mono};color:${T.amber};`), footer));
      };

      const plot = (res) => {
        const w = plotCard.clientWidth - 32;
        const h = Math.max(200, plotCard.clientHeight - 70);
        linePlot(cv, w, h, {
          series: [
            { data: res.qrcRes.target, x: res.qrcRes.idx, color: T.text, width: 2 },
            { data: res.qrcRes.pred, x: res.qrcRes.idx, color: res.consistent ? T.teal : T.amber, width: 1.8 },
            { data: res.esnRes.pred, x: res.esnRes.idx, color: T.violet, width: 1.4, alpha: .8, dash: [4, 3] }
          ], fitX: true, xLabel: 'actual \u00b7 DQRC \u00b7 ESN (dashed)'
        });
      };

      b1.onclick = async () => {
        b1.disabled = true; b1.style.opacity = .5;
        QRC.EmbeddingCache.clear();
        const key = pipeline.poisonCache({});
        verdict.textContent = 'Running\u2026 cache holds ' + key;
        const res = await pipeline.runExperiment({
          runName: 'dqrc_live_demo', fixes: { cacheKeyIncludesParams: false }
        }, {});
        bad = res;
        plot(res);
        const dq = res.qrcRes.r2, de = res.esnRes.r2;
        verdict.innerHTML = '';
        verdict.append(
          el('div', `font:600 28px ${T.sans};color:${T.amber};`,
            'DQRC R\u00b2 = ' + fmt(dq) + '  \u2014  the classical ESN wins at ' + fmt(de) + '.')
        );
        b1.disabled = false; b1.style.opacity = 1;
      };

      b2.onclick = () => {
        if (!bad) { verdict.textContent = 'Run step 1 first.'; return; }
        const rec = bad.run;
        const art = rec.artifacts.find((a) => a.path.indexOf('cache_meta') > -1);
        const gen = art ? JSON.parse(art.preview).generated_by : {};
        sideBySide(
          'what the run claims  vs  what it actually consumed',
          'run params', 'cache_meta.json',
          [
            ['reservoir/n_qubits', rec.params['reservoir/n_qubits'], gen.n_qubits],
            ['reservoir/tau', rec.params['reservoir/tau'], gen.tau],
            ['reservoir/include_xyz', rec.params['reservoir/include_xyz'], String(gen.include_xyz)],
            ['n_features', rec.params['reservoir/n_features_expected'],
              tracking.lastMetric(rec, 'reservoir/n_features_actual')],
            ['dataset  (hashed by key)', rec.params['dataset'] || gen.dataset, gen.dataset],
            ['split  (hashed by key)', gen.split, gen.split]
          ]
        );
      };

      b3.onclick = async () => {
        b3.disabled = true; b3.style.opacity = .5;
        QRC.EmbeddingCache.clear();
        const res = await pipeline.runExperiment({
          runName: 'dqrc_fixed', fixes: { cacheKeyIncludesParams: true }
        }, {});
        good = res;
        plot(res);
        verdict.innerHTML = '';
        verdict.append(
          el('div', `font:600 28px ${T.sans};color:${T.teal};`,
            'DQRC R\u00b2 = ' + fmt(res.qrcRes.r2) + '  vs  ESN ' + fmt(res.esnRes.r2))
        );
        if (bad) {
          const keep = ['DQRC_r2',
            'reservoir/embedding_cache_keyed_on', 'reservoir/n_features_actual'];
          const d = tracking.diff(bad.run, res.run);
          const rows = keep.map((k) => d.find((r) => r.key === k)).filter(Boolean)
            .map((r) => [r.key, r.a, r.b]);
          rows.push(['provenance_self_consistent', bad.run.tags.provenance_self_consistent,
            res.run.tags.provenance_self_consistent]);
          sideBySide('the two runs, side by side in the log \u2014 permanently',
            'dqrc_live_demo', 'dqrc_fixed', rows);
        }
        b3.disabled = false; b3.style.opacity = 1;
      };
    }
  }
  if (!customElements.get('debug-lab')) customElements.define('debug-lab', DebugLab);

  /* ── <sweep-lab> : a tracked sweep, the payoff of logging ─────────────── */
  class SweepLab extends HTMLElement {
    connectedCallback() {
      if (this._d) return; this._d = true;
      const root = shadow(this, 'display:grid;grid-template-columns:1fr 1fr;gap:20px;height:100%;min-height:0');
      const left = el('div', 'display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;');
      const right = el('div', 'display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;');
      root.append(left, right);
      const bar = el('div', 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;');
      const go = el('button', S.btnPrimary, 'Sweep \u03c4 \u00d7 \u03b3 (9 runs)');
      const st = el('div', css(`font:400 15px ${T.mono};color:${T.dim};`), '');
      const clear = el('button', S.btn, 'Clear log');
      clear.onclick = () => tracking.reset();
      bar.append(go, st, clear);
      const cv = el('canvas');
      const card = el('div', `${S.card}padding:16px;display:flex;flex-direction:column;gap:8px;`);
      card.append(el('div', S.label, 'validation R\u00b2 across the sweep \u2014 every point is a logged run'), cv);
      left.append(bar, card);
      const list = el('div', `${S.card}overflow:auto;flex:1;min-height:0;`);
      left.append(list);
      const panel = el('mlflow-panel');
      right.append(panel);

      go.onclick = async () => {
        go.disabled = true; go.style.opacity = .5;
        const taus = [0.3, 0.6, 1.2], gammas = [[0.05], [0.25], [0.5]];
        const pts = [];
        for (const t of taus)
          for (const g of gammas) {
            st.textContent = '\u03c4=' + t + ', \u03b3=' + g[0] + ' \u2026';
            QRC.EmbeddingCache.clear();
            const res = await pipeline.runExperiment({
              runName: 'sweep_t' + t + '_g' + g[0], tau: t, gammas: g,
              fixes: { cacheKeyIncludesParams: true }
            }, {});
            pts.push({ tau: t, gamma: g[0], r2: res.qrcRes.r2, val: res.sel.best.r2, esn: res.esnRes.r2 });
            drawSweep(pts);
          }
        st.textContent = 'done \u2014 9 runs logged';
        go.disabled = false; go.style.opacity = 1;
      };

      function drawSweep(pts) {
        const w = card.clientWidth - 32, h = 260;
        const c = ctxOf(cv, w, h);
        const p = { l: 56, r: 14, t: 14, b: 34 };
        const iw = w - p.l - p.r, ih = h - p.t - p.b;
        c.strokeStyle = T.line;
        for (let k = 0; k <= 4; k++) {
          const yy = p.t + (k / 4) * ih;
          c.beginPath(); c.moveTo(p.l, yy); c.lineTo(p.l + iw, yy); c.stroke();
          c.fillStyle = '#6b6359'; c.font = '15px ' + T.mono; c.textAlign = 'right';
          c.fillText((1 - k * 0.25).toFixed(2), p.l - 8, yy + 5);
        }
        c.textAlign = 'center';
        const taus = [0.3, 0.6, 1.2];
        taus.forEach((t, i) => {
          const x = p.l + ((i + 0.5) / 3) * iw;
          c.fillStyle = '#6f675e'; c.font = '16px ' + T.mono;
          c.fillText('\u03c4 = ' + t, x, h - 10);
        });
        pts.forEach((pt) => {
          const i = taus.indexOf(pt.tau);
          const gi = [0.05, 0.25, 0.5].indexOf(pt.gamma);
          const x = p.l + ((i + 0.18 + gi * 0.32) / 3) * iw;
          const yv = Math.max(0, Math.min(1, pt.r2));
          const y = p.t + ih - yv * ih;
          c.fillStyle = [T.violet, T.teal, T.amber][gi];
          c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
          c.fillStyle = '#6f675e'; c.font = '14px ' + T.mono;
          c.fillText(fmt(pt.r2, 2), x, y - 14);
        });
        c.textAlign = 'left';
        [['\u03b3=0.05', T.violet], ['\u03b3=0.25', T.teal], ['\u03b3=0.5', T.amber]].forEach(([lb, col], i) => {
          c.fillStyle = col; c.beginPath(); c.arc(p.l + 10 + i * 108, p.t + 10, 5, 0, 7); c.fill();
          c.fillStyle = '#6f675e'; c.font = '15px ' + T.mono; c.fillText(lb, p.l + 22 + i * 108, p.t + 15);
        });
        list.textContent = '';
        pts.slice().sort((a, b) => b.r2 - a.r2).forEach((pt, i) => {
          const row = el('div', css(`display:grid;grid-template-columns:24px 1fr 90px 90px;gap:10px;padding:8px 14px;
            border-bottom:1px solid ${T.line};background:${i === 0 ? 'rgba(40,105,122,.08)' : 'transparent'};`));
          row.append(el('div', css(`font:400 15px ${T.mono};color:#6b6359;`), String(i + 1)),
            el('div', css(`font:500 16px ${T.mono};color:${T.text};`), '\u03c4=' + pt.tau + '  \u03b3=' + pt.gamma),
            el('div', css(`font:400 15px ${T.mono};color:${T.violet};text-align:right;`), 'val ' + fmt(pt.val)),
            el('div', css(`font:600 16px ${T.mono};color:${T.teal};text-align:right;`), fmt(pt.r2)));
          list.append(row);
        });
      }
    }
  }
  if (!customElements.get('sweep-lab')) customElements.define('sweep-lab', SweepLab);

  /* ── <esn-vs-qrc> : expressivity side by side ────────────────────────── */
  class EsnVsQrc extends HTMLElement {
    connectedCallback() {
      if (this._d) return; this._d = true;
      const root = shadow(this, 'display:flex;flex-direction:column;gap:16px;height:100%;min-height:0');
      const st = { n: 4, decay: 0.25, obs: 'xyz' };

      const grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:20px;flex:1;min-height:0;');
      const mk = () => {
        const c = el('div', `${S.card}padding:16px 18px;display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;`);
        const wrap = el('div', 'flex:1;min-height:0;position:relative;overflow:hidden;');
        const cv = el('canvas', 'position:absolute;inset:0;');
        wrap.append(cv);
        const info = el('div', css(`font:400 24px/1.5 ${T.mono};color:${T.dim};display:flex;flex-direction:column;gap:2px;`));
        c.append(wrap, info);
        return { card: c, wrap, cv, info };
      };
      const a = mk(), b = mk();
      grid.append(a.card, b.card);

      const bar = el('div', `${S.card}padding:16px 22px;display:grid;
        grid-template-columns:1fr 1.15fr auto;gap:10px 40px;align-items:center;flex:none;`);
      bar.append(
        slider('reservoir size — n qubits / 16n ESN units', { min: 2, max: 5, step: 1, value: st.n },
          (v) => { st.n = v; redraw(); }),
        slider('memory decay — \u03b3 (QRC) = leak rate a (ESN)', { min: 0.05, max: 0.6, step: 0.05, value: st.decay },
          (v) => { st.decay = v; redraw(); }));
      const segWrap = el('div', 'display:flex;flex-direction:column;gap:7px;');
      segWrap.append(el('div', css(`font:500 24px ${T.sans};color:${T.dim};`), 'measured observables'),
        segmented([{ label: 'Z', value: 'z' }, { label: 'Z + ZZ', value: 'zz' }, { label: 'X,Y,Z + ZZ', value: 'xyz' }],
          st.obs, (v) => { st.obs = v; redraw(); }));
      bar.append(segWrap);
      root.append(grid, bar);

      const kv = (target, rows) => {
        target.textContent = '';
        rows.forEach(([k, v, hot]) => {
          const row = el('div', 'display:grid;grid-template-columns:auto 1fr;gap:0 18px;align-items:baseline;');
          row.append(el('span', 'white-space:nowrap;', k),
            el('span', `color:${hot ? T.teal : T.text};text-align:right;`, v));
          target.append(row);
        });
      };
      const u = (() => {
        const y = QRC.mackeyGlass({ n: 220, tau: 17, seed: 42 });
        const uHi = QRC.quantile(y, 0.995);
        return y.map((v) => Math.min(1, Math.max(0, v / uHi)) * 0.5);
      })();
      const sample = (rows, labels, cap) => {
        if (rows.length <= cap) return { rows, labels };
        const step = Math.ceil(rows.length / cap), rr = [], ll = [];
        for (let i = 0; i < rows.length; i += step) { rr.push(rows[i]); ll.push(labels[i]); }
        return { rows: rr, labels: ll };
      };
      let queued = false;
      const redraw = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const N = 16 * st.n;
          const es = QRC.esnStates(u, { nUnits: N, leak: st.decay, sr: 0.9, seed: 42 });
          const esS = sample(Array.from({ length: N }, (_, i) => es.map((x) => x[i])),
            Array.from({ length: N }, (_, i) => 'x' + i), 14);
          const r = QRC.dissipativeQRC(u, {
            nQubits: st.n, gammas: [st.decay], tau: 0.3,
            includeZZ: st.obs !== 'z', includeXYZ: st.obs === 'xyz', seed: 42
          });
          const qS = sample(r.labels.map((_, f) => r.emb[0].map((row) => row[f])), r.labels, 14);
          // stat rows first: they change height with the numbers, and the canvas
          // must be measured against the space that is actually left over
          kv(a.info, [['state dimension', N + ' real numbers'],
            ['visible to readout', 'all ' + N],
            ['knobs to track', '5']]);
          kv(b.info, [['state dimension', Math.pow(4, st.n).toLocaleString() + ' complex entries', true],
            ['visible to readout', r.labels.length + ' observables', true],
            ['knobs to track', '11', true]]);
          requestAnimationFrame(() => {
            heatmap(a.cv, Math.max(80, a.wrap.clientWidth), Math.max(80, a.wrap.clientHeight),
              esS.rows, { rowLabels: esS.labels, pad: { l: 74, r: 10, t: 6, b: 30 } });
            heatmap(b.cv, Math.max(80, b.wrap.clientWidth), Math.max(80, b.wrap.clientHeight),
              qS.rows, { rowLabels: qS.labels, pad: { l: 124, r: 10, t: 6, b: 30 } });
          });
        });
      };
      requestAnimationFrame(redraw);
      if (window.ResizeObserver) new ResizeObserver(() => redraw()).observe(this);
    }
  }
  if (!customElements.get('esn-vs-qrc')) customElements.define('esn-vs-qrc', EsnVsQrc);

  /* ── <readout-lab> : the linear readout, fitted in front of you ───────── */
  class ReadoutLab extends HTMLElement {
    connectedCallback() {
      if (this._d) return; this._d = true;
      const root = shadow(this, 'display:grid;grid-template-columns:1fr 330px;gap:16px;height:100%;min-height:0');
      const left = el('div', `${S.card}padding:16px 18px 16px 12px;display:flex;flex-direction:column;gap:10px;min-width:0;overflow:hidden;`);
      const cap = el('div', S.label + 'font-size:26px;padding-left:6px;', 'truth vs. prediction');
      const cv = el('canvas');
      left.append(cap, cv);
      const right = el('div', `${S.card}padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto;`);
      root.append(left, right);

      const H = 12, WASH = 60, N = 340;
      const st = { alpha: 1, speed: 2, iter: 0, running: false, gamma: 0.05, lags: 4 };
      let Z = null, dy = null, yTrue = null, idx = null, fitEnd = 0, ymean = 0, w = null, w0 = null, best = null, lr = 0.05;

      /* features -> standardized design matrix, once */
      const build = () => {
        const y = QRC.mackeyGlass({ n: N, tau: 17, seed: 42 });
        const uHi = QRC.quantile(y, 0.995);
        const u = Array.from(y, (v) => Math.min(1, Math.max(0, v / uHi)) * 0.5);
        const r = QRC.dissipativeQRC(u, { nQubits: 4, gammas: [st.gamma], tau: 0.3, includeXYZ: true, seed: 42 });
        // time multiplexing: the readout sees the last few reservoir states, as in
        // the paper. One instantaneous state is not enough memory for h = 12.
        const raw = r.emb[0];
        const F = raw.map((_, t) => {
          let a = [];
          for (let k = 0; k < st.lags; k++) a = a.concat(Array.from(raw[Math.max(0, t - 2 * k)]));
          return a;
        });
        idx = [];
        for (let t = WASH; t + H < N; t++) idx.push(t);
        fitEnd = Math.floor(idx.length * 0.62);
        yTrue = idx.map((t) => y[t + H]);
        const p = F[0].length, n = fitEnd;
        const mean = new Float64Array(p), std = new Float64Array(p);
        for (let j = 0; j < p; j++) {
          let s = 0; for (let i = 0; i < n; i++) s += F[idx[i]][j];
          mean[j] = s / n;
          let v = 0; for (let i = 0; i < n; i++) v += (F[idx[i]][j] - mean[j]) ** 2;
          std[j] = Math.sqrt(v / n) || 1;
        }
        Z = idx.map((t) => Float64Array.from({ length: p }, (_, j) => (F[t][j] - mean[j]) / std[j]));
        ymean = yTrue.slice(0, n).reduce((a, v) => a + v, 0) / n;
        dy = yTrue.map((v) => v - ymean);
        const rr = QRC.ridgeFit(idx.slice(0, n).map((t) => F[t]), yTrue.slice(0, n), st.alpha);
        best = idx.map((t) => rr.predict(F[t]));
        const rg = QRC.rng(7);
        w0 = Float64Array.from({ length: p }, () => (rg() - 0.5) * 0.06);
        w = Float64Array.from(w0);
        // step size from the curvature of the objective: power-iterate Z'Z / n so
        // the descent stays stable however many features the multiplexing adds
        let v = Float64Array.from({ length: p }, () => rg() - 0.5), L = 1;
        for (let it = 0; it < 24; it++) {
          const out = new Float64Array(p);
          for (let i = 0; i < n; i++) {
            const z = Z[i]; let d2 = 0;
            for (let j = 0; j < p; j++) d2 += z[j] * v[j];
            for (let j = 0; j < p; j++) out[j] += (d2 * z[j]) / n;
          }
          for (let j = 0; j < p; j++) out[j] += (st.alpha / n) * v[j];
          L = Math.sqrt(out.reduce((a, x) => a + x * x, 0)) || 1;
          for (let j = 0; j < p; j++) v[j] = out[j] / L;
        }
        lr = 0.55 / L;
      };

      const predict = () => Z.map((z) => { let s = ymean; for (let j = 0; j < z.length; j++) s += w[j] * z[j]; return s; });

      const stats = el('div', css(`font:400 26px/1.6 ${T.mono};color:${T.dim};border-top:1px solid ${T.line};padding-top:14px;`));
      const row = (k, v, c) => {
        const r = el('div', 'display:grid;grid-template-columns:1fr auto;gap:4px 14px;align-items:baseline;');
        r.append(el('span', 'line-height:1.35;', k), el('span', `color:${c || T.text};white-space:nowrap;`, String(v)));
        return r;
      };

      const draw = () => {
        const pred = predict();
        const wpx = left.clientWidth - 30;
        const hpx = Math.max(200, left.clientHeight - cap.offsetHeight - 26);
        linePlot(cv, wpx, hpx, {
          bands: [
            { from: 0, to: fitEnd, color: 'rgba(40,105,122,.09)', label: 'train' },
            { from: fitEnd, to: idx.length, color: 'rgba(140,87,49,.10)', label: 'test' }
          ],
          series: [
            { data: yTrue, color: T.text, width: 2.0 },
            { data: pred, color: T.teal, width: 2.0 }
          ],
          pad: { l: 92, r: 16, t: 14, b: 42 },
          xLabel: 'time step t (washout removed)', yLabel: 'target  y[t+h]'
        });
        const r2tr = QRC.r2score(yTrue.slice(0, fitEnd), pred.slice(0, fitEnd));
        const r2te = QRC.r2score(yTrue.slice(fitEnd), pred.slice(fitEnd));
        stats.textContent = '';
        stats.append(
          row('iteration', st.iter),
          row('R\u00b2 train', fmt(r2tr, 3), T.teal),
          row('R\u00b2 test', fmt(r2te, 3), T.amber),
          row('ridge optimum', fmt(QRC.r2score(yTrue.slice(fitEnd), best.slice(fitEnd)), 3), T.violet),
          row('features', Z[0].length)
        );
      };

      const step = () => {
        const n = fitEnd, p = w.length;
        for (let s = 0; s < st.speed; s++) {
          const g = new Float64Array(p);
          for (let i = 0; i < n; i++) {
            const z = Z[i];
            let e = -dy[i];
            for (let j = 0; j < p; j++) e += w[j] * z[j];
            for (let j = 0; j < p; j++) g[j] += (e * z[j]) / n;
          }
          for (let j = 0; j < p; j++) w[j] -= lr * (g[j] + (st.alpha / n) * w[j]);
          st.iter++;
        }
      };

      let raf = 0;
      const loop = () => {
        if (!st.running) return;
        step(); draw();
        raf = requestAnimationFrame(loop);
      };
      const btnRun = el('button', S.btnPrimary + 'white-space:nowrap;', 'Fit readout');
      const btnReset = el('button', S.btn + 'white-space:nowrap;', 'Reset');
      btnRun.onclick = () => {
        st.running = !st.running;
        btnRun.textContent = st.running ? 'Pause' : 'Fit readout';
        if (st.running) loop(); else cancelAnimationFrame(raf);
      };
      btnReset.onclick = () => {
        st.running = false; btnRun.textContent = 'Fit readout';
        cancelAnimationFrame(raf); w = Float64Array.from(w0); st.iter = 0; draw();
      };
      const legend = el('div', css(`display:flex;flex-direction:column;gap:10px;font:400 26px/1.4 ${T.sans};color:${T.dim};`));
      [[T.text, 'truth'], [T.teal, 'prediction']].forEach(([c, t]) => {
        const r = el('div', 'flex:0 0 auto;display:flex;align-items:center;gap:10px;');
        r.append(el('span', `flex:none;width:28px;height:3px;border-top:3px ${c === T.violet ? 'dashed' : 'solid'} ${c};`), el('span', 'line-height:1.4;', t));
        legend.append(r);
      });
      right.append(
        el('div', 'display:flex;gap:10px;flex-wrap:wrap;', ''),
        legend,
        slider('dissipation \u03b3', { values: [0.02, 0.05, 0.1, 0.25, 0.5], value: 0.05, format: (v) => v.toFixed(2) }, (v) => {
          st.gamma = v; btnReset.onclick(); build(); draw();
        }),
        slider('readout memory k', { min: 1, max: 6, step: 1, value: 4 }, (v) => {
          st.lags = v; btnReset.onclick(); build(); draw();
        }),
        slider('ridge \u03b1', { values: [0.01, 0.1, 1, 10, 100, 1000], value: 1, format: (v) => String(v) }, (v) => {
          st.alpha = v; btnReset.onclick(); build(); draw();
        }),
        slider('steps per frame', { min: 1, max: 20, step: 1, value: 2 }, (v) => { st.speed = v; }),
        stats
      );
      right.children[0].append(btnRun, btnReset);
      [...right.children].forEach((c) => { c.style.flex = '0 0 auto'; });

      requestAnimationFrame(() => { build(); draw(); });
      if (window.ResizeObserver) new ResizeObserver(() => { if (Z) draw(); }).observe(this);
      this._stop = () => { st.running = false; cancelAnimationFrame(raf); };
    }
    disconnectedCallback() { if (this._stop) this._stop(); }
  }
  PANEL_TAGS.push('READOUT-LAB');
  if (!customElements.get('readout-lab')) customElements.define('readout-lab', ReadoutLab);
})();
