import { describe, expect, it } from 'vitest';
import {
  classify,
  directGrade,
  emptyInputs,
  evaluateCaseDefinition,
  finalize,
  indirectGrade,
  type ClinicalInputs,
  type Diagnosis,
} from '../../src/domain/classify';
import type { Fdi } from '../../src/domain/teeth';
import { interdental, makeChart, type ChartSpec, type ToothSpec } from '../helpers';

/** Healthy baseline: PD 2 mm with the margin 2 mm coronal to the CEJ → CAL 0. */
const chart = (spec: ChartSpec = {}) => makeChart({ ...spec, base: { pd: 2, gm: 2, ...spec.base } });
const inputs = (over: Partial<ClinicalInputs> = {}): ClinicalInputs => ({ ...emptyInputs(), ...over, complexity: { ...over.complexity } });
const teeth = (list: Fdi[], spec: ToothSpec): Record<number, ToothSpec> => Object.fromEntries(list.map((t) => [t, spec]));
const decisive = (r: { reasons: { text: string; decisive?: boolean }[] } | undefined) => r?.reasons.find((x) => x.decisive)?.text ?? '';

/** Interdental CAL `cal` mm with PD = cal and GM 0 (no recession). */
const loss = (cal: number): ToothSpec => interdental(cal, 0);

describe('case definition', () => {
  it('is met with interdental CAL ≥ 2 mm at two non-adjacent teeth', () => {
    const cd = evaluateCaseDefinition(chart({ teeth: teeth([16, 26], loss(3)) }));
    expect(cd.met).toBe(true);
    expect(cd.ruleA).toBe(true);
    expect(cd.nonAdjacentPair).toEqual([16, 26]);
  });

  it('is not met when the only teeth with interdental CAL ≥ 2 mm are adjacent', () => {
    const cd = evaluateCaseDefinition(chart({ teeth: teeth([11, 21], loss(2)) }));
    expect(cd.ruleA).toBe(false);
    expect(cd.met).toBe(false);
  });

  it('counts teeth separated by a missing tooth as non-adjacent', () => {
    const cd = evaluateCaseDefinition(chart({ missing: [15], teeth: teeth([14, 16], loss(2)) }));
    expect(cd.met).toBe(true);
  });

  it('is met with buccal/oral CAL ≥ 3 mm and PD > 3 mm at two teeth', () => {
    const buccal: ToothSpec = { sites: { B: { pd: 4, gm: -1 } } };
    const cd = evaluateCaseDefinition(chart({ teeth: teeth([13, 33], buccal) }));
    expect(cd.ruleA).toBe(false);
    expect(cd.ruleB).toBe(true);
    expect(cd.met).toBe(true);
  });

  it('does not count buccal recession without pocketing > 3 mm', () => {
    const recession: ToothSpec = { sites: { B: { pd: 3, gm: -3 } } }; // CAL 6, PD 3
    expect(evaluateCaseDefinition(chart({ teeth: teeth([13, 23, 33], recession) })).met).toBe(false);
  });

  it('re-evaluates after excluding teeth with non-periodontal attachment loss', () => {
    const c = chart({ teeth: teeth([38, 48], loss(5)) });
    expect(evaluateCaseDefinition(c).met).toBe(true);
    const cd = evaluateCaseDefinition(c, [38, 48]);
    expect(cd.met).toBe(false);
    expect(cd.candidateTeeth).toEqual([48, 38]);
    expect(cd.excludedTeeth).toEqual([48, 38]);
  });

  it('ignores implants', () => {
    const cd = evaluateCaseDefinition(chart({ implants: [16, 26], teeth: teeth([16, 26], loss(8)) }));
    expect(cd.met).toBe(false);
  });
});

