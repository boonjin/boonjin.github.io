# boonjin.com

Personal site for Boon Jin. Astro, static. GitHub Pages builds `main`; Cloudflare sits in front.

## Commands

Use Node 22 (`nvm use`, see `.nvmrc`).

```bash
npm install
npm run dev
npm run build
```

## The page

An escape room drawn in ink. A door is chained shut by four padlocks, one per product:

| Lock | Era | Puzzle | Component |
| --- | --- | --- | --- |
| 1 | Smoothboard, 2008 | Tap four targets to calibrate the Wii Remote | `src/components/room/Calibrate.astro` |
| 2 | Smoothboard Air, 2012 | Phones scan a real QR code and draw a key | `src/components/room/Join.astro` |
| 3 | Deck.Toys, 2018 | A direction lock that wants the route on the map | `src/components/room/Path.astro` |
| 4 | Now | An open-answer lock judged by a decision model | `src/components/room/Reader.astro` |

Scrolling solves each lock as it passes; tapping one hands it to the visitor. Logic lives in
`src/scripts/room.ts`. The door swings open in real perspective (`src/lib/door.ts`).

Ink and paper, one accent (vermilion) for whatever is next, live or open. Newsreader for type,
IBM Plex Mono for labels. All drawings share the filters in `InkDefs.astro`.

Portrait: put a photo in `public/images/` and set `photo` in `src/data/site.ts`.

`public/og.png` is rendered from the built door drawing; regenerate it by hand if the door changes.

## Lock 4

The open-answer lock simulates a small decision model in the page (`judgeLocally` in
`src/scripts/room.ts`): cue words, plurals and near-misspellings score each choice, and a softmax
turns the scores into probabilities. No server, no API call.

## Notes

Posts live in `src/content/posts/`:

```md
---
title: "Post title"
description: "Short SEO and social description."
date: 2026-05-02
tags: ["AI", "EdTech"]
image: "https://..." # optional, real screenshots only
---
```
