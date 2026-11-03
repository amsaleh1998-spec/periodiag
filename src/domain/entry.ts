// Fast keyboard charting: entry sequence + pure key-handling state machine.
//
// The sequence visits, per tooth surface, PD for the 3 sites then GM for the
// same 3 sites (as on the Bern form), walking the arches in the selected order.
// Missing teeth are skipped; implants are charted.

import { clampGm, clampPd, updateSite, type Chart } from './chart';
import { LOWER_ROW, UPPER_ROW, siteScreenOrder, type Fdi, type SiteId, type Surface } from './teeth';

export type EntryKind = 'pd' | 'gm';
export type EntryOrder = 'snake' | 'rows';

export interface EntryField {
  tooth: Fdi;
  surface: Surface;
  kind: EntryKind;
  site: SiteId;
}

export const ENTRY_ORDERS: Record<EntryOrder, string> = {
  snake: 'S-path: 18→28 buccal, 28→18 palatal, 38→48 lingual, 48→38 buccal',
  rows: 'Bern form: every row left to right (18→28, 18→28, 48→38, 48→38)',
};

interface Pass {
  row: readonly Fdi[];
  surface: Surface;
  leftToRight: boolean;
}

function passes(order: EntryOrder): Pass[] {
  if (order === 'rows') {
    return [
      { row: UPPER_ROW, surface: 'buccal', leftToRight: true },
      { row: UPPER_ROW, surface: 'oral', leftToRight: true },
      { row: LOWER_ROW, surface: 'oral', leftToRight: true },
      { row: LOWER_ROW, surface: 'buccal', leftToRight: true },
    ];
  }
  return [
    { row: UPPER_ROW, surface: 'buccal', leftToRight: true },
    { row: UPPER_ROW, surface: 'oral', leftToRight: false },
    { row: LOWER_ROW, surface: 'oral', leftToRight: false },
    { row: LOWER_ROW, surface: 'buccal', leftToRight: true },
  ];
}

export function buildSequence(chart: Chart, order: EntryOrder = 'snake'): EntryField[] {
  const seq: EntryField[] = [];
  for (const p of passes(order)) {
    const teeth = p.leftToRight ? [...p.row] : [...p.row].reverse();
    for (const tooth of teeth) {
      if (chart[tooth]?.status === 'missing') continue;
      const sites = siteScreenOrder(tooth, p.surface);
      if (!p.leftToRight) sites.reverse();
      for (const kind of ['pd', 'gm'] as const) {
        for (const site of sites) seq.push({ tooth, surface: p.surface, kind, site });
      }
    }
  }
  return seq;
}

export function sameField(a: EntryField | undefined, b: EntryField | undefined): boolean {
  return !!a && !!b && a.tooth === b.tooth && a.site === b.site && a.kind === b.kind;
}

export function findField(seq: EntryField[], f: Omit<EntryField, 'surface'>): number {
  return seq.findIndex((x) => x.tooth === f.tooth && x.site === f.site && x.kind === f.kind);
}

export interface EntryState {
  index: number;
  /** '-' was pressed: next digit is negative (GM only). */
  negative: boolean;
  /** '.' was pressed: next digit is 10 + digit. */
  tens: boolean;
  /** Site of the most recently entered value: target of B / P / S toggles. */
  lastSite?: { tooth: Fdi; site: SiteId };
}

export type EntryAction =
  | { type: 'digit'; digit: number; tens?: boolean }
  | { type: 'minus' }
  | { type: 'tens' }
  | { type: 'toggle'; flag: 'bop' | 'plaque' | 'supp' }
  | { type: 'skip' }
  | { type: 'back' }
  | { type: 'clear' }
  | { type: 'move'; delta: number }
  | { type: 'goto'; index: number };

export type EntryEdit =
  | { type: 'set'; field: EntryField; value: number | null }
  | { type: 'toggle'; tooth: Fdi; site: SiteId; flag: 'bop' | 'plaque' | 'supp' };

export interface EntryResult {
  state: EntryState;
  edit?: EntryEdit;
}