describe('health and gingivitis', () => {
  // 20 natural teeth → 120 sites, so 12 BOP sites = 10 %, 36 = 30 %.
  const missing: Fdi[] = [18, 17, 16, 28, 27, 26, 38, 37, 36, 48, 47, 46];
  const bop = (n: number) => {
    const t: Record<number, ToothSpec> = {};
    const order: Fdi[] = [15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 35, 34];
    const sites = ['MB', 'B', 'DB', 'ML', 'L', 'DL'] as const;
    for (let i = 0; i < n; i++) {
      const tooth = order[Math.floor(i / 6)];
      t[tooth] = { sites: { ...t[tooth]?.sites, [sites[i % 6]]: { bop: true } } };
    }
    return chart({ missing, teeth: t });
  };

  it('is periodontal health with BOP < 10 % on an intact periodontium', () => {
    const d = classify(bop(11), inputs());
    expect(d.kind).toBe('health');
    expect(d.gingival?.reducedPeriodontium).toBe(false);
    expect(d.label).toBe('Periodontal health, intact periodontium');
  });

  it('is localized gingivitis at exactly 10 % BOP', () => {
    const d = classify(bop(12), inputs());
    expect(d.kind).toBe('gingivitis');
    expect(d.gingival?.extent).toBe('localized');
  });

  it('is still localized at exactly 30 % and generalized above it', () => {
    expect(classify(bop(36), inputs()).gingival?.extent).toBe('localized');
    expect(classify(bop(37), inputs()).gingival?.extent).toBe('generalized');
  });

  it('recognises gingivitis on a reduced periodontium (recession, no periodontitis)', () => {
    const c = chart({
      bopTeeth: [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43],
      teeth: { 31: { sites: { B: { pd: 1, gm: -3, bop: true } } }, 41: { sites: { B: { pd: 1, gm: -2, bop: true } } } },
    });
    const d = classify(c, inputs());
    expect(d.kind).toBe('gingivitis');
    expect(d.gingival?.extent).toBe('generalized'); // 72 / 192 = 37.5 %
    expect(d.gingival?.reducedPeriodontium).toBe(true);
    expect(d.label).toBe('Generalized gingivitis on a reduced periodontium (non-periodontitis patient)');
  });

  it('reports health on a reduced periodontium after excluding non-periodontal attachment loss', () => {
    const d = classify(chart({ teeth: teeth([38, 48], loss(5)) }), inputs({ nonPerioTeeth: [38, 48] }));
    expect(d.kind).toBe('health');
    expect(d.gingival?.reducedPeriodontium).toBe(true);
  });
});

describe('staging: one case per stage', () => {
  it('Stage I: interdental CAL 1–2 mm, PD ≤ 4 mm', () => {
    const d = classify(chart({ teeth: teeth([16, 26], interdental(3, 1)) }), inputs({ teethLostToPerio: 0 }));
    expect(d.kind).toBe('periodontitis');
    expect(d.stage?.value).toBe(1);
    expect(d.label).toBe('Periodontitis, Localized, Stage I, Grade B, currently stable');
  });

  it('Stage II: interdental CAL 3–4 mm, RBL 15–33 %', () => {
    const d = classify(chart({ teeth: teeth([16, 26, 36, 46], loss(4)) }), inputs({ rblPercent: 25, age: 50, teethLostToPerio: 0 }));
    expect(d.stage?.value).toBe(2);
    expect(decisive(d.stage)).toMatch(/Worst interdental CAL 4 mm/);
  });

  it('Stage III: interdental CAL ≥ 5 mm', () => {
    const d = classify(chart({ teeth: teeth([16, 26, 36, 46], interdental(4, -1)) }), inputs({ teethLostToPerio: 0 }));
    expect(d.stage?.value).toBe(3);
    expect(d.stage?.severity).toBe(3);
  });

  it('Stage IV: CAL ≥ 5 mm with ≥ 5 teeth lost to periodontitis', () => {
    const d = classify(chart({ teeth: teeth([16, 26, 36, 46], loss(6)) }), inputs({ teethLostToPerio: 5 }));
    expect(d.stage?.value).toBe(4);
    expect(decisive(d.stage)).toMatch(/5 tooth\/teeth lost/);
  });

  it('Stage IV: CAL ≥ 5 mm with a Stage IV complexity factor', () => {
    const d = classify(chart({ teeth: teeth([16, 26], loss(6)) }), inputs({ complexity: { masticatoryDysfunction: true } }));
    expect(d.stage?.value).toBe(4);
  });
});

