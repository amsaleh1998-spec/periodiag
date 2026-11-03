// Periodontitis case definition (Papapanou, Sanz et al. 2018):
// a patient is a periodontitis case if
//   (1) interdental CAL ≥ 2 mm is detectable at ≥ 2 non-adjacent teeth, or
//   (2) buccal or oral CAL ≥ 3 mm with pocketing > 3 mm is detectable at ≥ 2 teeth,
// and the attachment loss cannot be ascribed to non-periodontal causes.

import { calOf, isNatural, maxInterdentalCal, type Chart } from '../chart';
import { ALL_TEETH, MID_SITES, areAdjacent, type Fdi } from '../teeth';
import type { Reason } from './types';

export interface CaseDefinitionResult {
  met: boolean;
  ruleA: boolean;
  ruleB: boolean;
  /** Teeth with interdental CAL ≥ 2 mm (after exclusions). */
  interdentalTeeth: Fdi[];
  /** Teeth with buccal/oral CAL ≥ 3 mm and PD > 3 mm at the same site (after exclusions). */
  buccalOralTeeth: Fdi[];
  /** Teeth meeting either criterion before exclusions: what the wizard asks about. */
  candidateTeeth: Fdi[];
  /** Candidate teeth excluded by the clinician (non-periodontal cause). */
  excludedTeeth: Fdi[];
  nonAdjacentPair?: [Fdi, Fdi];
  reasons: Reason[];
}

interface Scan {
  interdental: Fdi[];
  buccalOral: Fdi[];
}

function scan(chart: Chart, excluded: Set<Fdi>): Scan {
  const interdental: Fdi[] = [];
  const buccalOral: Fdi[] = [];
  for (const t of ALL_TEETH) {
    const tooth = chart[t];
    if (!isNatural(tooth) || excluded.has(t)) continue;
    const ic = maxInterdentalCal(tooth);
    if (ic !== null && ic >= 2) interdental.push(t);
    const mid = MID_SITES.some((s) => {
      const site = tooth.sites[s];
      const cal = calOf(site);
      return cal !== null && cal >= 3 && site.pd !== null && site.pd > 3;
    });
    if (mid) buccalOral.push(t);
  }
  return { interdental, buccalOral };
}

function findNonAdjacentPair(teeth: Fdi[]): [Fdi, Fdi] | undefined {
  for (let i = 0; i < teeth.length; i++) {
    for (let j = i + 1; j < teeth.length; j++) {
      if (!areAdjacent(teeth[i], teeth[j])) return [teeth[i], teeth[j]];
    }
  }
  return undefined;
}

const list = (teeth: Fdi[]) => teeth.join(', ');

export function evaluateCaseDefinition(chart: Chart, nonPerioTeeth: Fdi[] = []): CaseDefinitionResult {
  const all = scan(chart, new Set());
  const candidateTeeth = [...new Set([...all.interdental, ...all.buccalOral])].sort(
    (a, b) => ALL_TEETH.indexOf(a) - ALL_TEETH.indexOf(b),
  );
  const excluded = new Set(nonPerioTeeth);
  const excludedTeeth = candidateTeeth.filter((t) => excluded.has(t));
  const { interdental, buccalOral } = scan(chart, excluded);

  const reasons: Reason[] = [];
  if (excludedTeeth.length) {
    reasons.push({
      text: `Excluded ${list(excludedTeeth)}: attachment loss attributed to non-periodontal causes`,
      source: 'wizard',
    });
  }

  const nonAdjacentPair = findNonAdjacentPair(interdental);
  const ruleA = nonAdjacentPair !== undefined;
  if (ruleA) {
    reasons.push({
      text: `Interdental CAL ≥ 2 mm at ${interdental.length} teeth (${list(interdental)}), including non-adjacent teeth ${nonAdjacentPair[0]} and ${nonAdjacentPair[1]}`,
      source: 'chart',
      decisive: true,
    });
  } else if (interdental.length >= 2) {
    reasons.push({ text: `Interdental CAL ≥ 2 mm only at adjacent teeth (${list(interdental)}): criterion 1 not met`, source: 'chart' });
  } else {
    reasons.push({
      text: `Interdental CAL ≥ 2 mm at ${interdental.length === 0 ? 'no tooth' : `only one tooth (${interdental[0]})`}: criterion 1 not met`,
      source: 'chart',
    });
  }

  const ruleB = buccalOral.length >= 2;
  reasons.push({
    text: ruleB
      ? `Buccal/oral CAL ≥ 3 mm with PD > 3 mm at ${buccalOral.length} teeth (${list(buccalOral)})`
      : `Buccal/oral CAL ≥ 3 mm with PD > 3 mm at ${buccalOral.length === 0 ? 'no tooth' : `only ${list(buccalOral)}`}: criterion 2 not met`,
    source: 'chart',
    decisive: ruleB && !ruleA,
  });

  const met = ruleA || ruleB;
  if (!met) {
    reasons.push({ text: 'Periodontitis case definition not met', source: 'chart', decisive: true });
  }

  return { met, ruleA, ruleB, interdentalTeeth: interdental, buccalOralTeeth: buccalOral, candidateTeeth, excludedTeeth, nonAdjacentPair, reasons };
}
