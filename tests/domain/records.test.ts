import { describe, expect, it } from 'vitest';
import { ageOn, buildExport, ImportError, newExam, newPatient, parseImport } from '../../src/domain/records';
import { makeChart } from '../helpers';

describe('records', () => {
  it('round-trips through JSON export/import', () => {
    const p = newPatient('Test', '1970-05-01');
    const e = { ...newExam(p.id), chart: makeChart({ missing: [18], implants: [36], teeth: { 16: { all: { pd: 6, gm: -2, bop: true }, mobility: 2, furcation: { B: 2 } } } }) };
    const parsed = parseImport(JSON.stringify(buildExport([p], [e])));
    expect(parsed.patients).toEqual([p]);
    expect(parsed.exams[0].chart).toEqual(e.chart);
    expect(parsed.exams[0].inputs).toEqual(e.inputs);
  });

  it('rejects invalid files', () => {
    expect(() => parseImport('not json')).toThrow(ImportError);
    expect(() => parseImport('{"app":"other"}')).toThrow(/not a PerioDiag/);
    expect(() => parseImport('{"app":"periodiag","schemaVersion":99,"patients":[],"exams":[]}')).toThrow(/schema/);
    expect(() =>
      parseImport('{"app":"periodiag","schemaVersion":1,"patients":[],"exams":[{"id":"x","patientId":"nobody","date":"2020-01-01"}]}'),
    ).toThrow(/unknown patient/);
  });

  it('sanitises out-of-range values', () => {
    const p = newPatient('X');
    const raw = buildExport([p], [newExam(p.id)]) as unknown as { exams: { chart: Record<string, { mobility: unknown; furcation: unknown }> }[] };
    raw.exams[0].chart['11'].mobility = 9;
    raw.exams[0].chart['11'].furcation = { B: 2 }; // incisors have no furcation
    const e = parseImport(JSON.stringify(raw)).exams[0];
    expect(e.chart[11].mobility).toBeNull();
    expect(e.chart[11].furcation).toEqual({});
  });

  it('copies tooth status into a follow-up exam', () => {
    const p = newPatient('X');
    const first = { ...newExam(p.id), chart: makeChart({ missing: [46], implants: [36] }) };
    const next = newExam(p.id, first);
    expect(next.chart[46].status).toBe('missing');
    expect(next.chart[36].status).toBe('implant');
    expect(next.chart[36].sites.MB.pd).toBeNull();
  });

  it('computes age on the exam date', () => {
    expect(ageOn('1980-06-15', '2020-06-14')).toBe(39);
    expect(ageOn('1980-06-15', '2020-06-15')).toBe(40);
  });
});
