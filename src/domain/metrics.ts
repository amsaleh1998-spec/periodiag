// Whole-mouth summary statistics. Pure module.
// Natural teeth only; implants are summarised separately.

import { calOf, isNatural, maxInterdentalCal, toothHasData, type Chart, type SiteData } from './chart';
import { ALL_TEETH, SITES, type Fdi } from './teeth';

export interface SiteStats {
  /** Teeth with at least one recorded value. */
  teethExamined: number;
  /** 6 × teeth examined: denominator for % BOP and % plaque. */
  sites: number;
  /** Sites with a recorded PD: denominator for the means. */
  sitesProbed: number;
  meanPd: number | null;
  meanCal: number | null;
  bopSites: number;
  bopPercent: number | null;
  plaqueSites: number;
  plaquePercent: number | null;
  suppurationSites: number;
  sitesPd4plus: number;
  sitesPd5plus: number;
  sitesPd6plus: number;
  maxPd: number | null;
  maxCal: number | null;
}

export interface ChartSummary extends SiteStats {
  teethPresent: number;
  teethMissing: number;
  implantCount: number;
  /** Same statistics computed over implant sites. */
  implants: SiteStats;
}

function statsFor(chart: Chart, teeth: Fdi[]): SiteStats {
  let teethExamined = 0;
  let sitesProbed = 0;
  let pdSum = 0;
  let calSum = 0;
  let bop = 0;
  let plaque = 0;
  let supp = 0;
  let pd4 = 0;
  let pd5 = 0;
  let pd6 = 0;
  let maxPd: number | null = null;
  let maxCal: number | null = null;

  for (const t of teeth) {
    const tooth = chart[t];
    if (!toothHasData(tooth)) continue;
    teethExamined++;
    for (const s of SITES) {
      const site: SiteData = tooth.sites[s];
      if (site.bop) bop++;
      if (site.plaque) plaque++;
      if (site.supp) supp++;
      if (site.pd === null) continue;
      sitesProbed++;
      pdSum += site.pd;
      const cal = calOf(site) ?? 0;
      calSum += cal;
      if (site.pd >= 4) pd4++;
      if (site.pd >= 5) pd5++;
      if (site.pd >= 6) pd6++;
      if (maxPd === null || site.pd > maxPd) maxPd = site.pd;
      if (maxCal === null || cal > maxCal) maxCal = cal;
    }
  }
  const sites = teethExamined * 6;
  const pct = (n: number) => (sites > 0 ? (100 * n) / sites : null);
  return {
    teethExamined,
    sites,
    sitesProbed,
    meanPd: sitesProbed > 0 ? pdSum / sitesProbed : null,
    meanCal: sitesProbed > 0 ? calSum / sitesProbed : null,
    bopSites: bop,
    bopPercent: pct(bop),
    plaqueSites: plaque,
    plaquePercent: pct(plaque),
    suppurationSites: supp,
    sitesPd4plus: pd4,
    sitesPd5plus: pd5,
    sitesPd6plus: pd6,
    maxPd,
    maxCal,
  };
}

export function summarize(chart: Chart): ChartSummary {
  const natural = ALL_TEETH.filter((t) => isNatural(chart[t]));
  const implants = ALL_TEETH.filter((t) => chart[t]?.status === 'implant');
  return {
    ...statsFor(chart, natural),
    teethPresent: natural.length,
    teethMissing: ALL_TEETH.filter((t) => chart[t]?.status === 'missing').length,
    implantCount: implants.length,
    implants: statsFor(chart, implants),
  };
}

/** Per-tooth worst interdental CAL for the natural teeth (used by charts and extent). */
export function interdentalCalByTooth(chart: Chart): Map<Fdi, number> {
  const out = new Map<Fdi, number>();
  for (const t of ALL_TEETH) {
    if (!isNatural(chart[t])) continue;
    const c = maxInterdentalCal(chart[t]);
    if (c !== null) out.set(t, c);
  }
  return out;
}

export function formatNumber(v: number | null, digits = 1): string {
  return v === null ? '–' : v.toFixed(digits);
}
