import { emptyChart, type Chart, type FurcationGrade, type Mobility, type SiteData } from '../src/domain/chart';
import { ALL_TEETH, SITES, type Fdi, type FurcationEntrance, type SiteId } from '../src/domain/teeth';

export interface ToothSpec {
  /** Applied to all 6 sites. */
  all?: Partial<SiteData>;
  /** Applied per site (after `all`). */
  sites?: Partial<Record<SiteId, Partial<SiteData>>>;
  mobility?: Mobility;
  furcation?: Partial<Record<FurcationEntrance, FurcationGrade>>;
}

export interface ChartSpec {
  missing?: Fdi[];
  implants?: Fdi[];
  /** Applied to every present natural tooth. Default: PD 2, GM 0, no flags. */
  base?: Partial<SiteData>;
  teeth?: Record<number, ToothSpec>;
  /** Teeth with BOP at every site (convenience). */
  bopTeeth?: Fdi[];
}

/** Build a fully probed chart: healthy by default, with the given deviations. */
export function makeChart(spec: ChartSpec = {}): Chart {
  const chart = emptyChart();
  for (const t of ALL_TEETH) {
    const tooth = chart[t];
    if (spec.missing?.includes(t)) {
      tooth.status = 'missing';
      continue;
    }
    if (spec.implants?.includes(t)) tooth.status = 'implant';
    const ts = spec.teeth?.[t];
    for (const s of SITES) {
      tooth.sites[s] = {
        ...tooth.sites[s],
        pd: 2,
        gm: 0,
        ...spec.base,
        ...(spec.bopTeeth?.includes(t) ? { bop: true } : {}),
        ...ts?.all,
        ...ts?.sites?.[s],
      };
    }
    if (ts?.mobility !== undefined) tooth.mobility = ts.mobility;
    if (ts?.furcation) tooth.furcation = { ...ts.furcation };
  }
  return chart;
}

/** Interdental attachment loss: PD and recession at all 4 interdental sites. */
export function interdental(pd: number, gm = 0): ToothSpec {
  const v = { pd, gm };
  return { sites: { MB: v, DB: v, ML: v, DL: v } };
}

