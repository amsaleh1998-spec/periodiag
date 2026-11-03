// Staging (Tonetti, Greenwell & Kornman 2018).
// Severity: worst interdental CAL, radiographic bone loss, tooth loss due to
// periodontitis. Complexity factors can only shift the stage UP. The stage is
// also never lower than a stage diagnosed at an earlier exam.

import { calOf, isNatural, maxInterdentalCal, maxPdOf, opposingPairs, toothFurcationMax, type Chart } from '../chart';
import { ALL_TEETH, INTERDENTAL_SITES, siteLabel, type Fdi } from '../teeth';
import type { ClinicalInputs, Finding, History, Reason, Source, Stage } from './types';

export const ROMAN: Record<Stage, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

/** Severity from interdental CAL at the site of greatest loss. */
export function calSeverity(cal: number): Stage {
  if (cal >= 5) return 3;
  if (cal >= 3) return 2;
  return 1;
}

/** Severity from radiographic bone loss (% of root length). */
export function rblSeverity(percent: number): Stage {
  if (percent > 33) return 3;
  if (percent >= 15) return 2;
  return 1;
}

export function rblThird(percent: number): 'coronal third' | 'middle third' | 'apical third' {
  if (percent > 66) return 'apical third';
  if (percent > 33) return 'middle third';
  return 'coronal third';
}

/** Minimum stage implied by teeth lost to periodontitis (undefined when none). */
export function toothLossSeverity(n: number): Stage | undefined {
  if (n >= 5) return 4;
  if (n >= 1) return 3;
  return undefined;
}

export interface ChartFactors {
  maxInterdentalCal: number | null;
  worstSite?: { tooth: Fdi; site: string };
  maxPd: number | null;
  maxPdTooth?: Fdi;
  furcationTeeth: Fdi[]; // furcation II or III
  mobilityTeeth: Fdi[]; // mobility ≥ 2
  opposingPairs: number;
  remainingTeeth: number;
}

export function chartFactors(chart: Chart, excluded: Fdi[] = []): ChartFactors {
  const skip = new Set(excluded);
  const f: ChartFactors = {
    maxInterdentalCal: null,
    maxPd: null,
    furcationTeeth: [],
    mobilityTeeth: [],
    opposingPairs: opposingPairs(chart),
    remainingTeeth: ALL_TEETH.filter((t) => isNatural(chart[t])).length,
  };
  for (const t of ALL_TEETH) {
    const tooth = chart[t];
    if (!isNatural(tooth)) continue;
    if (toothFurcationMax(t, tooth) >= 2) f.furcationTeeth.push(t);
    if ((tooth.mobility ?? 0) >= 2) f.mobilityTeeth.push(t);
    if (skip.has(t)) continue;
    const ic = maxInterdentalCal(tooth);
    if (ic !== null && (f.maxInterdentalCal === null || ic > f.maxInterdentalCal)) {
      f.maxInterdentalCal = ic;
      const site = INTERDENTAL_SITES.find((s) => calOf(tooth.sites[s]) === ic)!;
      f.worstSite = { tooth: t, site: siteLabel(t, site) };
    }
    const pd = maxPdOf(tooth);
    if (pd !== null && (f.maxPd === null || pd > f.maxPd)) {
      f.maxPd = pd;
      f.maxPdTooth = t;
    }
  }
  return f;
}

export interface StageResult extends Finding<Stage> {
  /** Stage from severity alone (before complexity and history). */
  severity: Stage;
  factors: ChartFactors;
}

/** Keeps the running stage; each step can only raise it and records why. */
class Ladder {
  value: Stage = 1;
  reasons: Reason[] = [];
  private decisive: Reason | undefined;

  note(text: string, source: Source) {
    this.reasons.push({ text, source });
  }

  /** Record a criterion implying at least `stage`; raise if higher. */
  raise(stage: Stage, text: string, source: Source) {
    const r: Reason = { text, source };
    this.reasons.push(r);
    if (!this.decisive || stage > this.value) {
      this.value = Math.max(this.value, stage) as Stage;
      this.decisive = r;
    }
  }

  finish(): Reason[] {
    if (this.decisive) this.decisive.decisive = true;
    return this.reasons;
  }
}

