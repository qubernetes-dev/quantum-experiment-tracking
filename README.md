# quantum-experiment-tracking

Source for the **From Circuits to Results** tutorial website, built with
[Jekyll](https://jekyllrb.com/) and GitHub Pages using the built-in `minima`
theme — no local Ruby install, gems, or build step required. Every push to
`main` is built and deployed automatically by GitHub.

## Structure

```text
.
├── _config.yml            # site title and description
├── index.md               # the entire site: title, presenters, abstract, agenda
├── assets/
│   └── css/style.scss     # custom skin on top of minima
└── README.md
```

## Editing content

Everything lives in [`index.md`](index.md) as plain Markdown — edit the
presenters table, abstract, or agenda sections directly. It's a single page
on purpose; add more `.md` files later only if the site outgrows this.

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
in [`assets/css/style.scss`](assets/css/style.scss) are inspired by the
University of Jyväskylä's visual identity. Adjust the `--jyu-*` CSS variables
at the top of that file to change the theme.