describe('staging: the stage only goes up', () => {
  it('max PD ≥ 6 mm raises Stage II severity to Stage III', () => {
    const c = chart({ teeth: { ...teeth([16, 26], loss(4)), 17: { sites: { DB: { pd: 6, gm: 3 } } } } });
    const d = classify(c, inputs());
    expect(d.stage?.severity).toBe(2);
    expect(d.stage?.value).toBe(3);
    expect(decisive(d.stage)).toMatch(/Max PD 6 mm/);
  });

  it('max PD 5 mm raises Stage I to Stage II', () => {
    const c = chart({ teeth: { ...teeth([16, 26], interdental(3, 1)), 27: { sites: { B: { pd: 5, gm: 5 } } } } });
    expect(classify(c, inputs()).stage?.value).toBe(2);
  });

  it('furcation class II raises to Stage III', () => {
    const c = chart({ teeth: { ...teeth([16, 26], loss(3)), 36: { furcation: { B: 2 } } } });
    expect(classify(c, inputs()).stage?.value).toBe(3);
  });

  it('a vertical defect ≥ 3 mm raises Stage I to Stage III', () => {
    const c = chart({ teeth: teeth([16, 26], interdental(3, 1)) });
    expect(classify(c, inputs({ verticalDefect3mm: true })).stage?.value).toBe(3);
  });

  it('uses radiographic bone loss when it indicates a higher stage than CAL', () => {
    const d = classify(chart({ teeth: teeth([16, 26], interdental(3, 1)) }), inputs({ rblPercent: 40, age: 60 }));
    expect(d.stage?.value).toBe(3);
    expect(decisive(d.stage)).toMatch(/higher than the CAL-based stage/);
  });

  it('never lowers the stage when RBL suggests a lower stage', () => {
    const d = classify(chart({ teeth: teeth([16, 26], loss(6)) }), inputs({ rblPercent: 10, age: 60 }));
    expect(d.stage?.value).toBe(3);
  });

  it('any tooth loss due to periodontitis means at least Stage III', () => {
    const d = classify(chart({ teeth: teeth([16, 26], interdental(3, 1)) }), inputs({ teethLostToPerio: 1 }));
    expect(d.stage?.value).toBe(3);
  });

  it('does not apply Stage IV complexity below Stage III severity, but says so', () => {
    const c = chart({ teeth: { ...teeth([16, 26], loss(4)), 31: { mobility: 2 } } });
    const d = classify(c, inputs());
    expect(d.stage?.value).toBe(2);
    expect(d.stage?.reasons.some((r) => /not applied/.test(r.text))).toBe(true);
  });

  it('secondary occlusal trauma from mobility ≥ 2 shifts Stage III to IV, and the clinician can rule it out', () => {
    const c = chart({ teeth: { ...teeth([16, 26], loss(6)), 31: { mobility: 2 } } });
    expect(classify(c, inputs()).stage?.value).toBe(4);
    expect(classify(c, inputs({ complexity: { occlusalTrauma: false } })).stage?.value).toBe(3);
  });

  it('fewer than 10 opposing pairs shifts Stage III to IV', () => {
    const missing: Fdi[] = [18, 17, 16, 15, 14, 24, 25, 26, 27, 28, 13];
    const d = classify(chart({ missing, teeth: teeth([12, 22], loss(6)) }), inputs());
    expect(d.stage?.factors.opposingPairs).toBe(5);
    expect(d.stage?.value).toBe(4);
  });

  it('keeps a higher stage diagnosed at an earlier exam', () => {
    const d = classify(chart({ teeth: teeth([16, 26], loss(6)) }), inputs(), { previousMaxStage: 4, previousMaxStageDate: '2020-01-01' });
    expect(d.stage?.value).toBe(4);
    expect(decisive(d.stage)).toMatch(/never downgraded/);
  });
});

describe('extent', () => {
  const present28: Fdi[] = [18, 28, 38, 48];
  const deep10: Fdi[] = [17, 16, 15, 14, 13, 23, 24, 25, 26, 27];

  it('is generalized when ≥ 30 % of teeth are involved', () => {
    const d = classify(chart({ missing: present28, teeth: teeth(deep10, loss(6)) }), inputs());
    expect(d.extent?.value).toBe('generalized'); // 10 / 28 = 36 %
  });

  it('is localized when < 30 % of teeth are involved', () => {
    const d = classify(chart({ missing: present28, teeth: teeth(deep10.slice(0, 8), loss(6)) }), inputs());
    expect(d.extent?.value).toBe('localized'); // 8 / 28 = 29 %
  });

  it('counts only teeth at the stage-defining CAL level', () => {
    const c = chart({ teeth: { ...teeth([16, 26], loss(6)), ...teeth([11, 12, 13, 21, 22, 23, 31, 32, 33, 41], loss(3)) } });
    const d = classify(c, inputs());
    expect(d.extent?.threshold).toBe(5);
    expect(d.extent?.involved).toEqual([16, 26]);
    expect(d.extent?.value).toBe('localized');
  });

  it('does not call involvement of first molars alone a molar-incisor pattern', () => {
    expect(classify(chart({ teeth: teeth([16, 26, 36, 46], loss(6)) }), inputs()).extent?.value).toBe('localized');
  });

  it('detects the molar-incisor pattern', () => {
    const d = classify(chart({ teeth: teeth([16, 26, 36, 46, 11, 21, 31, 41], loss(6)) }), inputs());
    expect(d.extent?.value).toBe('molar-incisor');
    expect(d.label).toMatch(/^Periodontitis, Molar-incisor pattern, Stage/);
  });
});

