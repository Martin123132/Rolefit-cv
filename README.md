# Rolefit CV

Rolefit CV is a job-specific CV writing and interview coaching app.

The product rule is simple: the UI teaches the user what to do next.

- Green means this part is done.
- Orange means do this next.
- Red means this part is locked until the previous step is done.

The current app is a local demo. Provider/model selection and a session-only API key field are present for future bring-your-own-key integrations, but no real AI requests are sent yet.

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
