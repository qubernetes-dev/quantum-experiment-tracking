#!/usr/bin/env python3
"""build_standalone.py — rebuild the single-file presentation from the sources.

Turns

    Part 4 QRC Experiment Tracking.dc.html          (the deck you edit)
    support.js deck-stage.js tex.js qrc-engine.js
    tracking.js pipeline.js widgets.js              (its siblings)

into

    Part 4 QRC Experiment Tracking (standalone).html

a single self-contained file that opens from file:// with no server, no network
and no Python. Run it after any change to the deck or to a .js file.

    python3 build_standalone.py

Standard library only. Needs network access once, to fetch the Google fonts it
inlines; pass --no-fonts to skip that and fall back to system fonts.
"""
import argparse
import base64
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "Part 4 QRC Experiment Tracking.dc.html"
OUT = ROOT / "Part 4 QRC Experiment Tracking (standalone).html"

# Inlined in load order. deck-stage.js is listed here even though the deck pulls
# it through x-import: inlining it up front means the custom element is already
# defined and the runtime fetch can be dropped.
SCRIPTS = [
    "support.js",
    "deck-stage.js",
    "tex.js",
    "qrc-engine.js",
    "tracking.js",
    "pipeline.js",
    "widgets.js",
]

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Hides the thumbnail rail and control bar: the export is a presentation file,
# not an editing surface.
CHROME_OFF = """
(function () {
  var apply = function () {
    var list = document.querySelectorAll('deck-stage');
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d.hasAttribute('no-rail')) d.setAttribute('no-rail', '');
      var sr = d.shadowRoot;
      if (sr && !d.__chromeOff) {
        var st = document.createElement('style');
        st.textContent = '.overlay, .rail, .rail-resize { display: none !important; }';
        sr.appendChild(st);
        d.__chromeOff = true;
      }
    }
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { subtree: true, childList: true });
  document.addEventListener('DOMContentLoaded', apply);
})();
"""


def guard(js: str) -> str:
    """A literal </script> inside inlined JS would close the wrapping tag."""
    return js.replace("</script", "<\\/script")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()


def inline_fonts(html: str) -> str:
    """Replace the Google Fonts <link> with a <style> holding base64 woff2."""
    m = re.search(r'<link[^>]+href="(https://fonts\.googleapis\.com/css2[^"]+)"[^>]*>', html)
    if not m:
        print("  fonts: no Google Fonts link found, skipping")
        return html

    css_url = m.group(1).replace("&amp;", "&")
    print("  fonts: fetching stylesheet")
    css = fetch(css_url).decode("utf-8")

    urls = sorted(set(re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', css)))
    print("  fonts: inlining %d font files" % len(urls))
    for i, u in enumerate(urls, 1):
        data = base64.b64encode(fetch(u)).decode("ascii")
        css = css.replace(u, "data:font/woff2;base64," + data)
        sys.stdout.write("\r  fonts: %d/%d" % (i, len(urls)))
        sys.stdout.flush()
    print()

    # Drop the preconnect hints and the stylesheet link; emit the CSS instead.
    html = re.sub(r'\s*<link rel="preconnect"[^>]*>', "", html)
    return html.replace(m.group(0), "<style>\n" + css + "\n  </style>")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fonts", action="store_true",
                    help="skip font inlining (no network needed; uses system fonts)")
    args = ap.parse_args()

    if not SRC.exists():
        print("error: %s not found" % SRC.name)
        return 1

    html = SRC.read_text(encoding="utf-8")

    missing = [s for s in SCRIPTS if not (ROOT / s).exists()]
    if missing:
        print("error: missing sibling files: %s" % ", ".join(missing))
        return 1

    print("building %s" % OUT.name)

    # 1. Presentation chrome off, injected at the top of <helmet>.
    html = html.replace("<helmet>", "<helmet>\n  <script>" + CHROME_OFF + "  </script>", 1)

    # 2. Inline every sibling <script src>, in place.
    for name in SCRIPTS:
        js = guard((ROOT / name).read_text(encoding="utf-8"))
        pattern = re.compile(r'<script src="\.?/?%s"\s*></script>' % re.escape(name))
        block = "<script>/* %s */\n%s\n</script>" % (name, js)
        html, n = pattern.subn(lambda m: block, html)
        if n:
            print("  inlined %s (%d KB)" % (name, len(js) // 1024))
        elif name == "deck-stage.js":
            # Not a <script src> — it arrives via x-import. Prepend it to <helmet>
            # and drop the runtime fetch so the file works offline.
            html = html.replace("<helmet>", "<helmet>\n  " + block, 1)
            html = html.replace(' from="./deck-stage.js"', "")
            print("  inlined deck-stage.js (%d KB), dropped x-import fetch" % (len(js) // 1024))
        else:
            print("  warning: no <script src> tag matched %s" % name)

    # 3. Fonts.
    if args.no_fonts:
        print("  fonts: skipped (--no-fonts)")
    else:
        try:
            html = inline_fonts(html)
        except Exception as e:
            print("  fonts: fetch failed (%s) — falling back to the remote link" % e)

    OUT.write_text(html, encoding="utf-8")
    print("wrote %s (%.1f MB)" % (OUT.name, OUT.stat().st_size / 1e6))
    print("open it directly — no server needed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
