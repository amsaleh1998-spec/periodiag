// Entry point of the classification module: chart + wizard answers → diagnosis
// with the reasoning behind every component. Pure functions only.

import type { Chart } from '../chart';
import { summarize, type ChartSummary } from '../metrics';
import { ALL_TEETH, SITES } from '../teeth';
import { evaluateCaseDefinition, type CaseDefinitionResult } from './caseDefinition';
import { classifyExtent, type ExtentResult } from './extent';
import { gradePeriodontitis, type GradeResult } from './grading';
import { classifyGingival, gingivalLabel, type GingivalResult } from './healthGingivitis';
import { classifyStatus } from './stability';
import { ROMAN, stagePeriodontitis, type StageResult } from './staging';
import type {
  ClinicalInputs,
  DiagnosisKind,
  Extent,
  Finding,
  Grade,
  History,
  Override,
  Reason,
  Stage,
  Status,
} from './types';

export * from './types';
export { evaluateCaseDefinition } from './caseDefinition';
export { calSeverity, chartFactors, rblSeverity, rblThird, ROMAN, toothLossSeverity } from './staging';
export { directGrade, indirectGrade } from './grading';

export interface Diagnosis {
  kind: DiagnosisKind;
  summary: ChartSummary;
  caseDefinition: CaseDefinitionResult;
  gingival?: GingivalResult;
  stage?: StageResult;
  extent?: ExtentResult;
  grade?: GradeResult;
  status?: Finding<Status>;
  /** Warnings and data-quality notes. */
  notes: Reason[];
  label: string;
}

export function classify(chart: Chart, inputs: ClinicalInputs, history: History = {}): Diagnosis {
  const summary = summarize(chart);
  const caseDefinition = evaluateCaseDefinition(chart, inputs.nonPerioTeeth);
  const notes: Reason[] = [];

  if (summary.teethPresent === 0) {
    return {
      kind: 'insufficient',
      summary,
      caseDefinition,
      notes: [{ text: 'No natural teeth charted: the periodontal classification does not apply', source: 'chart' }],
      label: 'No natural teeth: not classifiable',
    };
  }
  if (summary.sitesProbed === 0) {
    return {
      kind: 'insufficient',
      summary,
      caseDefinition,
      notes: [{ text: 'No probing depths recorded yet', source: 'chart' }],
      label: 'Insufficient data: chart probing depths first',
    };
  }
  const expected = summary.teethPresent * 6;
  if (summary.sitesProbed < expected) {
    notes.push({
      text: `Chart incomplete: ${summary.sitesProbed} of ${expected} sites on natural teeth probed. Unrecorded sites are treated as unknown`,
      source: 'chart',
    });
  }

  const blankGm = sitesWithoutGm(chart);
  if (blankGm > 0) {
    notes.push({
      text: `Gingival margin not recorded at ${blankGm} probed site(s): CAL = PD there (margin assumed at the CEJ). If the margin is coronal to the CEJ, as is normal in health, enter it as a positive GM or attachment loss is overestimated`,
      source: 'chart',
    });
  }

  if (!caseDefinition.met) {
    const gingival = classifyGingival(chart, summary);
    const d: Diagnosis = { kind: gingival.kind, summary, caseDefinition, gingival, notes, label: '' };
    d.label = finalize(d).label;
    return d;
  }

  const stage = stagePeriodontitis(chart, inputs, history);
  const extent = classifyExtent(chart, inputs.nonPerioTeeth);
  const grade = gradePeriodontitis(inputs);
  const status = classifyStatus(chart, summary);
  if (inputs.rblPercent === undefined) notes.push({ text: 'No radiographic bone loss entered: staging uses CAL only and grading cannot use % bone loss / age', source: 'default' });
  if (inputs.age === undefined) notes.push({ text: 'Patient age not entered', source: 'default' });

  const d: Diagnosis = { kind: 'periodontitis', summary, caseDefinition, stage, extent, grade, status, notes, label: '' };
  d.label = finalize(d).label;
  return d;
}

/** Probed sites (PD ≥ 2) on natural teeth with no gingival margin value. */
function sitesWithoutGm(chart: Chart): number {
  let n = 0;
  for (const t of ALL_TEETH) {
    const tooth = chart[t];
    if (tooth.status !== 'present') continue;
    for (const s of SITES) {
      const site = tooth.sites[s];
      if (site.pd !== null && site.pd >= 2 && site.gm === null) n++;
    }
  }
  return n;
}

// ------------------------------------------------------------------ output

export interface FinalDiagnosis {
  kind: DiagnosisKind;
  stage?: Stage;
  grade?: Grade;
  extent?: Extent;
  status?: Status;
  label: string;
  /** Components changed by the clinician. */
  overridden: string[];
  note?: string;
}

export const EXTENT_LABEL: Record<Extent, string> = {
  localized: 'Localized',
  generalized: 'Generalized',
  'molar-incisor': 'Molar-incisor pattern',
};

export const STATUS_LABEL: Record<Status, string> = {
  stable: 'currently stable',
  remission: 'currently in remission',
  unstable: 'currently unstable',
};

export function periodontitisLabel(p: { extent?: Extent; stage?: Stage; grade?: Grade; status?: Status }): string {
  const parts = ['Periodontitis'];
  if (p.extent) parts.push(EXTENT_LABEL[p.extent]);
  if (p.stage) parts.push(`Stage ${ROMAN[p.stage]}`);
  if (p.grade) parts.push(`Grade ${p.grade}`);
  if (p.status) parts.push(STATUS_LABEL[p.status]);
  return parts.join(', ');
}

/** Apply the clinician's override (if any) and build the final label. */
export function finalize(d: Diagnosis, o: Override = {}): FinalDiagnosis {
  const overridden: string[] = [];
  const pick = <T,>(name: string, computed: T | undefined, over: T | undefined): T | undefined => {
    if (over !== undefined && over !== computed) {
      overridden.push(name);
      return over;
    }
    return computed;
  };
  const kind = pick('diagnosis', d.kind, o.kind)!;
  const out: FinalDiagnosis = { kind, label: '', overridden, note: o.note };

  if (kind === 'periodontitis') {
    out.stage = pick('stage', d.stage?.value, o.stage);
    out.grade = pick('grade', d.grade?.value, o.grade);
    out.extent = pick('extent', d.extent?.value, o.extent);
    out.status = pick('status', d.status?.value, o.status);
    out.label = periodontitisLabel(out);
  } else if (kind === d.kind && d.gingival) {
    out.label = gingivalLabel(d.gingival);
  } else if (kind === 'gingivitis') {
    out.label = 'Gingivitis';
  } else if (kind === 'health') {
    out.label = 'Periodontal health';
  } else {
    out.label = d.label || 'Insufficient data';
  }
  if (o.label?.trim()) {
    overridden.push('label');
    out.label = o.label.trim();
  }
  return out;
}
