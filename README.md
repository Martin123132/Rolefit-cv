# Rolefit CV

Rolefit CV is a job-specific CV writing and interview coaching app.

The product rule is simple: the UI teaches the user what to do next.

- Green means this part is done.
- Orange means do this next.
- Red means this part is locked until the previous step is done.

The current app runs locally and supports bring-your-own-key live analysis for OpenAI, Claude, and Gemini through a local proxy. API keys are held in browser session state for the request and are not saved to local draft storage. Local mock mode still works without a key.

Live provider calls use the same Rolefit analysis contract as the local mock. If a live request fails, the app falls back to local analysis so the workflow can continue.

The interview coach now turns each analysed CV into a question bank, STAR answer builder, answer feedback lights, and a downloadable interview pack. The goal is to help the person practise the evidence behind the CV, not just produce better-looking wording.

## One-click run on Windows

1. Install [Node.js LTS](https://nodejs.org/en/download) if needed.
2. Download or clone this repo.
3. Double-click `Run Rolefit CV.bat`.

The launcher installs dependencies on first run, chooses a free local port, starts the app, prints the exact URL, and opens it in the browser.

Close the launcher window, or press `Ctrl+C`, to stop the app.

Do not open `index.html` directly. This is a Vite app and needs the launcher or terminal command below.

## Terminal run

```bash
npm install
npm start
```

## Checks

```bash
npm run lint
npm run build
```
