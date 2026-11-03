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
import { MOUNT_COLUMNS, PRESETS, surveyImageIds, surveyProgress, surveySlots, type RadiographSurvey } from '../../domain/radiographs';
import { getImage } from '../../storage/db';
import { jpegDataUrl } from '../radiographs/images';

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

export type PdfSection = 'chart' | 'diagnosis' | 'radiographs';
export const PDF_SECTIONS: PdfSection[] = ['chart', 'diagnosis', 'radiographs'];

/** Build a PDF with the given sections, in this order: chart, diagnosis, radiographs. */
export async function buildPdf(data: ReportData, sections: PdfSection[] = PDF_SECTIONS): Promise<Blob> {
  const wanted = PDF_SECTIONS.filter((x) => sections.includes(x));
  if (wanted.length === 0) throw new Error('Nothing to export');
  const [{ jsPDF }, { renderToStaticMarkup }] = await Promise.all([import('jspdf'), import('react-dom/server'), import('svg2pdf.js')]);
  const base = import.meta.env.BASE_URL;
  const [regular, bold] = await Promise.all([fontBase64(`${base}fonts/DejaVuSans.ttf`), fontBase64(`${base}fonts/DejaVuSans-Bold.ttf`)]);

  const orientationOf = (x: PdfSection) => (x === 'radiographs' ? 'landscape' : 'portrait');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: orientationOf(wanted[0]) });
  const pw = () => doc.internal.pageSize.getWidth();
  const ph = () => doc.internal.pageSize.getHeight();
  let fresh = true;
  /** Start a page: the first one already exists in the document. */
  const newPage = (o: 'portrait' | 'landscape') => {
    if (fresh) fresh = false;
    else doc.addPage('a4', o);
  };
  doc.addFileToVFS('DejaVuSans.ttf', regular);
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold);
  doc.addFont('DejaVuSans.ttf', FONT, 'normal');
  doc.addFont('DejaVuSans-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');

  const { exam, patient, diagnosis: d, final } = data;
  const age = data.inputs.age ?? (patient?.dateOfBirth ? ageOn(patient.dateOfBirth, exam.date) : undefined);
  const header = (title: string) => {
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pw(), 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(FONT, 'bold').setFontSize(13).text(title, M, 10.5);
    doc.setFont(FONT, 'normal').setFontSize(8).text('PerioDiag · 2017 AAP/EFP classification', pw() - M, 10.5, { align: 'right' });
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
      doc.text(`Generated ${new Date().toLocaleString()}  ·  Decision support only: the clinician is responsible for the diagnosis.`, M, ph() - 7);
      doc.text(`Page ${p} / ${n}`, pw() - M, ph() - 7, { align: 'right' });
    }
  };

  // ---------------------------------------------------------------- chart
  const chartSection = async () => {
    newPage('portrait');
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
  };

  // ---------------------------------------------------------------- diagnosis
  const diagnosisSection = () => {
    newPage('portrait');
    header('Periodontal diagnosis');
    let y = 30;
    const ensure = (h: number) => {
      if (y + h > PAGE_H - 14) {
        doc.addPage('a4', 'portrait');
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
  };

  // ---------------------------------------------------------------- radiographs
  const radiographSection = async () => {
    const survey = exam.radiographs;
    if (!survey) return;
    const images = await loadImages(survey);
    newPage('landscape');
    header('Full-mouth radiographic survey');
    const W = pw();
    const H = ph();
    const cw = W - 2 * M;
    const preset = PRESETS[survey.preset];
    const progress = surveyProgress(survey);
    doc.setFontSize(8.5).setTextColor(...MUTED);
    doc.text(
      `${preset.name}: ${preset.description}${survey.panoramic ? ' + panoramic' : ''}   ·   Radiographs taken: ${survey.date ?? exam.date}   ·   ${progress.filled} of ${progress.total} positions`,
      M,
      27,
    );

    const slots = surveySlots(survey);
    const rowIds = [0, 1, 2].filter((r) => slots.some((x) => x.row === r));
    const gap = 2.5;
    const top = 35;
    const avail = H - top - 14;
    const colW = (cw - (MOUNT_COLUMNS - 1) * gap) / MOUNT_COLUMNS;
    const rowH = Math.min((avail - (rowIds.length - 1) * gap) / rowIds.length, colW * 1.45 + 5);
    const mountH = rowIds.length * rowH + (rowIds.length - 1) * gap;
    const y0 = top;
    doc.setFillColor(36, 38, 42).roundedRect(M - 2, y0 - 2, cw + 4, mountH + 4, 2, 2, 'F');

    rowIds.forEach((r, ri) => {
      const by = y0 + ri * (rowH + gap);
      for (const slot of slots.filter((x) => x.row === r)) {
        const span = slot.span ?? 1;
        const bx = M + slot.col * (colW + gap);
        const bw = colW * span + gap * (span - 1);
        const bh = rowH - 5;
        const ref = survey.slots[slot.id];
        const img = ref ? images.get(ref.imageId) : undefined;
        if (img) {
          const scale = Math.min(bw / img.width, bh / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          doc.addImage(img.dataUrl, 'JPEG', bx + (bw - w) / 2, by + (bh - h) / 2, w, h, undefined, 'FAST');
        } else {
          doc.setDrawColor(90, 94, 100).setLineDashPattern([1, 1], 0).rect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
          doc.setLineDashPattern([], 0);
          doc.setFontSize(7).setTextColor(130, 136, 145).text(ref ? 'image missing' : 'not taken', bx + bw / 2, by + bh / 2, { align: 'center' });
        }
        doc.setFontSize(7).setTextColor(230, 232, 235);
        const kind = slot.kind === 'bw' ? 'BW' : slot.kind === 'pa' ? 'PA' : '';
        doc.text(`${slot.short} ${kind}${ref?.note ? ' ✎' : ''}`, bx + bw / 2, by + rowH - 1.5, { align: 'center' });
      }
    });
    doc.setFontSize(7).setTextColor(...MUTED);
    doc.text('Patient right', M, y0 - 3.5);
    doc.text('Patient left', W - M, y0 - 3.5, { align: 'right' });

    // notes and additional images
    const slotNotes = slots.filter((x) => survey.slots[x.id]?.note).map((x) => `${x.label} (${x.short}): ${survey.slots[x.id].note}`);
    if (survey.extras.length === 0 && slotNotes.length === 0 && !survey.notes) return;
    newPage('landscape');
    header('Full-mouth radiographic survey (continued)');
    let y = 28;
    const textBlock = (title: string, lines: string[]) => {
      doc.setFont(FONT, 'bold').setFontSize(10).setTextColor(27, 36, 48).text(title, M, y);
      y += 5;
      doc.setFont(FONT, 'normal').setFontSize(8.5);
      for (const l of lines) {
        const wrapped = doc.splitTextToSize(l, cw);
        doc.text(wrapped, M, y);
        y += wrapped.length * 3.8 + 1;
      }
      y += 3;
    };
    if (survey.notes) textBlock('Radiographic findings', [survey.notes]);
    if (slotNotes.length) textBlock('Image notes', slotNotes);
    if (survey.extras.length) {
      doc.setFont(FONT, 'bold').setFontSize(10).setTextColor(27, 36, 48).text('Additional images', M, y);
      y += 4;
      const cols = 4;
      const ew = (cw - (cols - 1) * 4) / cols;
      const eh = ew * 0.75;
      survey.extras.forEach((x, i) => {
        const col = i % cols;
        if (col === 0 && i > 0) y += eh + 10;
        if (y + eh + 8 > H - 14) {
          newPage('landscape');
          header('Full-mouth radiographic survey (continued)');
          y = 28;
        }
        const bx = M + col * (ew + 4);
        const img = images.get(x.imageId);
        doc.setFillColor(36, 38, 42).rect(bx, y, ew, eh, 'F');
        if (img) {
          const scale = Math.min(ew / img.width, eh / img.height);
          doc.addImage(img.dataUrl, 'JPEG', bx + (ew - img.width * scale) / 2, y + (eh - img.height * scale) / 2, img.width * scale, img.height * scale, undefined, 'FAST');
        }
        doc.setFont(FONT, 'normal').setFontSize(7.5).setTextColor(27, 36, 48);
        doc.text(doc.splitTextToSize(`${x.label}${x.note ? ` · ${x.note}` : ''}`, ew).slice(0, 2), bx, y + eh + 3.5);
      });
    }
  };

  for (const x of wanted) {
    if (x === 'chart') await chartSection();
    if (x === 'diagnosis') diagnosisSection();
    if (x === 'radiographs') await radiographSection();
  }
  if (fresh) throw new Error('Nothing to export');
  footers();
  return doc.output('blob');
}

/** Load the survey's images as size-capped JPEG data URLs for embedding. */
async function loadImages(survey: RadiographSurvey): Promise<Map<string, { dataUrl: string; width: number; height: number }>> {
  const out = new Map<string, { dataUrl: string; width: number; height: number }>();
  await Promise.all(
    surveyImageIds(survey).map(async (id) => {
      const im = await getImage(id);
      if (im) out.set(id, await jpegDataUrl(im.blob));
    }),
  );
  return out;
}
