# Vanilla Webpage Template

A lightweight, dependency-free products page for your own site. Everything (HTML, CSS and JavaScript) lives in one self-contained `index.html` file. No frameworks, no build step, no CDNs. Open it in a browser and it works.

Built by Snow Seasons Tech ([snowseasonstech.net](https://snowseasonstech.net)).

## Features

- **Zero dependencies**: pure HTML, CSS and vanilla JS in a single file. Icons are inline SVG.
- **Products grid**: three product cards with image area, badge, description, price and Buy button. Copy a card to add more; the grid adjusts on its own.
- **Light/dark theme**: follows the visitor's system setting until they pick, then remembers their choice. No flash of the wrong theme on load.
- **CSS variable theming**: every color, the corner radius and the container width are set once in `:root`.
- **Responsive layout**: auto-fit grids, and on phones the nav links move to their own row under the logo.
- **Accessible by default**: landmarks, labelled nav, a real `<button>` for the theme toggle with `aria-pressed`, visible keyboard focus, and reduced-motion support.

## Page structure

| Section | ID | Contents |
| --- | --- | --- |
| Header / Nav | — | Logo, links (Products, About, Features, Contact), theme toggle |
| Hero | `#hero` | Eyebrow, headline, intro copy, two buttons, a short reassurance line |
| Products | `#products` | Three product cards: Starter Kit, Pro Toolkit, Complete Bundle |
| About | `#about` | Short story plus four stat tiles |
| Features | `#features` | Three "why us" cards with icons |
| Contact | `#contact` | Call-to-action banner with an email button |
| Footer | — | Copyright with the current year, Privacy, Terms and email links |

All copy is placeholder text written as instructions ("Describe the first benefit…"), so it's clear what to replace.

## Theming

Edit the variables at the top of the `<style>` block. Dark mode overrides the color values.

| Variable | Purpose | Light | Dark |
| --- | --- | --- | --- |
| `--bg-color` | Page background | `#ffffff` | `#0f1218` |
| `--text-color` | Body text | `#1f2937` | `#e8ebf0` |
| `--muted-color` | Secondary text | `#5b6472` | `#a3abb8` |
| `--primary-color` | Logo mark, links, buttons | `#2563eb` | `#6ea8fe` |
| `--primary-text` | Text on primary buttons | `#ffffff` | `#0b1220` |
| `--accent-color` | "Most popular" badge | `#ea580c` | `#fb923c` |
| `--secondary-color` | Alternating sections, hover backgrounds | `#f3f5f8` | `#161b23` |
| `--card-color` | Card backgrounds | `#ffffff` | `#1a2029` |
| `--border-color` | Borders and dividers | `#e3e7ee` | `#2a323f` |
| `--shadow` | Card shadow | soft | deeper |
| `--radius` | Card corner radius | `14px` | — |
| `--container-width` | Max content width | `1100px` | — |
| `--transition` | Hover transition timing | `0.2s ease` | — |

To rebrand: change `--primary-color` (and its dark value), the logo text and the letter in `.logo-mark`. The dark values appear twice, once under `[data-theme="dark"]` and once under `prefers-color-scheme: dark`, so update both.

## Product images

Each card starts with a colored placeholder (`<div class="thumb thumb-1">`). To use a photo, replace that `<div>` with:

```html
<img class="thumb" src="images/starter-kit.jpg" alt="Starter Kit in its box">
```

The image is cropped to a 16:10 frame, so it can be any size.

## Buy buttons

The Buy buttons link to `#contact` by default. Point each one at your checkout: a Stripe Payment Link, a Gumroad or Lemon Squeezy product URL, or a `mailto:` link.

## Getting started

1. Save `index.html` anywhere.
2. Open it in any modern browser; no server or build tooling required.
3. Replace the copy, prices and links, then upload it to any static host (Netlify, Cloudflare Pages, GitHub Pages or your own server).

## How the theme toggle works

A tiny script in `<head>` applies a saved theme before the page paints. The toggle button flips `data-theme` on `<html>` between `light` and `dark`, saves the choice in `localStorage`, and updates its label and `aria-pressed`. With nothing saved, the page follows the visitor's system setting through `prefers-color-scheme`. If storage is blocked, the toggle still works for the current visit.
