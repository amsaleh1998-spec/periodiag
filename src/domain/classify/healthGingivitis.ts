// Periodontal health and plaque-induced gingivitis (Chapple, Mealey et al. 2018)
// for patients who do NOT meet the periodontitis case definition.
//   intact periodontium: health = BOP < 10 % and PD ≤ 3 mm; gingivitis = BOP ≥ 10 %
//   reduced periodontium (non-periodontitis patient, e.g. recession, crown
//   lengthening): same BOP thresholds, PD ≤ 3 mm
//   gingivitis extent: localized 10–30 % BOP, generalized > 30 %

import { calOf, isNatural, type Chart } from '../chart';
import type { ChartSummary } from '../metrics';
import { ALL_TEETH, SITES, type Fdi } from '../teeth';
import type { Reason } from './types';

export interface GingivalResult {
  kind: 'health' | 'gingivitis';
  extent?: 'localized' | 'generalized';
  reducedPeriodontium: boolean;
  reasons: Reason[];
}

const pct = (v: number) => `${v.toFixed(1)} %`;

/** Teeth with any attachment loss (CAL ≥ 1 mm), including teeth excluded as non-periodontal. */
export function teethWithAttachmentLoss(chart: Chart): Fdi[] {
  return ALL_TEETH.filter((t) => {
    const tooth = chart[t];
    return isNatural(tooth) && SITES.some((s) => (calOf(tooth.sites[s]) ?? 0) >= 1);
  });
}

export function classifyGingival(chart: Chart, summary: ChartSummary): GingivalResult {
  const reasons: Reason[] = [];
  const bop = summary.bopPercent ?? 0;
  const lossTeeth = teethWithAttachmentLoss(chart);
  const reduced = lossTeeth.length > 0;

  reasons.push(
    reduced
      ? {
          text: `Attachment loss present at ${lossTeeth.length} tooth/teeth (${lossTeeth.slice(0, 8).join(', ')}${lossTeeth.length > 8 ? '…' : ''}) without meeting the periodontitis case definition → reduced periodontium (non-periodontitis patient)`,
          source: 'chart',
        }
      : { text: 'No attachment loss → intact periodontium', source: 'chart' },
  );

  if (bop < 10) {
    reasons.push({ text: `BOP ${pct(bop)} < 10 %`, source: 'chart', decisive: true });
    if ((summary.maxPd ?? 0) <= 3) {
      reasons.push({ text: 'PD ≤ 3 mm at all sites', source: 'chart' });
    } else {
      reasons.push({
        text: `PD ≥ 4 mm at ${summary.sitesPd4plus} site(s) without periodontitis-level attachment loss (pseudopockets / gingival enlargement?): health strictly requires PD ≤ 3 mm, so review these sites`,
        source: 'chart',
      });
    }
    return { kind: 'health', reducedPeriodontium: reduced, reasons };
  }

  const extent = bop > 30 ? 'generalized' : 'localized';
  reasons.push({
    text: `BOP ${pct(bop)} ${extent === 'generalized' ? '> 30 % → generalized' : '10–30 % → localized'} gingivitis`,
    source: 'chart',
    decisive: true,
  });
  reasons.push({ text: 'Assumed dental plaque-induced; consider non-plaque-induced gingival conditions clinically', source: 'default' });
  return { kind: 'gingivitis', extent, reducedPeriodontium: reduced, reasons };
}

export function gingivalLabel(g: GingivalResult): string {
  const tissue = g.reducedPeriodontium ? 'on a reduced periodontium (non-periodontitis patient)' : 'intact periodontium';
  if (g.kind === 'health') {
    return g.reducedPeriodontium ? `Clinical gingival health ${tissue}` : `Periodontal health, ${tissue}`;
  }
  const ext = g.extent === 'generalized' ? 'Generalized' : 'Localized';
  return g.reducedPeriodontium ? `${ext} gingivitis ${tissue}` : `${ext} gingivitis, ${tissue}`;
}
