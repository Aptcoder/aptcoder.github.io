# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Samuel Omilo's personal website/blog — a static site built with [Hugo](https://gohugo.io/) (extended edition) using the [PaperModX](https://github.com/reorx/hugo-PaperModX.git) theme. Content is prose blog posts; there is no application code, database, or JS build pipeline of our own.

## Commands

- `hugo server -D` — local dev server with drafts shown (posts default to `draft = true`).
- `hugo server` — local dev server, published posts only.
- `hugo --gc --minify` — production build into `public/` (mirrors CI).
- `hugo new content posts/<slug>/index.md` — scaffold a new post from `archetypes/default.md` (creates it as a page bundle so images can live alongside `index.md`).

Requires **Hugo extended** (Dart Sass is used for the theme's SCSS). CI pins `HUGO_VERSION: 0.128.0`.

## Architecture & conventions

- **Theme is a git submodule** at `themes/PaperModX`. Clone with `--recurse-submodules`; CI checks out with `submodules: recursive`. Do not edit files under `themes/` — override instead (see below).
- **Overriding the theme:** files in the project root `layouts/` and `assets/` shadow the theme's equivalents. Current overrides:
  - `layouts/partials/extend_head.html` — injects the Inria Sans Google Font (used site-wide).
  - `layouts/partials/footer.html` — copy of the theme footer with the site's scripts.
  - `layouts/_default/_markup/render-codeblock.html` — wraps fenced code blocks in `<figure class="highlight">` with an optional `<figcaption>` driven by the code block's `title` attribute.
  - `assets/css/extended/custom.css` — the place to add custom CSS. PaperModX auto-loads everything under `assets/css/extended/`, so new stylesheets there are picked up without wiring. (`testing.css` is an empty scratch file.)
- **Content** lives in `content/posts/<slug>/` as page bundles: `index.md` plus co-located images. Front matter is TOML (`+++` delimiters). Useful keys: `draft`, `ShowToc`, `title`, `date`.
- **Config** is `hugo.yml` (site title, `homeInfoParams` intro text, social icons, main menu). Note `TocSide: left`.
- **Deploy:** pushing to `main` triggers `.github/workflows/hugo.yaml`, which builds with Hugo extended + Dart Sass and publishes `public/` to GitHub Pages. `public/` and `resources/` are committed build artifacts — regenerate rather than hand-editing.

## Known rough edges (candidate fixes)

- `public/` and `resources/` are committed build artifacts even though CI rebuilds them from scratch — candidates for `.gitignore`.
- CI pins `HUGO_VERSION: 0.128.0` (mid-2024); consider bumping.
- `assets/css/extended/testing.css` is an empty scratch file that can be removed.
