# quantum-experiment-tracking

Source for the **From Circuits to Results** tutorial website, built with
[Jekyll](https://jekyllrb.com/) and GitHub Pages using the built-in `minima`
theme — no local Ruby install, gems, or build step required. Every push to
`main` is built and deployed automatically by GitHub.

## Structure

```text
.
├── _config.yml                  # site title, description, nav order
├── index.md                     # homepage
├── agenda.md                    # tutorial agenda
├── tutorials/
│   ├── installation.md
│   └── first-experiment.md
├── assets/
│   ├── css/style.scss           # custom skin on top of minima
│   └── images/hero.svg          # homepage graphic
└── README.md
```

## Editing content

Every page is plain Markdown with a small YAML front matter block, e.g.:

```markdown
---
layout: page
title: My New Page
permalink: /my-new-page/
---

Page content goes here.
```

To add a page to the top navigation bar, list its path under `header_pages`
in [`_config.yml`](_config.yml).

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