# PerioDiag

Offline web app for periodontal charting and diagnosis using the **2017 AAP/EFP World Workshop classification**.
It works on desktop and tablet, installs as a PWA, and needs no login. Records are kept only in the browser (IndexedDB),
with JSON export/import for backup and transfer.

> Decision support only. The clinician is responsible for the final diagnosis.

## Features

- **Charting:** FDI numbering, 32 teeth, missing / implant, 6 sites per tooth (MB B DB / ML L DL) with PD,
  gingival margin, bleeding, plaque, suppuration; mobility 0–3 and furcation I–III per entrance
  (upper molars B/MP/DP, lower molars B/L, upper premolars M/D).
- **CAL = PD − GM**, floored at 0. Bern convention: a **negative GM means recession** (margin apical to the CEJ);
  a positive GM means the margin is coronal to the CEJ. A blank GM is taken as the margin at the CEJ.
- **Fast entry:** typing a digit stores it and jumps to the next site. Per tooth surface it enters PD ×3, then GM ×3.
  The order is the S-path (18→28 buccal, 28→18 palatal, 38→48 lingual, 48→38 buccal) or the Bern row order.
  Missing teeth are skipped. On tablets the same keys are on an on-screen keypad.

  | Key | Action |
  |---|---|
  | `0`–`9` | enter value, advance |
  | `-` then digit | negative GM (recession) |
  | `.` then digit, or `Shift`+digit | 10–19 |
  | `B` / `P` / `S` | toggle bleeding / plaque / suppuration on the site just entered |
  | `Space`, `Enter`, `Tab` | skip |
  | `Backspace` | back one field and clear it |
  | `Delete` | clear current |
  | arrows | move |

- **Chart view:** Bern-style SVG chart with schematic teeth and implants, gingival margin (red) and pocket
  base (blue) lines, BOP/plaque/suppuration dots, PD ≥ 5 mm flags, furcation triangles, plus a summary:
  mean PD, mean CAL, % BOP, % plaque, number of sites with PD ≥ 4 / ≥ 6.
- **Diagnosis wizard:** uses the chart and asks only for what the chart can't provide.
  It shows the reasoning for each component, with the deciding criterion marked, and lets the clinician override any part.
- **PDF export:** A4, page 1 has the vector chart and summary, page 2 the diagnosis with reasoning and the answers entered. It works offline.

## Classification logic (`src/domain/classify`)

Pure TypeScript with no DOM or storage access, covered by unit tests (`tests/domain`).

| Step | Rule |
|---|---|
| Case definition | interdental CAL ≥ 2 mm at ≥ 2 **non-adjacent** teeth, **or** buccal/oral (mid-site) CAL ≥ 3 mm with PD > 3 mm at ≥ 2 teeth. Teeth the clinician marks as non-periodontal (trauma, caries, third molar…) are excluded. |
| Not periodontitis | BOP < 10 % is health; 10–30 % localized gingivitis; > 30 % generalized gingivitis. "On a reduced periodontium" when any CAL is present. |
| Stage severity | worst interdental CAL 1–2 / 3–4 / ≥ 5 mm → I / II / III. RBL < 15 % / 15–33 % / > 33 % → I / II / III, and the higher of CAL and RBL is used. Teeth lost to periodontitis: 1–4 → ≥ III, ≥ 5 → IV. |
| Stage complexity (only raises) | max PD 5 → ≥ II. PD ≥ 6, vertical defect ≥ 3 mm, furcation II/III or moderate ridge defect → ≥ III. Masticatory dysfunction, secondary occlusal trauma (mobility ≥ 2), severe ridge defect, bite collapse, drifting/flaring, or < 10 opposing pairs → IV (when already ≥ III). Never below a stage diagnosed at an earlier exam. |
| Extent | share of natural teeth at the stage-defining CAL level (≥ 1, ≥ 3 or ≥ 5 mm): < 30 % localized, otherwise generalized; molar-incisor pattern when only first molars and incisors are involved |
| Grade | direct evidence over 5 years (no loss A, < 2 mm B, ≥ 2 mm C), otherwise % bone loss / age (< 0.25 A, 0.25–1.0 B, > 1.0 C), otherwise B. Smoking < 10/day → ≥ B, ≥ 10/day → C. HbA1c < 7 % → ≥ B, ≥ 7 % → C. |
| Status | unstable: PD ≥ 5 mm or a 4 mm site with BOP. Stable: BOP < 10 %. In remission: BOP ≥ 10 % without deep or bleeding 4 mm sites. |

Example output: `Periodontitis, Generalized, Stage III, Grade B, currently unstable`.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build in dist/
npm run preview    # serve the build (service worker active)
```

Stack: Vite, React, TypeScript (strict), IndexedDB via `idb`, jsPDF + svg2pdf.js, vite-plugin-pwa.
`.github/workflows/ci.yml` runs the tests and deploys `main` to GitHub Pages.
To use it, enable Pages with "GitHub Actions" as the source in the repository settings.

```
src/domain/         pure logic: teeth, chart, metrics, keyboard entry, records/JSON, classify/
src/storage/        IndexedDB repository
src/ui/             React UI: patients, charting, chartview, wizard, pdf
tests/domain/       unit tests
```

The PDF uses DejaVu Sans (subset, `public/fonts`, Bitstream Vera license) so that symbols such as ≥ and → render.
