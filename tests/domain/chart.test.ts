import { describe, expect, it } from 'vitest';
import {
  calOf,
  calRaw,
  compareCharts,
  emptySite,
  opposingPairs,
  recessionOf,
  setStatus,
  toothFurcationMax,
} from '../../src/domain/chart';
import { summarize } from '../../src/domain/metrics';
import { antagonist, areAdjacent, furcationEntrances, siteScreenOrder, toothType } from '../../src/domain/teeth';
import { makeChart } from '../helpers';

describe('teeth', () => {
  it('classifies tooth types', () => {
    expect(toothType(11)).toBe('incisor');
    expect(toothType(43)).toBe('canine');
    expect(toothType(25)).toBe('premolar');
    expect(toothType(38)).toBe('molar');
  });

  it('treats neighbours in the arch as adjacent, including across the midline', () => {
    expect(areAdjacent(11, 21)).toBe(true);
    expect(areAdjacent(31, 41)).toBe(true);
    expect(areAdjacent(16, 17)).toBe(true);
    expect(areAdjacent(16, 14)).toBe(false); // a gap of one tooth position
    expect(areAdjacent(16, 46)).toBe(false); // different arches
    expect(areAdjacent(18, 28)).toBe(false);
  });

  it('finds antagonists', () => {
    expect(antagonist(16)).toBe(46);
    expect(antagonist(24)).toBe(34);
    expect(antagonist(37)).toBe(27);
  });

  it('lists furcation entrances per tooth type', () => {
    expect(furcationEntrances(16)).toEqual(['B', 'MP', 'DP']);
    expect(furcationEntrances(36)).toEqual(['B', 'L']);
    expect(furcationEntrances(14)).toEqual(['M', 'D']);
    expect(furcationEntrances(44)).toEqual([]);
    expect(furcationEntrances(11)).toEqual([]);
  });

  it('orders sites distal-first on the patient right side of the screen', () => {
    expect(siteScreenOrder(16, 'buccal')).toEqual(['DB', 'B', 'MB']);
    expect(siteScreenOrder(26, 'buccal')).toEqual(['MB', 'B', 'DB']);
    expect(siteScreenOrder(46, 'oral')).toEqual(['DL', 'L', 'ML']);
    expect(siteScreenOrder(36, 'oral')).toEqual(['ML', 'L', 'DL']);
  });
});

describe('CAL (GM negative = recession)', () => {
  const site = (pd: number | null, gm: number | null) => ({ ...emptySite(), pd, gm });

  it('adds recession to the probing depth', () => {
    expect(calOf(site(4, -2))).toBe(6);
    expect(recessionOf(site(4, -2))).toBe(2);
  });

  it('subtracts a margin coronal to the CEJ', () => {
    expect(calOf(site(4, 2))).toBe(2);
    expect(recessionOf(site(4, 2))).toBe(0);
  });

  it('floors CAL at 0 when the pocket base is coronal to the CEJ', () => {
    expect(calRaw(site(3, 4))).toBe(-1);
    expect(calOf(site(3, 4))).toBe(0);
  });

  it('treats an empty GM as margin at the CEJ', () => {
    expect(calOf(site(5, null))).toBe(5);
  });

  it('is undefined without a probing depth', () => {
    expect(calOf(site(null, -3))).toBeNull();
  });
});

describe('chart helpers', () => {
  it('counts occluding pairs, implants included', () => {
    expect(opposingPairs(makeChart())).toBe(16);
    expect(opposingPairs(makeChart({ missing: [16, 46, 17], implants: [36] }))).toBe(14);
  });

  it('clears data when a tooth is marked missing', () => {
    const c = setStatus(makeChart(), 16, 'missing');
    expect(c[16].status).toBe('missing');
    expect(c[16].sites.MB.pd).toBeNull();
  });

  it('takes the worst furcation entrance', () => {
    const c = makeChart({ teeth: { 16: { furcation: { B: 1, DP: 2 } } } });
    expect(toothFurcationMax(16, c[16])).toBe(2);
  });

  it('finds the worst interdental CAL increase between two charts', () => {
    const before = makeChart();
    const after = makeChart({ teeth: { 16: { sites: { MB: { pd: 5, gm: -1 } } } } });
    const cmp = compareCharts(before, after);
    expect(cmp.maxIncrease).toBe(4);
    expect(cmp.tooth).toBe(16);
    expect(cmp.site).toBe('MB');
  });
});

describe('summary metrics', () => {
  it('computes means and percentages over natural teeth', () => {
    const c = makeChart({
      missing: [18, 28, 38, 48],
      teeth: {
        16: { all: { pd: 6, gm: -1, bop: true } },
        26: { sites: { MB: { pd: 4, plaque: true } } },
      },
    });
    const s = summarize(c);
    expect(s.teethPresent).toBe(28);
    expect(s.sites).toBe(168);
    expect(s.sitesPd4plus).toBe(7);
    expect(s.sitesPd6plus).toBe(6);
    expect(s.bopSites).toBe(6);
    expect(s.bopPercent).toBeCloseTo((6 / 168) * 100);
    expect(s.plaquePercent).toBeCloseTo((1 / 168) * 100);
    // 161 sites at PD 2 + 6 × 6 + 1 × 4
    expect(s.meanPd).toBeCloseTo((161 * 2 + 36 + 4) / 168);
    expect(s.meanCal).toBeCloseTo((161 * 2 + 6 * 7 + 4) / 168);
    expect(s.maxCal).toBe(7);
  });

  it('keeps implants out of the tooth statistics', () => {
    const s = summarize(makeChart({ implants: [36], teeth: { 36: { all: { pd: 7, bop: true } } } }));
    expect(s.teethPresent).toBe(31);
    expect(s.bopSites).toBe(0);
    expect(s.implants.bopSites).toBe(6);
    expect(s.implants.maxPd).toBe(7);
  });

  it('handles an empty chart', () => {
    const s = summarize(makeChart({ base: { pd: null, gm: null } }));
    expect(s.meanPd).toBeNull();
    expect(s.bopPercent).toBeNull();
  });
});