describe('grading: one case per grade', () => {
  const perio = chart({ teeth: teeth([16, 26], loss(6)) });
  const grade = (over: Partial<ClinicalInputs>) => classify(perio, inputs(over)).grade!;

  it('Grade A: no progression over 5 years (direct evidence)', () => {
    const g = grade({ previousRecord: { available: true, years: 5, changeMm: 0, measure: 'cal' } });
    expect(g.value).toBe('A');
    expect(g.basis).toBe('direct');
  });

  it('Grade B: % bone loss / age between 0.25 and 1.0', () => {
    const g = grade({ rblPercent: 30, age: 60 });
    expect(g.value).toBe('B');
    expect(g.ratio).toBeCloseTo(0.5);
  });

  it('Grade C: % bone loss / age > 1.0', () => {
    const g = grade({ rblPercent: 50, age: 35 });
    expect(g.value).toBe('C');
    expect(g.basis).toBe('indirect');
  });

  it('Grade C: ≥ 2 mm loss over 5 years', () => {
    expect(grade({ previousRecord: { available: true, years: 5, changeMm: 2 } }).value).toBe('C');
  });

  it('Grade A: % bone loss / age < 0.25', () => {
    expect(grade({ rblPercent: 10, age: 60 }).value).toBe('A');
  });

  it('defaults to Grade B without evidence', () => {
    const g = grade({});
    expect(g.value).toBe('B');
    expect(g.basis).toBe('default');
  });
});

describe('grading: thresholds and modifiers', () => {
  it('puts ratio boundaries 0.25 and 1.0 in Grade B', () => {
    expect(indirectGrade(0.249)).toBe('A');
    expect(indirectGrade(0.25)).toBe('B');
    expect(indirectGrade(1.0)).toBe('B');
    expect(indirectGrade(1.01)).toBe('C');
  });

  it('scales direct evidence to 5 years', () => {
    expect(directGrade(1.9)).toBe('B');
    const d = classify(chart({ teeth: teeth([16, 26], loss(6)) }), inputs({ previousRecord: { available: true, years: 10, changeMm: 3 } }));
    expect(d.grade?.value).toBe('B'); // 1.5 mm per 5 years
  });

  it('prefers direct over indirect evidence', () => {
    const d = classify(chart({ teeth: teeth([16, 26], loss(6)) }), inputs({ rblPercent: 60, age: 40, previousRecord: { available: true, years: 5, changeMm: 0 } }));
    expect(d.grade?.value).toBe('A');
  });

  const base = { rblPercent: 10, age: 60 }; // Grade A before modifiers
  const g = (over: Partial<ClinicalInputs>) => classify(chart({ teeth: teeth([16, 26], loss(6)) }), inputs({ ...base, ...over })).grade!;

  it('smoking < 10/day raises A to B, ≥ 10/day to C', () => {
    expect(g({ smoking: 'lt10' }).value).toBe('B');
    expect(g({ smoking: 'ge10' }).value).toBe('C');
    expect(decisive(g({ smoking: 'ge10' }))).toMatch(/Smoker ≥ 10/);
  });

  it('HbA1c ≥ 7.0 % gives Grade C, < 7.0 % at least B', () => {
    expect(g({ diabetes: { diabetic: true, hba1c: 7.0 } }).value).toBe('C');
    expect(g({ diabetes: { diabetic: true, hba1c: 6.9 } }).value).toBe('B');
    expect(g({ diabetes: { diabetic: true } }).value).toBe('B');
    expect(g({ diabetes: { diabetic: false } }).value).toBe('A');
  });

  it('modifiers never lower the grade', () => {
    const c = g({ rblPercent: 50, age: 35, smoking: 'lt10', diabetes: { diabetic: true, hba1c: 6 } });
    expect(c.value).toBe('C');
    expect(decisive(c)).toMatch(/Indirect evidence/);
  });
});

