---
name: run-launcher
description: Build, run, test, smoke-test or screenshot the Launcher app in snowStore/launcher. Use when asked to run, start, build, check or screenshot the Launcher.
---

# Run the Launcher

A React and Tailwind page. Paths are relative to `launcher/`.

## Setup

```bash
npm install
```

## Run (agent path)

Starts Vite on port 5199, loads the page in headless Chrome, checks for 18 rows, saves `/tmp/launcher.png` and stops.

```bash
node .claude/skills/run-launcher/smoke.mjs
```

## Build

```bash
npm run build:single
```

## Test

From the `snowStore` root:

```bash
npm test
```

## Run (human path)

`npm run dev` serves http://127.0.0.1:5183. It uses a strict port, so it fails if a copy is already running.

## Gotchas

- `smoke.mjs` expects 18 rows, so update that number when `src/apps.js` changes.
- Count `<li` carefully: the page also has `<link`, which caused a false 19.
- Deploy only from `launcher/`. From another folder, wrangler bundles that folder's `functions/`.
