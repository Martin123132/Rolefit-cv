# Rolefit CV

Rolefit CV is a job-specific CV writing and interview coaching app.

Most CV tools produce polished generic wording. Rolefit is built around a different rule: a CV should prove the exact job being applied for, and the person should be able to talk confidently about every claim in an interview.

## Product Idea

Rolefit helps a user move through one application at a time:

1. Add a CV and a job advert.
2. Map the job requirements against real evidence in the CV.
3. Rewrite the CV without inventing claims.
4. Coach the user on proof, gaps, and confidence.
5. Rehearse interview questions based on the CV and job.
6. Export an application pack and interview pack.

The app uses a traffic-light workflow so the interface teaches the process:

- Green means this part is done.
- Orange means do this next.
- Red means this part is locked until the previous step is done.

## Current Features

- Local one-click Windows launcher.
- CV and job advert text editors.
- `.txt`, `.md`, `.markdown`, `.docx`, and readable `.pdf` import for CV and job inputs.
- Local mock analysis that works without an API key.
- Provider selector for OpenAI, Claude, and Gemini.
- Session-only bring-your-own-key field.
- Local provider proxy for live analysis requests.
- Provider contract card showing provider, model, contract version, and key state.
- Live-provider guardrails for request size, timeout, and local fallback.
- Analysis quality gate that checks provider output for completeness, CV grounding, role coverage, gap honesty, rewrite safety, and interview usefulness.
- Selected-provider comparison against the local mock baseline before choosing which analysis to use.
- Evidence map for job requirements.
- Claim safety review before rewriting.
- Editable targeted CV rewrite.
- Coaching prompts for proof, gaps, and confidence.
- Interview question bank generated from the analysed CV/job fit.
- STAR answer builder.
- Answer feedback lights for evidence, relevance, result, gap honesty, and confidence.
- Downloadable application pack and interview pack in Markdown or plain text.

## AI Providers And Keys

Rolefit currently supports:

- Local mock
- OpenAI
- Claude
- Gemini

The local mock sends no request and needs no key.

For OpenAI, Claude, and Gemini, the app uses a local Vite proxy endpoint so provider requests do not run directly from browser code. The API key is held in browser session state for the request and is not saved to local draft storage.

Live-provider requests are capped at 64 KB of CV text and 64 KB of job text. The local proxy also protects the app with a 45 second provider timeout and clearer messages for rejected keys, rate limits, request-shape problems, and provider outages.

If a live provider request fails, Rolefit falls back to local analysis so the workflow can continue.

Every analysis run also passes through a local quality gate. This does not call an AI provider. It checks whether the returned output is complete, grounded in the CV text, mapped to the job advert, honest about gaps, safe for rewriting, and useful for interview practice.

The comparison mode runs the selected provider against the local mock baseline and shows both quality-gate results. It does not unlock the workflow until the user chooses one analysis to use.

## Privacy Notes

- Imported files are read client-side.
- Imported text is not uploaded just by importing it.
- DOCX/PDF imports extract plain text into the editor; the user still chooses when to run analysis.
- API keys are not saved in local draft storage.
- Local draft storage can save CV text, job text, provider/model choice, and practice notes so the user does not lose work.
- Live provider analysis sends the CV and job advert to the selected AI provider when the user runs analysis with a session key present.
- Failed or timed-out live requests keep the local workflow available instead of saving or retrying keys silently.

## One-Click Run On Windows

1. Install [Node.js LTS](https://nodejs.org/en/download) if needed.
2. Download or clone this repo.
3. Double-click `Run Rolefit CV.bat`.

The launcher installs dependencies on first run, chooses a free local port, starts the app, prints the exact URL, and opens it in the browser.

Close the launcher window, or press `Ctrl+C`, to stop the app.

Do not open `index.html` directly. This is a Vite app and needs the launcher or terminal command below.

## Terminal Run

```bash
npm install
npm start
```

The app usually starts at:

```text
http://127.0.0.1:5317/
```

If that port is busy, the launcher chooses another free local port and prints the URL.

## Development Checks

```bash
npm run lint
npm run build
```

## Tech Stack

- React
- TypeScript
- Vite
- Local Vite middleware for provider proxy requests
- Lucide React icons

## Current Limitations

- Scanned or image-only PDFs are not OCR processed yet.
- Live provider support is still early and needs prompt-quality evaluation before wider use.
- The app is local-first; hosted deployment and account systems are not part of this stage.
- The analysis is a production foundation, not a final career-advice guarantee.

## Roadmap

Planned next slices:

- OCR support for scanned PDFs.
- Full all-provider comparison once per-provider session keys are available.
- More interview modes, including follow-up questions.
- Saved application history.
- Cleaner packaged desktop/local release.

## Project Direction

Rolefit should stay easy to use. The user should not need to understand prompting, model settings, or CV theory to move forward. The app should guide them step by step, keep claims honest, and help them practise the person behind the CV.