describe('current status', () => {
  it('is unstable with PD ≥ 5 mm', () => {
    expect(classify(chart({ teeth: teeth([16, 26], loss(6)) }), inputs()).status?.value).toBe('unstable');
  });

  it('is unstable with a bleeding 4 mm site', () => {
    const c = chart({ teeth: { ...teeth([16, 26], interdental(4, 1)), 11: { sites: { B: { pd: 4, gm: 2, bop: true } } } } });
    expect(classify(c, inputs()).status?.value).toBe('unstable');
  });

  it('is stable with PD ≤ 4 mm, no bleeding 4 mm sites and BOP < 10 %', () => {
    expect(classify(chart({ teeth: teeth([16, 26], interdental(4, 1)) }), inputs()).status?.value).toBe('stable');
  });

  it('is in remission with PD ≤ 4 mm, no bleeding 4 mm sites but BOP ≥ 10 %', () => {
    const c = chart({ bopTeeth: [11, 12, 13, 21], teeth: teeth([16, 26], interdental(4, 1)) }); // 24 / 192 = 12.5 %
    expect(classify(c, inputs()).status?.value).toBe('remission');
  });
});

describe('full diagnosis and overrides', () => {
  const generalizedIIIB = (): Diagnosis =>
    classify(
      chart({ missing: [18, 28, 38, 48], teeth: teeth([17, 16, 15, 14, 26, 27, 36, 37, 46, 47], { ...loss(6), all: { bop: true } }) }),
      inputs({ age: 55, rblPercent: 40, teethLostToPerio: 0, smoking: 'none', diabetes: { diabetic: false } }),
    );

  it('produces the full label', () => {
    expect(generalizedIIIB().label).toBe('Periodontitis, Generalized, Stage III, Grade B, currently unstable');
  });

  it('lets the clinician override components and the label', () => {
    const d = generalizedIIIB();
    const f = finalize(d, { stage: 4, note: 'Bite collapse on clinical exam' });
    expect(f.label).toBe('Periodontitis, Generalized, Stage IV, Grade B, currently unstable');
    expect(f.overridden).toEqual(['stage']);
    expect(finalize(d, { label: 'Custom' }).label).toBe('Custom');
    expect(finalize(d, { stage: 3 }).overridden).toEqual([]); // same as computed
  });

  it('can override periodontitis to gingivitis', () => {
    const f = finalize(generalizedIIIB(), { kind: 'gingivitis' });
    expect(f.kind).toBe('gingivitis');
    expect(f.stage).toBeUndefined();
  });
});

describe('edge cases', () => {
  it('reports insufficient data for an unprobed chart', () => {
    expect(classify(makeChart({ base: { pd: null, gm: null } }), inputs()).kind).toBe('insufficient');
  });

  it('reports an edentulous patient as not classifiable', () => {
    const all: Fdi[] = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
    const d = classify(makeChart({ missing: all }), inputs());
    expect(d.kind).toBe('insufficient');
    expect(d.label).toMatch(/No natural teeth/);
  });

  it('a margin coronal to the CEJ cancels probing depth (no attachment loss)', () => {
    const d = classify(chart({ teeth: teeth([16, 26, 36], interdental(4, 4)) }), inputs());
    expect(d.caseDefinition.met).toBe(false);
  });

  it('warns when gingival margins are not recorded', () => {
    const d = classify(makeChart({ base: { pd: 3, gm: null } }), inputs());
    expect(d.kind).toBe('periodontitis'); // CAL = PD everywhere
    expect(d.notes.some((n) => /Gingival margin not recorded at 192/.test(n.text))).toBe(true);
  });

  it('flags an incomplete chart', () => {
    const c = chart({ teeth: { 11: { all: { pd: null } } } });
    expect(classify(c, inputs()).notes.some((n) => /incomplete/.test(n.text))).toBe(true);
  });

  it('handles a case met only on buccal/oral sites (Stage I severity, extent by any-site CAL)', () => {
    const buccal: ToothSpec = { sites: { B: { pd: 4, gm: -1 } } };
    const d = classify(chart({ teeth: teeth([13, 33], buccal) }), inputs());
    expect(d.kind).toBe('periodontitis');
    expect(d.stage?.severity).toBe(1);
    expect(d.extent?.involved).toEqual([13, 33]);
  });
});
