# Portfolio — Ankit Tiwari

Personal portfolio and project case studies. Static site (Webflow export) with a small Node
build step that produces a clean `dist/` for Netlify.

**Live site:** https://ankitkumartiwari.netlify.app

## Stack

- Plain HTML / CSS / JS (Webflow export) — no framework, no runtime dependencies
- Node 18+ for the build tooling only
- Netlify for hosting (`netlify.toml` in this repo is the source of truth)

## Project layout

```
index.html            home
about.html            about
work.html             all projects
playground.html       project playground
all-work/*.html       individual case studies
css/, js/, images/    site assets
scripts/              build tooling
dist/                 build output (gitignored, published to Netlify)
```

## Commands

```bash
npm run build         # build dist/ (skips assets nothing references)
npm run build:strict  # build, but fail if any local reference is broken
npm run analyze       # report missing assets, broken links and unused files
npm run preview       # serve dist/ locally on http://localhost:8888
npm run clean         # remove dist/
```

`npm run build` copies every page, ships `css/` and `js/` whole, and copies **only the images
that are actually referenced**, so dead weight never reaches the CDN. It also verifies that every
local reference in the output resolves, and fails the build with `--strict` if one does not.

## Deploying

The site is published from `dist/`. With the Netlify CLI logged in:

```bash
npm run build
netlify deploy --dir=dist --prod
```

`netlify.toml` sets the same build (`npm run build`) and publish directory (`dist`) for
Netlify's own build pipeline, so a repository-connected deploy produces an identical result.

## Content notes

- Case studies live in `all-work/`; each one is reachable at `/all-work/<name>` (Netlify
  pretty URLs are enabled).
- `404.html` is the custom not-found page.
- Removing a project means removing its page, its card on `work.html` / `playground.html`, and
  its images — `npm run analyze` reports anything left dangling.
