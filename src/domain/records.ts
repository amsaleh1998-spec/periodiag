// Patient / exam records and versioned JSON (de)serialisation. Pure module.

import { emptyChart, emptyTooth, type Chart, type ToothData } from './chart';
import { ALL_TEETH, SITES, furcationEntrances } from './teeth';
import { emptyInputs, type ClinicalInputs, type Override } from './classify/types';
import { PRESETS, emptySurvey, type ExtraRadiograph, type PresetId, type RadiographImageRef, type RadiographSurvey } from './radiographs';

/** v2 adds radiograph surveys and embedded images. v1 files are still accepted. */
export const SCHEMA_VERSION = 2;
export const APP_ID = 'periodiag';

export interface Patient {
  id: string;
  /** Name or pseudonymous code. */
  label: string;
  dateOfBirth?: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Exam {
  id: string;
  patientId: string;
  date: string; // YYYY-MM-DD
  examiner?: string;
  chart: Chart;
  inputs: ClinicalInputs;
  override?: Override;
  /** Full-mouth radiographic survey (images stored separately, referenced by id). */
  radiographs?: RadiographSurvey;
  /** Final diagnosis label and stage at the time of saving (for history: stage never goes down). */
  finalLabel?: string;
  finalStage?: 1 | 2 | 3 | 4;
  createdAt: string;
  updatedAt: string;
}

/** A radiograph embedded in an export file (base64 without the data: prefix). */
export interface ExportImage {
  id: string;
  examId: string;
  patientId: string;
  name: string;
  type: string;
  width: number;
  height: number;
  addedAt: string;
  data: string;
  thumb: string;
}

export interface ExportFile {
  app: typeof APP_ID;
  schemaVersion: number;
  exportedAt: string;
  patients: Patient[];
  exams: Exam[];
  images: ExportImage[];
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Age in whole years on a given date. */
export function ageOn(dateOfBirth: string, on: string): number | undefined {
  const b = new Date(dateOfBirth);
  const d = new Date(on);
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return undefined;
  let age = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
  return age >= 0 ? age : undefined;
}

export function yearsBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 24 * 3600 * 1000);
}

export function newPatient(label: string, dateOfBirth?: string): Patient {
  const now = new Date().toISOString();
  return { id: newId(), label, dateOfBirth, createdAt: now, updatedAt: now };
}

/** New exam; tooth status (missing / implant) is carried over from a previous exam if given. */
export function newExam(patientId: string, previous?: Exam): Exam {
  const now = new Date().toISOString();
  const chart = emptyChart();
  if (previous) {
    for (const t of ALL_TEETH) chart[t].status = previous.chart[t]?.status ?? 'present';
  }
  return { id: newId(), patientId, date: todayIso(), chart, inputs: emptyInputs(), createdAt: now, updatedAt: now };
}

export function buildExport(patients: Patient[], exams: Exam[], images: ExportImage[] = []): ExportFile {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), patients, exams, images };
}

// ---------------------------------------------------------------- validation

export class ImportError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function sanitizeTooth(t: number, raw: unknown): ToothData {
  const tooth = emptyTooth();
  if (!isObj(raw)) return tooth;
  if (raw.status === 'missing' || raw.status === 'implant' || raw.status === 'present') tooth.status = raw.status;
  const mob = numOrNull(raw.mobility);
  tooth.mobility = mob !== null && mob >= 0 && mob <= 3 ? (Math.round(mob) as 0 | 1 | 2 | 3) : null;
  if (isObj(raw.furcation)) {
    for (const e of furcationEntrances(t)) {
      const g = numOrNull(raw.furcation[e]);
      if (g !== null && g >= 0 && g <= 3) tooth.furcation[e] = Math.round(g) as 0 | 1 | 2 | 3;
    }
  }
  if (isObj(raw.sites)) {
    for (const s of SITES) {
      const site = raw.sites[s];
      if (!isObj(site)) continue;
      tooth.sites[s] = {
        pd: numOrNull(site.pd),
        gm: numOrNull(site.gm),
        bop: site.bop === true,
        plaque: site.plaque === true,
        supp: site.supp === true,
      };
    }
  }
  return tooth;
}

export function sanitizeChart(raw: unknown): Chart {
  const chart = emptyChart();
  if (!isObj(raw)) return chart;
  for (const t of ALL_TEETH) chart[t] = sanitizeTooth(t, raw[String(t)]);
  return chart;
}

function sanitizeInputs(raw: unknown): ClinicalInputs {
  const base = emptyInputs();
  if (!isObj(raw)) return base;
  // Inputs are a flat-ish bag of optional answers; keep known keys, trust primitive types.
  const merged = { ...base, ...raw, complexity: { ...base.complexity, ...(isObj(raw.complexity) ? raw.complexity : {}) } };
  merged.nonPerioTeeth = Array.isArray(raw.nonPerioTeeth)
    ? raw.nonPerioTeeth.filter((t): t is number => typeof t === 'number' && ALL_TEETH.includes(t))
    : [];
  return merged as ClinicalInputs;
}

