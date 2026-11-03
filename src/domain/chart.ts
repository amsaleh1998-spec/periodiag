// Periodontal chart data model and per-site calculations. Pure module.
//
// Gingival margin sign convention (Bern chart, decision D1):
//   gm < 0  → margin APICAL to the CEJ (recession of |gm| mm)
//   gm > 0  → margin CORONAL to the CEJ (e.g. swelling / overgrowth)
//   gm = 0 or empty → margin at the CEJ
// Therefore CAL = PD − GM, floored at 0 (a pocket base coronal to the CEJ
// means no attachment loss).

import {
  ALL_TEETH,
  INTERDENTAL_SITES,
  SITES,
  furcationEntrances,
  type Fdi,
  type FurcationEntrance,
  type SiteId,
} from './teeth';

export type ToothStatus = 'present' | 'missing' | 'implant';
export type Mobility = 0 | 1 | 2 | 3;
export type FurcationGrade = 0 | 1 | 2 | 3;

export interface SiteData {
  pd: number | null;
  gm: number | null;
  bop: boolean;
  plaque: boolean;
  supp: boolean;
}

export interface ToothData {
  status: ToothStatus;
  mobility: Mobility | null;
  furcation: Partial<Record<FurcationEntrance, FurcationGrade>>;
  sites: Record<SiteId, SiteData>;
}

export type Chart = Record<Fdi, ToothData>;

export const PD_MIN = 0;
export const PD_MAX = 19;
export const GM_MIN = -19;
export const GM_MAX = 19;

export function emptySite(): SiteData {
  return { pd: null, gm: null, bop: false, plaque: false, supp: false };
}

export function emptyTooth(status: ToothStatus = 'present'): ToothData {
  const sites = {} as Record<SiteId, SiteData>;
  for (const s of SITES) sites[s] = emptySite();
  return { status, mobility: null, furcation: {}, sites };
}

export function emptyChart(): Chart {
  const chart: Chart = {};
  for (const t of ALL_TEETH) chart[t] = emptyTooth();
  return chart;
}

/** Deep copy (charts are plain JSON data). */
export function cloneChart(chart: Chart): Chart {
  return JSON.parse(JSON.stringify(chart)) as Chart;
}

/** Raw CAL (PD − GM) without flooring; null when PD is not recorded. */
export function calRaw(site: SiteData): number | null {
  if (site.pd === null) return null;
  return site.pd - (site.gm ?? 0);
}

/** Clinical attachment level: PD − GM, floored at 0. Null when PD is not recorded. */
export function calOf(site: SiteData): number | null {
  const raw = calRaw(site);
  return raw === null ? null : Math.max(0, raw);
}

/** Recession in mm (positive number) or 0 if the margin is at/coronal to the CEJ. */
export function recessionOf(site: SiteData): number {
  return site.gm !== null && site.gm < 0 ? -site.gm : 0;
}

export function isNatural(tooth: ToothData | undefined): boolean {
  return tooth?.status === 'present';
}

export function presentNaturalTeeth(chart: Chart): Fdi[] {
  return ALL_TEETH.filter((t) => isNatural(chart[t]));
}

export function implantTeeth(chart: Chart): Fdi[] {
  return ALL_TEETH.filter((t) => chart[t]?.status === 'implant');
}

export function missingTeeth(chart: Chart): Fdi[] {
  return ALL_TEETH.filter((t) => chart[t]?.status === 'missing');
}

export function siteHasData(s: SiteData): boolean {
  return s.pd !== null || s.gm !== null || s.bop || s.plaque || s.supp;
}

export function toothHasData(tooth: ToothData): boolean {
  return SITES.some((s) => siteHasData(tooth.sites[s]));
}

/** Highest furcation grade over all entrances of the tooth (0 if none). */
export function toothFurcationMax(t: Fdi, tooth: ToothData): FurcationGrade {
  let max: FurcationGrade = 0;
  for (const e of furcationEntrances(t)) {
    const g = tooth.furcation[e] ?? 0;
    if (g > max) max = g;
  }
  return max;
}

