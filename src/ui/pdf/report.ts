// PDF report: page 1 = chart + summary, page 2 = diagnosis with reasoning.
// jsPDF, svg2pdf and react-dom/server are loaded on demand (keeps startup fast).

import { createElement } from 'react';
import {
  classify,
  EXTENT_LABEL,
  finalize,
  ROMAN,
  rblThird,
  STATUS_LABEL,
  type ClinicalInputs,
  type Diagnosis,
  type FinalDiagnosis,
  type Reason,
} from '../../domain/classify';
import { formatNumber } from '../../domain/metrics';
import { ageOn, type Exam, type Patient } from '../../domain/records';
import { deepSites } from '../chartview/ChartView';
import { FULL_W, FullChart, fullChartHeight } from '../chartview/FullChart';
import { effectiveInputs, historyFor } from '../wizard/history';

const FONT = 'DejaVuSans';
const PAGE_W = 210;
const PAGE_H = 297;
const M = 12; // margin
const CONTENT_W = PAGE_W - 2 * M;
const PRIMARY: [number, number, number] = [31, 78, 121];
const MUTED: [number, number, number] = [93, 107, 124];

async function fontBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export interface ReportData {
  exam: Exam;
  patient: Patient | null;
  inputs: ClinicalInputs;
  diagnosis: Diagnosis;
  final: FinalDiagnosis;
}

export function reportData(exam: Exam, patient: Patient | null, exams: Exam[]): ReportData {
  const inputs = effectiveInputs(exam, patient);
  const diagnosis = classify(exam.chart, inputs, historyFor(exam, exams));
  return { exam, patient, inputs, diagnosis, final: finalize(diagnosis, exam.override) };
}