export function stagePeriodontitis(chart: Chart, inputs: ClinicalInputs, history: History = {}): StageResult {
  const factors = chartFactors(chart, inputs.nonPerioTeeth);
  const L = new Ladder();
  const cx = inputs.complexity ?? {};

  // ---- severity
  if (factors.maxInterdentalCal !== null && factors.maxInterdentalCal > 0) {
    const s = calSeverity(factors.maxInterdentalCal);
    const band = s === 3 ? '≥ 5 mm' : s === 2 ? '3–4 mm' : '1–2 mm';
    L.raise(
      s,
      `Worst interdental CAL ${factors.maxInterdentalCal} mm (${factors.worstSite?.tooth} ${factors.worstSite?.site}) → CAL ${band}: Stage ${s === 3 ? 'III/IV' : ROMAN[s]} severity`,
      'chart',
    );
  } else {
    L.raise(1, 'No interdental CAL ≥ 1 mm (case met on buccal/oral sites) → Stage I severity', 'chart');
  }
  const calStage = L.value;

  if (inputs.rblPercent !== undefined) {
    const s = rblSeverity(inputs.rblPercent);
    const txt = `Radiographic bone loss ${inputs.rblPercent} % (${rblThird(inputs.rblPercent)}) → Stage ${s === 3 ? 'III/IV' : ROMAN[s]} severity`;
    L.raise(s, s > calStage ? `${txt}; higher than the CAL-based stage, so the higher stage is used` : txt, 'wizard');
  }

  if (inputs.teethLostToPerio === undefined) {
    L.note('Tooth loss due to periodontitis not stated: assumed none', 'default');
  } else if (inputs.teethLostToPerio === 0) {
    L.note('No tooth loss due to periodontitis', 'wizard');
  } else {
    const s = toothLossSeverity(inputs.teethLostToPerio)!;
    L.raise(s, `${inputs.teethLostToPerio} tooth/teeth lost due to periodontitis (${s === 4 ? '≥ 5' : '1–4'}) → at least Stage ${ROMAN[s]}`, 'wizard');
  }
  const severity = L.value;

  // ---- complexity up to stage III
  if (factors.maxPd !== null && factors.maxPd >= 6) {
    L.raise(3, `Max PD ${factors.maxPd} mm (tooth ${factors.maxPdTooth}) ≥ 6 mm → at least Stage III`, 'chart');
  } else if (factors.maxPd === 5) {
    L.raise(2, `Max PD 5 mm (tooth ${factors.maxPdTooth}) → at least Stage II`, 'chart');
  }
  if (inputs.verticalDefect3mm) L.raise(3, 'Vertical bone defect ≥ 3 mm → at least Stage III', 'wizard');
  if (factors.furcationTeeth.length) {
    L.raise(3, `Furcation involvement class II/III (${factors.furcationTeeth.join(', ')}) → at least Stage III`, 'chart');
  }
  if (cx.ridgeDefect === 'moderate') L.raise(3, 'Moderate ridge defect → at least Stage III', 'wizard');

  // ---- complexity stage IV: shifts III → IV (the severity band of III and IV is the same)
  const ivFactors: { text: string; source: Source }[] = [];
  if (cx.masticatoryDysfunction) ivFactors.push({ text: 'masticatory dysfunction', source: 'wizard' });
  const trauma = cx.occlusalTrauma ?? factors.mobilityTeeth.length > 0;
  if (trauma) {
    ivFactors.push(
      cx.occlusalTrauma === undefined
        ? { text: `secondary occlusal trauma (mobility ≥ 2 at ${factors.mobilityTeeth.join(', ')})`, source: 'chart' }
        : { text: 'secondary occlusal trauma', source: 'wizard' },
    );
  }
  if (cx.ridgeDefect === 'severe') ivFactors.push({ text: 'severe ridge defect', source: 'wizard' });
  if (cx.biteCollapse) ivFactors.push({ text: 'bite collapse', source: 'wizard' });
  if (cx.driftingFlaring) ivFactors.push({ text: 'drifting / flaring', source: 'wizard' });
  const pairs = cx.opposingPairs ?? factors.opposingPairs;
  if (pairs < 10) {
    ivFactors.push({
      text: `fewer than 10 opposing pairs (${pairs}; ${factors.remainingTeeth} natural teeth remaining)`,
      source: cx.opposingPairs === undefined ? 'chart' : 'wizard',
    });
  }
  if (ivFactors.length) {
    const names = ivFactors.map((f) => f.text).join(', ');
    const src = ivFactors.some((f) => f.source === 'wizard') ? 'wizard' : 'chart';
    if (L.value >= 3) {
      L.raise(4, `Need for complex rehabilitation: ${names} → Stage IV`, src);
    } else {
      L.note(`Stage IV complexity factor(s) present (${names}) but severity is below Stage III: not applied. Clinician to review`, src);
    }
  }

  // ---- history: the stage is never downgraded
  if (history.previousMaxStage && history.previousMaxStage > L.value) {
    L.raise(
      history.previousMaxStage,
      `Stage ${ROMAN[history.previousMaxStage]} diagnosed previously${history.previousMaxStageDate ? ` (${history.previousMaxStageDate})` : ''}: the stage is never downgraded`,
      'history',
    );
  } else if (history.previousMaxStage) {
    L.note(`Previously diagnosed Stage ${ROMAN[history.previousMaxStage]}: not higher than the current stage`, 'history');
  }

  return { value: L.value, severity, factors, reasons: L.finish() };
}
