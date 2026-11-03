import { describe, expect, it } from 'vitest';
import { applyEntryEdit, buildSequence, handleEntry, initialEntryState, keyToAction, type EntryAction, type EntryState } from '../../src/domain/entry';
import { emptyChart } from '../../src/domain/chart';
import { makeChart } from '../helpers';

function run(actions: EntryAction[], chart = emptyChart(), order: 'snake' | 'rows' = 'snake') {
  const seq = buildSequence(chart, order);
  let state: EntryState = initialEntryState;
  let c = chart;
  for (const a of actions) {
    const r = handleEntry(state, a, seq);
    state = r.state;
    if (r.edit) c = applyEntryEdit(c, r.edit);
  }
  return { state, chart: c, seq };
}

const digits = (...ds: number[]): EntryAction[] => ds.map((d) => ({ type: 'digit', digit: d }));

describe('entry sequence', () => {
  it('has 32 teeth × 6 sites × (PD + GM) fields', () => {
    expect(buildSequence(emptyChart()).length).toBe(384);
  });

  it('starts at 18 buccal: PD for DB, B, MB then GM for the same sites', () => {
    const seq = buildSequence(emptyChart());
    expect(seq.slice(0, 7).map((f) => `${f.tooth}${f.kind}${f.site}`)).toEqual([
      '18pdDB', '18pdB', '18pdMB', '18gmDB', '18gmB', '18gmMB', '17pdDB',
    ]);
  });

  it('follows the S-path through the four passes', () => {
    const seq = buildSequence(emptyChart());
    const firstOf = (i: number) => `${seq[i * 96].tooth}-${seq[i * 96].surface}`;
    expect([0, 1, 2, 3].map(firstOf)).toEqual(['18-buccal', '28-oral', '38-oral', '48-buccal']);
    // Palatal pass goes right to left: 28 starts at its distal site
    expect(seq[96].site).toBe('DL');
  });

  it('supports the row-by-row Bern order', () => {
    const seq = buildSequence(emptyChart(), 'rows');
    expect(seq[96].tooth).toBe(18);
    expect(seq[96].site).toBe('DL');
    expect(seq[192].tooth).toBe(48);
  });

  it('skips missing teeth and keeps implants', () => {
    const seq = buildSequence(makeChart({ missing: [18, 17], implants: [16] }));
    expect(seq[0].tooth).toBe(16);
    expect(seq.length).toBe(384 - 2 * 12);
  });
});

describe('entry state machine', () => {
  it('writes a digit and jumps to the next site', () => {
    const { state, chart } = run(digits(3, 4, 5));
    expect(chart[18].sites.DB.pd).toBe(3);
    expect(chart[18].sites.B.pd).toBe(4);
    expect(chart[18].sites.MB.pd).toBe(5);
    expect(state.index).toBe(3);
  });

  it('enters negative gingival margins after "-"', () => {
    const { chart } = run([...digits(3, 3, 3), { type: 'minus' }, ...digits(2), ...digits(0)]);
    expect(chart[18].sites.DB.gm).toBe(-2);
    expect(chart[18].sites.B.gm).toBe(0);
  });

  it('ignores "-" on probing depths', () => {
    const { chart } = run([{ type: 'minus' }, ...digits(4)]);
    expect(chart[18].sites.DB.pd).toBe(4);
  });

  it('enters 10+ values with the tens modifier', () => {
    const { chart } = run([{ type: 'tens' }, ...digits(2), { type: 'digit', digit: 1, tens: true }]);
    expect(chart[18].sites.DB.pd).toBe(12);
    expect(chart[18].sites.B.pd).toBe(11);
  });

  it('toggles BOP on the site just entered', () => {
    const { chart } = run([...digits(5), { type: 'toggle', flag: 'bop' }, ...digits(3), { type: 'toggle', flag: 'plaque' }]);
    expect(chart[18].sites.DB.bop).toBe(true);
    expect(chart[18].sites.B.bop).toBe(false);
    expect(chart[18].sites.B.plaque).toBe(true);
  });

  it('goes back and clears with backspace', () => {
    const { chart, state } = run([...digits(5, 6), { type: 'back' }]);
    expect(chart[18].sites.B.pd).toBeNull();
    expect(chart[18].sites.DB.pd).toBe(5);
    expect(state.index).toBe(1);
  });

  it('skips a site without changing it and stops at the last field', () => {
    const { state } = run([{ type: 'skip' }, { type: 'goto', index: 10_000 }, { type: 'skip' }]);
    expect(state.index).toBe(383);
  });
});

describe('keyboard mapping', () => {
  it('maps keys to actions', () => {
    expect(keyToAction({ key: '7' })).toEqual({ type: 'digit', digit: 7 });
    expect(keyToAction({ key: '#', code: 'Digit3', shiftKey: true })).toEqual({ type: 'digit', digit: 3, tens: true });
    expect(keyToAction({ key: '-' })).toEqual({ type: 'minus' });
    expect(keyToAction({ key: 'b' })).toEqual({ type: 'toggle', flag: 'bop' });
    expect(keyToAction({ key: 'Backspace' })).toEqual({ type: 'back' });
    expect(keyToAction({ key: 'x' })).toBeNull();
  });
});
