// Extent: localized (< 30 % of teeth involved), generalized (≥ 30 %), or
// molar-incisor pattern (involvement limited to first molars AND incisors). "Involved" = teeth at the stage-defining CAL level
// (decision D3): the CAL band of the worst interdental CAL (1–2, 3–4, ≥ 5 mm).

import { calOf, isNatural, maxInterdentalCal, type Chart } from '../chart';
import { ALL_TEETH, SITES, isFirstMolarOrIncisor, unit, type Fdi } from '../teeth';
import { calSeverity } from './staging';
import type { Extent, Finding, Reason } from './types';

export interface ExtentResult extends Finding<Extent> {
  involved: Fdi[];
  percent: number;
  /** CAL (mm) a tooth needs to count as involved. */
  threshold: number;
}

export function classifyExtent(chart: Chart, nonPerioTeeth: Fdi[] = []): ExtentResult {
  const skip = new Set(nonPerioTeeth);
  const present = ALL_TEETH.filter((t) => isNatural(chart[t]));
  const candidates = present.filter((t) => !skip.has(t));

  const interdental = new Map<Fdi, number>();
  for (const t of candidates) interdental.set(t, maxInterdentalCal(chart[t]) ?? 0);
  let worst = Math.max(0, ...interdental.values());

  // Case met only on buccal/oral sites: fall back to CAL at any site.
  let toothCal = (t: Fdi) => interdental.get(t) ?? 0;
  let basis = 'interdental CAL';
  if (worst < 1) {
    toothCal = (t: Fdi) => Math.max(0, ...SITES.map((s) => calOf(chart[t].sites[s]) ?? 0));
    worst = Math.max(0, ...candidates.map(toothCal));
    basis = 'CAL';
  }
  const band = calSeverity(worst);
  const threshold = band === 3 ? 5 : band === 2 ? 3 : 1;
  const involved = candidates.filter((t) => toothCal(t) >= threshold);
  const percent = present.length ? (100 * involved.length) / present.length : 0;

  const reasons: Reason[] = [];
  const share = `${involved.length} of ${present.length} teeth (${percent.toFixed(0)} %) have ${basis} ≥ ${threshold} mm, the stage-defining level`;
  reasons.push({ text: share, source: 'chart' });

  const mip =
    involved.length > 0 &&
    involved.every(isFirstMolarOrIncisor) &&
    involved.some((t) => unit(t) === 6) &&
    involved.some((t) => unit(t) <= 2);
  if (mip) {
    reasons.push({
      text: `Involvement limited to first molars and incisors (${involved.join(', ')}) → molar-incisor pattern`,
      source: 'chart',
      decisive: true,
    });
    return { value: 'molar-incisor', involved, percent, threshold, reasons };
  }
  const value: Extent = percent < 30 ? 'localized' : 'generalized';
  reasons[0] = { ...reasons[0], text: `${share} → ${value === 'localized' ? '< 30 %: localized' : '≥ 30 %: generalized'}`, decisive: true };
  return { value, involved, percent, threshold, reasons };
}
