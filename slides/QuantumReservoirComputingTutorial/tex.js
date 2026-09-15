/* tex.js — <tex-math> : write real LaTeX in the slides.

     <tex-math>\rho \leftarrow (1-\gamma)\rho + \gamma|0\rangle\langle 0|</tex-math>
     <tex-math display>H(u_t) = \sum_i h_i X_i + u_t \sum_i w_i Z_i</tex-math>

   The LaTeX source stays in the light DOM (so it is editable as plain text and
   React keeps owning it); the rendered output goes into a shadow root. If KaTeX
   cannot load — offline, no CDN — the raw LaTeX shows instead, which is still
   readable. Attributes:
     display   block, centred, display-mode math
     size      font-size for the rendered math (default: inherit)
     color     colour for the rendered math (default: inherit)
*/
(function () {
  'use strict';
  const V = '0.16.11';
  const CSS = 'https://cdn.jsdelivr.net/npm/katex@' + V + '/dist/katex.min.css';
  const JS = 'https://cdn.jsdelivr.net/npm/katex@' + V + '/dist/katex.min.js';

  let ready = null;
  function katexReady() {
    if (ready) return ready;
    ready = new Promise((resolve) => {
      if (window.katex) return resolve(window.katex);
      const s = document.createElement('script');
      s.src = JS;
      s.onload = () => resolve(window.katex || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
      // warm the stylesheet in the document too, so the fonts are fetched once
      if (!document.querySelector('link[data-katex]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = CSS; l.setAttribute('data-katex', '');
        document.head.appendChild(l);
      }
    });
    return ready;
  }

  class TexMath extends HTMLElement {
    connectedCallback() {
      if (this._done) return;
      const src = (this.textContent || '').trim();
      if (!src) { requestAnimationFrame(() => this.connectedCallback()); return; }
      this._done = true;
      const block = this.hasAttribute('display');
      const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
      root.textContent = '';

      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = CSS;
      const st = document.createElement('style');
      st.textContent =
        ':host{display:' + (block ? 'block' : 'inline-block') + ';' +
        (block ? 'text-align:' + (this.getAttribute('align') || 'left') + ';' : 'vertical-align:baseline;') +
        (this.getAttribute('size') ? 'font-size:' + this.getAttribute('size') + ';' : '') +
        (this.getAttribute('color') ? 'color:' + this.getAttribute('color') + ';' : '') +
        '}' +
        '.katex{font-size:1em;color:inherit}' +
        '.raw{font-family:ui-monospace,monospace;font-size:.9em;opacity:.85}';
      root.append(link, st);

      const out = document.createElement('span');
      out.className = 'raw';
      out.textContent = src;
      root.append(out);

      katexReady().then((katex) => {
        if (!katex) return; // leave the LaTeX source visible
        try {
          out.className = '';
          out.innerHTML = katex.renderToString(src, {
            displayMode: block, throwOnError: false, output: 'html',
            strict: false, trust: false
          });
        } catch (e) {
          out.className = 'raw';
          out.textContent = src;
        }
      });
    }
  }
  if (!customElements.get('tex-math')) customElements.define('tex-math', TexMath);
})();