export const initialEntryState: EntryState = { index: 0, negative: false, tens: false };

function clampIndex(i: number, seq: EntryField[]): number {
  return Math.max(0, Math.min(seq.length - 1, i));
}

export function handleEntry(state: EntryState, action: EntryAction, seq: EntryField[]): EntryResult {
  if (seq.length === 0) return { state };
  const index = clampIndex(state.index, seq);
  const field = seq[index];
  const reset = { negative: false, tens: false };

  switch (action.type) {
    case 'digit': {
      const tens = state.tens || !!action.tens;
      let value = (tens ? 10 : 0) + action.digit;
      if (field.kind === 'gm') {
        if (state.negative) value = -value;
        value = clampGm(value);
      } else {
        value = clampPd(value);
      }
      return {
        state: { ...reset, index: clampIndex(index + 1, seq), lastSite: { tooth: field.tooth, site: field.site } },
        edit: { type: 'set', field, value },
      };
    }
    case 'minus':
      // Negative values only make sense for the gingival margin.
      return { state: { ...state, index, negative: field.kind === 'gm' ? !state.negative : false } };
    case 'tens':
      return { state: { ...state, index, tens: !state.tens } };
    case 'toggle': {
      const target = state.lastSite ?? { tooth: field.tooth, site: field.site };
      return { state: { ...state, index }, edit: { type: 'toggle', ...target, flag: action.flag } };
    }
    case 'skip':
      return { state: { ...reset, index: clampIndex(index + 1, seq), lastSite: { tooth: field.tooth, site: field.site } } };
    case 'back': {
      const prev = clampIndex(index - 1, seq);
      return {
        state: { ...reset, index: prev, lastSite: undefined },
        edit: { type: 'set', field: seq[prev], value: null },
      };
    }
    case 'clear':
      return { state: { ...reset, index }, edit: { type: 'set', field, value: null } };
    case 'move':
      return { state: { ...reset, index: clampIndex(index + action.delta, seq), lastSite: undefined } };
    case 'goto':
      return { state: { ...reset, index: clampIndex(action.index, seq), lastSite: undefined } };
  }
}

/** Translate a browser KeyboardEvent-like object into an entry action (null = not handled). */
export function keyToAction(e: { key: string; code?: string; shiftKey?: boolean }): EntryAction | null {
  const digitFromCode = e.code?.match(/^(?:Digit|Numpad)(\d)$/);
  if (e.shiftKey && digitFromCode) return { type: 'digit', digit: Number(digitFromCode[1]), tens: true };
  if (/^\d$/.test(e.key)) return { type: 'digit', digit: Number(e.key) };
  switch (e.key) {
    case '-':
    case 'Subtract':
      return { type: 'minus' };
    case '.':
    case ',':
    case 'Decimal':
      return { type: 'tens' };
    case 'b':
    case 'B':
      return { type: 'toggle', flag: 'bop' };
    case 'p':
    case 'P':
      return { type: 'toggle', flag: 'plaque' };
    case 's':
    case 'S':
      return { type: 'toggle', flag: 'supp' };
    case ' ':
    case 'Enter':
    case 'Tab':
      return e.shiftKey ? { type: 'move', delta: -1 } : { type: 'skip' };
    case 'Backspace':
      return { type: 'back' };
    case 'Delete':
      return { type: 'clear' };
    case 'ArrowRight':
    case 'ArrowDown':
      return { type: 'move', delta: 1 };
    case 'ArrowLeft':
    case 'ArrowUp':
      return { type: 'move', delta: -1 };
    case 'Home':
      return { type: 'goto', index: 0 };
    default:
      return null;
  }
}

/** Apply an entry edit to a chart, returning a new chart. */
export function applyEntryEdit(chart: Chart, edit: EntryEdit): Chart {
  if (edit.type === 'set') {
    return updateSite(chart, edit.field.tooth, edit.field.site, { [edit.field.kind]: edit.value });
  }
  const site = chart[edit.tooth].sites[edit.site];
  return updateSite(chart, edit.tooth, edit.site, { [edit.flag]: !site[edit.flag] });
}