export async function buildPdf(data: ReportData): Promise<Blob> {
  const [{ jsPDF }, { renderToStaticMarkup }] = await Promise.all([import('jspdf'), import('react-dom/server'), import('svg2pdf.js')]);
  const base = import.meta.env.BASE_URL;
  const [regular, bold] = await Promise.all([fontBase64(`${base}fonts/DejaVuSans.ttf`), fontBase64(`${base}fonts/DejaVuSans-Bold.ttf`)]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.addFileToVFS('DejaVuSans.ttf', regular);
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold);
  doc.addFont('DejaVuSans.ttf', FONT, 'normal');
  doc.addFont('DejaVuSans-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');

  const { exam, patient, diagnosis: d, final } = data;
  const age = data.inputs.age ?? (patient?.dateOfBirth ? ageOn(patient.dateOfBirth, exam.date) : undefined);
  const header = (title: string) => {
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, PAGE_W, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(FONT, 'bold').setFontSize(13).text(title, M, 10.5);
    doc.setFont(FONT, 'normal').setFontSize(8).text('PerioDiag · 2017 AAP/EFP classification', PAGE_W - M, 10.5, { align: 'right' });
    doc.setTextColor(27, 36, 48).setFontSize(9);
    const who = [
      `Patient: ${patient?.label ?? '–'}`,
      patient?.dateOfBirth ? `born ${patient.dateOfBirth}${age !== undefined ? ` (${age} y)` : ''}` : age !== undefined ? `age ${age}` : '',
      `Exam: ${exam.date}`,
      exam.examiner ? `Examiner: ${exam.examiner}` : '',
    ].filter(Boolean);
    doc.text(who.join('   ·   '), M, 22);
  };
  const footers = () => {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFont(FONT, 'normal').setFontSize(7).setTextColor(...MUTED);
      doc.text(`Generated ${new Date().toLocaleString()}  ·  Decision support only: the clinician is responsible for the diagnosis.`, M, PAGE_H - 7);
      doc.text(`Page ${p} / ${n}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
    }
  };

  // ---------------------------------------------------------------- page 1
  header('Periodontal chart');
  const markup = renderToStaticMarkup(createElement(FullChart, { chart: exam.chart })).replaceAll('Helvetica, Arial, sans-serif', FONT);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px';
  host.innerHTML = markup;
  document.body.appendChild(host);
  const chartH = (CONTENT_W * fullChartHeight()) / FULL_W;
  try {
    await doc.svg(host.querySelector('svg')!, { x: M, y: 26, width: CONTENT_W, height: chartH });
  } finally {
    host.remove();
  }
  let y = 26 + chartH + 4;
  doc.setFontSize(7).setTextColor(...MUTED);
  const legend = doc.splitTextToSize(
    'Red line: gingival margin · Blue line: pocket base · Dashed: CEJ · Red dot: bleeding · Yellow: suppuration · Blue dot: plaque · Red cell: PD ≥ 5 mm · △ ◭ ▲ furcation I / II / III · GM negative = recession',
    CONTENT_W,
  );
  doc.text(legend, M, y);
  y += legend.length * 3 + 2;

  const s = d.summary;
  const pct = (v: number | null) => (v === null ? '–' : `${v.toFixed(0)} %`);
  const stats: [string, string][] = [
    ['Mean PD', `${formatNumber(s.meanPd)} mm`],
    ['Mean CAL', `${formatNumber(s.meanCal)} mm`],
    ['BOP', pct(s.bopPercent)],
    ['Plaque', pct(s.plaquePercent)],
    ['Sites PD ≥ 4', String(s.sitesPd4plus)],
    ['Sites PD ≥ 6', String(s.sitesPd6plus)],
    ['Max PD / CAL', `${s.maxPd ?? '–'} / ${s.maxCal ?? '–'} mm`],
    ['Teeth present', String(s.teethPresent)],
    ['Implants', String(s.implantCount)],
    ['Suppuration', `${s.suppurationSites} sites`],
  ];
  const boxW = CONTENT_W / 5;
  stats.forEach(([k, v], i) => {
    const bx = M + (i % 5) * boxW;
    const by = y + Math.floor(i / 5) * 12;
    doc.setFillColor(238, 242, 247).roundedRect(bx + 0.6, by, boxW - 1.2, 10.5, 1.2, 1.2, 'F');
    doc.setTextColor(27, 36, 48).setFont(FONT, 'bold').setFontSize(10).text(v, bx + 3, by + 5);
    doc.setTextColor(...MUTED).setFont(FONT, 'normal').setFontSize(6.5).text(k, bx + 3, by + 8.8);
  });
  y += 26;
  doc.setTextColor(27, 36, 48).setFontSize(7.5);
  const deep = deepSites(exam.chart);
  if (deep.length) {
    const lines = doc.splitTextToSize(`PD ≥ 5 mm (${deep.length} sites): ${deep.join(', ')}`, CONTENT_W);
    doc.text(lines.slice(0, 4), M, y);
    y += 4;
  }
  doc.setFont(FONT, 'bold').setFontSize(10).setTextColor(...PRIMARY);
  doc.text(`Diagnosis: ${final.label}`, M, Math.min(y + 6, PAGE_H - 14), { maxWidth: CONTENT_W });

  // ---------------------------------------------------------------- page 2
  doc.addPage();
  header('Periodontal diagnosis');
  y = 30;
  const ensure = (h: number) => {
    if (y + h > PAGE_H - 14) {
      doc.addPage();
      header('Periodontal diagnosis (continued)');
      y = 30;
    }
  };

  doc.setFillColor(final.overridden.length ? 255 : 219, final.overridden.length ? 241 : 231, final.overridden.length ? 214 : 243);
  const labelLines = doc.setFont(FONT, 'bold').setFontSize(13).splitTextToSize(final.label, CONTENT_W - 8);
  const boxH = 6 + labelLines.length * 6;
  doc.roundedRect(M, y - 5, CONTENT_W, boxH, 2, 2, 'F');
  doc.setTextColor(...PRIMARY).text(labelLines, M + 4, y + 1.5);
  y += boxH + 2;
  doc.setTextColor(27, 36, 48).setFont(FONT, 'normal').setFontSize(8.5);
  if (final.overridden.length) {
    const t = `Clinician override (${final.overridden.join(', ')}). Computed: ${d.label}${final.note ? `. Note: ${final.note}` : ''}`;
    const lines = doc.splitTextToSize(t, CONTENT_W);
    doc.text(lines, M, y);
    y += lines.length * 4 + 2;
  } else if (final.note) {
    doc.text(`Note: ${final.note}`, M, y);
    y += 6;
  }

  const section = (title: string, value: string, reasons: Reason[]) => {
    ensure(14);
    doc.setDrawColor(211, 218, 227).line(M, y, PAGE_W - M, y);
    y += 5;
    doc.setFont(FONT, 'bold').setFontSize(10).setTextColor(27, 36, 48).text(title, M, y);
    doc.setTextColor(...PRIMARY).text(value, M + doc.getTextWidth(title) + 3, y);
    y += 5;
    for (const r of reasons) {
      doc.setFont(FONT, r.decisive ? 'bold' : 'normal').setFontSize(8.5).setTextColor(27, 36, 48);
      const lines = doc.splitTextToSize(r.text, CONTENT_W - 8);
      ensure(lines.length * 3.8 + 1);
      doc.text(r.decisive ? '▶' : '•', M + 1.5, y);
      doc.text(lines, M + 6, y);
      y += lines.length * 3.8 + 1;
    }
    y += 1;
  };

  section('Case definition', d.caseDefinition.met ? 'met' : 'not met', d.caseDefinition.reasons);
  if (d.gingival) section(d.gingival.kind === 'health' ? 'Health' : 'Gingivitis', d.gingival.extent ?? '', d.gingival.reasons);
  if (d.stage) section('Stage', ROMAN[d.stage.value], d.stage.reasons);
  if (d.extent) section('Extent', EXTENT_LABEL[d.extent.value], d.extent.reasons);
  if (d.grade) section('Grade', d.grade.value, d.grade.reasons);
  if (d.status) section('Current status', STATUS_LABEL[d.status.value], d.status.reasons);
  if (d.notes.length) section('Notes', '', d.notes);

  // answers
  const i = data.inputs;
  const yn = (v: boolean | undefined) => (v === undefined ? '–' : v ? 'yes' : 'no');
  const answers: [string, string][] = [
    ['Age', i.age !== undefined ? `${i.age} years` : '–'],
    ['Teeth lost to periodontitis', i.teethLostToPerio !== undefined ? String(i.teethLostToPerio) : '–'],
    ['Radiographic bone loss (worst site)', i.rblPercent !== undefined ? `${i.rblPercent} % (${rblThird(i.rblPercent)})` : '–'],
    ['Vertical defect ≥ 3 mm', yn(i.verticalDefect3mm)],
    [
      'Previous records',
      i.previousRecord?.available
        ? `${i.previousRecord.changeMm ?? '?'} mm ${i.previousRecord.measure === 'bone' ? 'bone' : 'CAL'} loss over ${i.previousRecord.years ?? '?'} years`
        : i.previousRecord
          ? 'none'
          : '–',
    ],
    ['Smoking', i.smoking === 'ge10' ? '≥ 10/day' : i.smoking === 'lt10' ? '< 10/day' : i.smoking === 'none' ? 'non-smoker' : '–'],
    ['Diabetes', i.diabetes ? (i.diabetes.diabetic ? `yes${i.diabetes.hba1c !== undefined ? `, HbA1c ${i.diabetes.hba1c} %` : ''}` : 'no') : '–'],
    ['Non-periodontal attachment loss', i.nonPerioTeeth.length ? i.nonPerioTeeth.join(', ') : 'none'],
    [
      'Complexity',
      [
        i.complexity.masticatoryDysfunction && 'masticatory dysfunction',
        i.complexity.biteCollapse && 'bite collapse',
        i.complexity.driftingFlaring && 'drifting/flaring',
        i.complexity.ridgeDefect && i.complexity.ridgeDefect !== 'none' && `${i.complexity.ridgeDefect} ridge defect`,
        i.complexity.occlusalTrauma && 'secondary occlusal trauma',
      ]
        .filter(Boolean)
        .join(', ') || 'none stated',
    ],
  ];
  if (d.kind === 'periodontitis') {
    ensure(10 + answers.length * 4.5);
    doc.setDrawColor(211, 218, 227).line(M, y, PAGE_W - M, y);
    y += 5;
    doc.setFont(FONT, 'bold').setFontSize(10).text('Clinical information entered', M, y);
    y += 5;
    doc.setFontSize(8.5);
    for (const [k, v] of answers) {
      doc.setFont(FONT, 'normal').setTextColor(...MUTED).text(k, M, y);
      doc.setTextColor(27, 36, 48).text(v, M + 62, y);
      y += 4.5;
    }
  }

  ensure(24);
  y += 8;
  doc.setFontSize(8.5).setTextColor(27, 36, 48);
  doc.text('Signature: ______________________________', M, y);
  doc.text('Date: ________________', PAGE_W - M - 50, y);
  y += 8;
  doc.setFontSize(7).setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(
      'Classification according to the 2017 World Workshop on the Classification of Periodontal and Peri-Implant Diseases and Conditions (Caton et al. 2018; Papapanou et al. 2018; Tonetti et al. 2018; Chapple et al. 2018). Stability per EFP S3 guideline (Sanz et al. 2020).',
      CONTENT_W,
    ),
    M,
    y,
  );
  footers();
  return doc.output('blob');
}
