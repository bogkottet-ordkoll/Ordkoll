# Ordkollen — AI Interaction Player

A self-contained, glassmorphism video player inspired by the Ordkollen scan UI.
Open `index.html` (or enable GitHub Pages on the `player/` folder) — no build step.

## Features
- **Modes:** `AI HD Interaction`, `Gemini Label`, `Manual` (top-right pills) with smooth transitions.
- **Tap-to-label without pausing:** click the playing video to fade in a white label ("this is a wall / window / chair...") plus a one-line scene description.
- **AI Overview:** describes the whole frame with the same transition.
- **Freeze capture:** stops exactly on the current frame and exports an anti-aliased PNG.
- **Anti-aliasing 1x–16x:** supersampled on captured stills; optional live-AA path has a frame-time thermal guard so it won't lag or overheat.

## Gemini vision (optional)
Labels and the overview run on an offline pixel engine by default. To use real **Gemini vision**, open Settings (gear) and paste a Google AI Studio API key — it is stored only in your browser `localStorage` and calls `gemini-2.5-flash`.

> Note: "Gemini 3.1" is not a publicly released model; this build targets the current vision-capable `gemini-2.5-flash`. For a public site, proxy the key through a serverless function rather than exposing it client-side.
