## Promptly Employed Web

Next.js App Router frontend for Promptly Employed.

It provides:

- Job submission and streaming results pages
- Local dev run history in development mode
- A browser-local resume library with PDF, DOCX, and TXT upload support

## Resume Library

The web app now includes a `/resumes` page and a compact resume picker on the homepage.

- Uploaded resumes are parsed to plain text through `POST /api/resumes/parse`
- Saved resumes are stored locally in the browser via the resume library helpers in `src/lib/resume-library.ts`
- Submitting a job still sends normalized resume text to `POST /api/jobs`, with optional resume metadata passed through to the Step Functions input

No user account or server-side profile storage exists yet. Resume persistence is local to the current browser.

## Getting Started

First, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Useful Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
```

## Relevant Paths

- `src/app/page.tsx` — main application submission page
- `src/app/resumes/page.tsx` — resume management page
- `src/app/api/jobs/route.ts` — job submission route
- `src/app/api/resumes/parse/route.ts` — resume file parsing route
- `src/hooks/use-resume-library.ts` — client resume library hook
- `src/lib/resume-library.ts` — local resume persistence helpers

## Notes

- Resume uploads support `PDF`, `DOCX`, and `TXT`
- Saved resumes are local-only for now
- The AWS pipeline still operates on normalized resume text, which keeps the current lambdas unchanged
