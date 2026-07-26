# quantum-experiment-tracking

Source for the **From Circuits to Results** tutorial website, built with
[Jekyll](https://jekyllrb.com/) and GitHub Pages using the built-in `minima`
theme — no local Ruby install, gems, or build step required. Every push to
`main` is built and deployed automatically by GitHub.

## Structure

```text
.
├── _config.yml            # site title, tagline (shown in header), description (shown in footer)
├── index.md                # the entire page: presenters, abstract, agenda
├── _includes/
│   ├── header.html         # overrides minima's header — shows title + tagline, no nav
│   └── footer.html         # overrides minima's footer — shows title + description once each
├── assets/
│   └── main.scss           # custom skin on top of minima (must be at this exact path — see note below)
└── README.md
```

## Editing content

Everything lives in [`index.md`](index.md) as plain Markdown — edit the
presenters list, abstract, or agenda sections directly. It's a single page
on purpose; add more `.md` files later only if the site outgrows this.

The big title at the top of every page comes from `title` and `tagline` in
[`_config.yml`](_config.yml), rendered by [`_includes/header.html`](_includes/header.html) —
not from a heading in `index.md`. This avoids the title appearing twice.

## A note on customizing minima

Jekyll lets a site override any file from its theme by placing a file at the
same path in the site's own source (`_includes/header.html`,
`_includes/footer.html`, `assets/main.scss`, etc.) — Jekyll always prefers
the site's copy over the theme gem's. `assets/main.scss` **must** live at
exactly that path: minima's `head.html` links `/assets/main.css` specifically,
so a stylesheet placed anywhere else (e.g. `assets/css/style.scss`) is simply
never loaded, with no error or warning.

## Local preview (optional)

No local setup is required to publish — GitHub builds the site for you. If
you want to preview changes locally before pushing, install
[Ruby + Bundler](https://jekyllrb.com/docs/installation/), then:

```bash
bundle init
bundle add github-pages --group jekyll_plugins
bundle exec jekyll serve
```

## Enabling GitHub Pages

Repository **Settings → Pages → Source**: choose **Deploy from a branch**,
branch `main`, folder `/(root)`. The site will appear at
`https://<username>.github.io/quantum-experiment-tracking/` within a minute.

## Design

The color palette (navy, warm gold, terracotta accent) and heading typeface
in [`assets/main.scss`](assets/main.scss) are inspired by the University of
Jyväskylä's visual identity. Adjust the `--jyu-*` CSS variables at the top of
that file to change the theme.