/** Worst CAL at any of the given sites (null if none recorded). */
export function maxCalAt(tooth: ToothData, sites: readonly SiteId[]): number | null {
  let max: number | null = null;
  for (const s of sites) {
    const c = calOf(tooth.sites[s]);
    if (c !== null && (max === null || c > max)) max = c;
  }
  return max;
}

export function maxInterdentalCal(tooth: ToothData): number | null {
  return maxCalAt(tooth, INTERDENTAL_SITES);
}

export function maxPdOf(tooth: ToothData): number | null {
  let max: number | null = null;
  for (const s of SITES) {
    const pd = tooth.sites[s].pd;
    if (pd !== null && (max === null || pd > max)) max = pd;
  }
  return max;
}

/** Number of occluding tooth pairs (natural tooth or implant crown in both arches at the same position). */
export function opposingPairs(chart: Chart): number {
  let n = 0;
  for (const t of ALL_TEETH) {
    if (t >= 30) continue; // count each pair once, from the upper tooth
    const lower = t + (t < 20 ? 30 : 10); // 1x → 4x, 2x → 3x
    const occludes = (x: ToothData | undefined) => x !== undefined && x.status !== 'missing';
    if (occludes(chart[t]) && occludes(chart[lower])) n++;
  }
  return n;
}

export interface ChartComparison {
  /** Largest increase in interdental CAL at a site present in both charts (mm). */
  maxIncrease: number;
  tooth?: Fdi;
  site?: SiteId;
  comparedSites: number;
}

/** Compare interdental CAL between an earlier and the current chart (natural teeth present in both). */
export function compareCharts(previous: Chart, current: Chart): ChartComparison {
  let result: ChartComparison = { maxIncrease: 0, comparedSites: 0 };
  let found = false;
  for (const t of ALL_TEETH) {
    const a = previous[t];
    const b = current[t];
    if (!isNatural(a) || !isNatural(b)) continue;
    for (const s of INTERDENTAL_SITES) {
      const ca = calOf(a.sites[s]);
      const cb = calOf(b.sites[s]);
      if (ca === null || cb === null) continue;
      result.comparedSites++;
      const diff = cb - ca;
      if (!found || diff > result.maxIncrease) {
        result = { ...result, maxIncrease: diff, tooth: t, site: s };
        found = true;
      }
    }
  }
  if (found && result.maxIncrease < 0) result.maxIncrease = 0;
  return result;
}

export function clampPd(v: number): number {
  return Math.min(PD_MAX, Math.max(PD_MIN, Math.round(v)));
}

export function clampGm(v: number): number {
  return Math.min(GM_MAX, Math.max(GM_MIN, Math.round(v)));
}

// ------------------------------------------------------------ immutable edits

/** Return a new chart with one tooth replaced by `fn(tooth)`. */
export function updateTooth(chart: Chart, t: Fdi, fn: (tooth: ToothData) => ToothData): Chart {
  return { ...chart, [t]: fn(chart[t]) };
}

export function updateSite(chart: Chart, t: Fdi, s: SiteId, patch: Partial<SiteData>): Chart {
  return updateTooth(chart, t, (tooth) => ({ ...tooth, sites: { ...tooth.sites, [s]: { ...tooth.sites[s], ...patch } } }));
}

const STATUS_CYCLE: ToothStatus[] = ['present', 'missing', 'implant'];

export function nextStatus(s: ToothStatus): ToothStatus {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(s) + 1) % STATUS_CYCLE.length];
}

/** Changing the status keeps recorded values, except that a missing tooth is cleared. */
export function setStatus(chart: Chart, t: Fdi, status: ToothStatus): Chart {
  return updateTooth(chart, t, (tooth) =>
    status === 'missing' ? emptyTooth('missing') : { ...tooth, status, furcation: status === 'implant' ? {} : tooth.furcation },
  );
}

/** null → 0 → 1 → 2 → 3 → null */
export function nextMobility(m: Mobility | null): Mobility | null {
  if (m === null) return 0;
  return m === 3 ? null : ((m + 1) as Mobility);
}

/** 0 → I → II → III → 0 */
export function nextFurcation(g: FurcationGrade | undefined): FurcationGrade {
  return (((g ?? 0) + 1) % 4) as FurcationGrade;
}
