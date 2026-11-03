# PerioDiag: notes for Claude

## Workflow (set by the repository owner)
- **Push directly to `main`.** No feature branches, no pull requests, no merges. Every push to `main` deploys to
  GitHub Pages automatically (`.github/workflows/ci.yml`), about a minute after the push.
- Before every push, run `npm test` and `npm run build`. Push only when both pass.
- After pushing, check that the "CI and GitHub Pages" run on `main` succeeded. If it failed, fix it without asking.
- Don't hand the owner manual steps that can be done from the session.

## Project
- Vite + React + TypeScript (strict). Offline PWA; data in IndexedDB; JSON export/import (schema v2, images embedded).
- `src/domain/`: pure logic with unit tests in `tests/domain/` (teeth, chart, metrics, keyboard entry, records,
  radiograph survey, `classify/` = 2017 AAP/EFP classification). Keep it free of DOM and storage access.
- `src/ui/`: React UI (patients, charting, chartview, radiographs, wizard, pdf). `src/storage/db.ts`: IndexedDB.
- Gingival margin: negative = recession (Bern convention); CAL = PD − GM, floored at 0. GM entry is negative by
  default, `+` first for positive.