function sanitizeRef(raw: unknown): RadiographImageRef | null {
  if (!isObj(raw) || !isStr(raw.imageId)) return null;
  return {
    imageId: raw.imageId,
    fileName: isStr(raw.fileName) ? raw.fileName : undefined,
    addedAt: isStr(raw.addedAt) ? raw.addedAt : new Date().toISOString(),
    note: isStr(raw.note) ? raw.note : undefined,
  };
}

export function sanitizeSurvey(raw: unknown): RadiographSurvey | undefined {
  if (!isObj(raw)) return undefined;
  const preset: PresetId = isStr(raw.preset) && raw.preset in PRESETS ? (raw.preset as PresetId) : 'fmx18';
  const survey = emptySurvey(preset);
  survey.panoramic = raw.panoramic === true;
  survey.date = isStr(raw.date) ? raw.date : undefined;
  survey.notes = isStr(raw.notes) ? raw.notes : undefined;
  if (isObj(raw.slots)) {
    for (const [k, v] of Object.entries(raw.slots)) {
      const ref = sanitizeRef(v);
      if (ref) survey.slots[k] = ref;
    }
  }
  if (Array.isArray(raw.extras)) {
    survey.extras = raw.extras
      .map((e): ExtraRadiograph | null => {
        const ref = sanitizeRef(e);
        return ref && isObj(e) && isStr(e.id) ? { ...ref, id: e.id, label: isStr(e.label) ? e.label : 'Radiograph' } : null;
      })
      .filter((e): e is ExtraRadiograph => e !== null);
  }
  return survey;
}

export function parseImport(text: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JSON.');
  }
  if (!isObj(data) || data.app !== APP_ID) throw new ImportError('This is not a PerioDiag export file.');
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(`Unsupported schema version ${String(data.schemaVersion)}. Please update the app.`);
  }
  if (!Array.isArray(data.patients) || !Array.isArray(data.exams)) {
    throw new ImportError('The file has no patients/exams lists.');
  }
  const now = new Date().toISOString();
  const patients: Patient[] = data.patients.map((p, i) => {
    if (!isObj(p) || !isStr(p.id) || !isStr(p.label)) throw new ImportError(`Patient #${i + 1} is malformed.`);
    return {
      id: p.id,
      label: p.label,
      dateOfBirth: isStr(p.dateOfBirth) ? p.dateOfBirth : undefined,
      notes: isStr(p.notes) ? p.notes : undefined,
      createdAt: isStr(p.createdAt) ? p.createdAt : now,
      updatedAt: isStr(p.updatedAt) ? p.updatedAt : now,
    };
  });
  const ids = new Set(patients.map((p) => p.id));
  const exams: Exam[] = data.exams.map((e, i) => {
    if (!isObj(e) || !isStr(e.id) || !isStr(e.patientId) || !isStr(e.date)) {
      throw new ImportError(`Exam #${i + 1} is malformed.`);
    }
    if (!ids.has(e.patientId)) throw new ImportError(`Exam #${i + 1} refers to an unknown patient.`);
    return {
      id: e.id,
      patientId: e.patientId,
      date: e.date,
      examiner: isStr(e.examiner) ? e.examiner : undefined,
      chart: sanitizeChart(e.chart),
      inputs: sanitizeInputs(e.inputs),
      override: isObj(e.override) ? (e.override as Override) : undefined,
      radiographs: sanitizeSurvey(e.radiographs),
      finalLabel: isStr(e.finalLabel) ? e.finalLabel : undefined,
      finalStage: [1, 2, 3, 4].includes(e.finalStage as number) ? (e.finalStage as 1 | 2 | 3 | 4) : undefined,
      createdAt: isStr(e.createdAt) ? e.createdAt : now,
      updatedAt: isStr(e.updatedAt) ? e.updatedAt : now,
    };
  });
  const examIds = new Set(exams.map((e) => e.id));
  const images: ExportImage[] = (Array.isArray(data.images) ? data.images : []).map((im, i) => {
    if (!isObj(im) || !isStr(im.id) || !isStr(im.examId) || !isStr(im.data) || !isStr(im.type)) {
      throw new ImportError(`Image #${i + 1} is malformed.`);
    }
    if (!examIds.has(im.examId)) throw new ImportError(`Image #${i + 1} refers to an unknown exam.`);
    if (!im.type.startsWith('image/')) throw new ImportError(`Image #${i + 1} is not an image (${im.type}).`);
    return {
      id: im.id,
      examId: im.examId,
      patientId: isStr(im.patientId) ? im.patientId : exams.find((e) => e.id === im.examId)!.patientId,
      name: isStr(im.name) ? im.name : 'radiograph',
      type: im.type,
      width: typeof im.width === 'number' ? im.width : 0,
      height: typeof im.height === 'number' ? im.height : 0,
      addedAt: isStr(im.addedAt) ? im.addedAt : now,
      data: im.data,
      thumb: isStr(im.thumb) ? im.thumb : im.data,
    };
  });
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: isStr(data.exportedAt) ? data.exportedAt : now, patients, exams, images };
}
