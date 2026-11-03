import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  calOf,
  nextFurcation,
  nextMobility,
  nextStatus,
  setStatus,
  toothHasData,
  updateTooth,
  type Chart,
} from '../../domain/chart';
import {
  ENTRY_ORDERS,
  applyEntryEdit,
  buildSequence,
  findField,
  handleEntry,
  initialEntryState,
  keyToAction,
  type EntryAction,
  type EntryField,
  type EntryOrder,
  type EntryState,
} from '../../domain/entry';
import type { Exam } from '../../domain/records';
import {
  LOWER_ROW,
  UPPER_ROW,
  furcationEntrances,
  furcationSurface,
  oralName,
  quadrant,
  siteLabel,
  siteScreenOrder,
  type Arch,
  type Fdi,
  type FurcationEntrance,
  type SiteId,
  type Surface,
} from '../../domain/teeth';
import { JawDrawing } from '../chartview/JawDrawing';
import { isCoarsePointer, useLocalSetting } from '../util';
import { Keypad } from './Keypad';

interface Props {
  exam: Exam;
  setChart: (fn: (c: Chart) => Chart) => void;
  updateExam: (fn: (e: Exam) => Exam) => void;
}

type RowKind = 'furc' | 'bop' | 'plaque' | 'supp' | 'gm' | 'pd' | 'cal';
const SURFACE_ROWS: RowKind[] = ['furc', 'bop', 'plaque', 'supp', 'gm', 'pd', 'cal'];
const ROW_LABEL: Record<RowKind, string> = {
  furc: 'Furcation',
  bop: 'Bleeding',
  plaque: 'Plaque',
  supp: 'Suppuration',
  gm: 'Gingival margin',
  pd: 'Probing depth',
  cal: 'CAL',
};
const ROMAN = ['', 'I', 'II', 'III'];

const fieldKey = (t: Fdi, site: string, kind: string) => `${t}-${site}-${kind}`;

export function ChartEntry({ exam, setChart, updateExam }: Props) {
  const chart = exam.chart;
  const [order, setOrder] = useLocalSetting<EntryOrder>('entryOrder', 'snake');
  const [showKeypad, setShowKeypad] = useLocalSetting<boolean>('keypad', isCoarsePointer());
  const [showDrawing, setShowDrawing] = useLocalSetting<boolean>('entryDrawing', true);

  // The sequence only depends on which teeth are missing.
  const statusKey = UPPER_ROW.concat(LOWER_ROW).map((t) => chart[t].status[0]).join('');
  const seq = useMemo(() => buildSequence(chart, order), [statusKey, order]); // eslint-disable-line react-hooks/exhaustive-deps
  const indexOf = useMemo(() => {
    const m = new Map<string, number>();
    seq.forEach((f, i) => m.set(fieldKey(f.tooth, f.site, f.kind), i));
    return m;
  }, [seq]);

  const [st, setSt] = useState<EntryState>(initialEntryState);
  const stRef = useRef(st);
  const seqRef = useRef(seq);
  const prevField = useRef<EntryField | undefined>(seq[0]);

  // Keep the cursor on the same field when the sequence changes (tooth status or order changed).
  useEffect(() => {
    const old = prevField.current;
    seqRef.current = seq;
    const idx = old ? findField(seq, old) : -1;
    const next = { ...stRef.current, index: idx >= 0 ? idx : Math.min(stRef.current.index, Math.max(0, seq.length - 1)) };
    stRef.current = next;
    setSt(next);
  }, [seq]);

  const dispatch = useCallback(
    (action: EntryAction) => {
      const r = handleEntry(stRef.current, action, seqRef.current);
      stRef.current = r.state;
      prevField.current = seqRef.current[r.state.index];
      setSt(r.state);
      const edit = r.edit;
      if (edit) setChart((c) => applyEntryEdit(c, edit));
    },
    [setChart],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = keyToAction(e);
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  // Keep the cursor visible inside horizontally scrolling jaws.
  useEffect(() => {
    document.querySelector('.cell.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [st.index]);

  const cur = seq[st.index];

  const cycleStatus = (t: Fdi) => {
    const next = nextStatus(chart[t].status);
    if (next === 'missing' && toothHasData(chart[t]) && !confirm(`Mark ${t} as missing? Its recorded values will be cleared.`)) return;
    setChart((c) => setStatus(c, t, next));
  };

  const cycleMob = (t: Fdi) => setChart((c) => updateTooth(c, t, (x) => ({ ...x, mobility: nextMobility(x.mobility) })));
  const cycleFurc = (t: Fdi, e: FurcationEntrance) =>
    setChart((c) => updateTooth(c, t, (x) => ({ ...x, furcation: { ...x.furcation, [e]: nextFurcation(x.furcation[e]) } })));

  const toggleFlag = (t: Fdi, s: SiteId, flag: 'bop' | 'plaque' | 'supp') =>
    setChart((c) => applyEntryEdit(c, { type: 'toggle', tooth: t, site: s, flag }));

  const gridProps = { chart, indexOf, cursor: st.index, dispatch, cycleStatus, cycleMob, cycleFurc, toggleFlag };

  return (
    <div>
      <div className="entry-toolbar">
        <label className="field">
          Exam date
          <input type="date" value={exam.date} onChange={(e) => e.target.value && updateExam((x) => ({ ...x, date: e.target.value }))} />
        </label>
        <label className="field">
          Examiner
          <input value={exam.examiner ?? ''} onChange={(e) => updateExam((x) => ({ ...x, examiner: e.target.value || undefined }))} />
        </label>
        <label className="field">
          Charting order
          <select value={order} onChange={(e) => setOrder(e.target.value as EntryOrder)}>
            {Object.entries(ENTRY_ORDERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <label className="check">
          <input type="checkbox" checked={showDrawing} onChange={(e) => setShowDrawing(e.target.checked)} /> Drawing
        </label>
        <label className="check">
          <input type="checkbox" checked={showKeypad} onChange={(e) => setShowKeypad(e.target.checked)} /> Keypad
        </label>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="cursor-info">
          {cur ? (
            <>
              Tooth <b>{cur.tooth}</b> · {cur.surface === 'buccal' ? 'buccal' : oralName(cur.tooth)} · <b>{cur.kind === 'pd' ? 'PD' : 'GM'}</b> ·{' '}
              {siteLabel(cur.tooth, cur.site)}
            </>
          ) : (
            'No teeth to chart'
          )}
          {st.positive && <span className="pending">+</span>}
          {st.tens && <span className="pending">1▢</span>}
        </div>
        <span className="help">
          <kbd>0</kbd>–<kbd>9</kbd> enter &amp; advance · GM digits are negative (recession); <kbd>+</kbd> first for a positive GM · <kbd>.</kbd> or <kbd>Shift</kbd>+digit = 10+ ·{' '}
          <kbd>B</kbd>/<kbd>P</kbd>/<kbd>S</kbd> bleeding/plaque/suppuration on the last site · <kbd>Space</kbd> skip · <kbd>⌫</kbd> back ·{' '}
          <kbd>←</kbd>
          <kbd>→</kbd> move
        </span>
      </div>

      <JawGrid arch="upper" showDrawing={showDrawing} {...gridProps} />
      <JawGrid arch="lower" showDrawing={showDrawing} {...gridProps} />

      <p className="help">
        Gingival margin: <b>typed values are negative = apical to the CEJ (recession)</b>; type <kbd>+</kbd> first for a margin coronal to the CEJ (swelling). CAL = PD − GM (never below 0).
        Tap a tooth number to cycle present → missing → implant. Tap mobility / furcation cells to cycle their grades.
      </p>
      {showKeypad && <Keypad dispatch={dispatch} state={st} field={cur} />}
    </div>
  );
}

interface GridProps {
  arch: Arch;
  chart: Chart;
  indexOf: Map<string, number>;
  cursor: number;
  showDrawing: boolean;
  dispatch: (a: EntryAction) => void;
  cycleStatus: (t: Fdi) => void;
  cycleMob: (t: Fdi) => void;
  cycleFurc: (t: Fdi, e: FurcationEntrance) => void;
  toggleFlag: (t: Fdi, s: SiteId, flag: 'bop' | 'plaque' | 'supp') => void;
}

function JawGrid(p: GridProps) {
  const row = p.arch === 'upper' ? UPPER_ROW : LOWER_ROW;
  const surfaceRows = (surface: Surface, reversed: boolean) => {
    const kinds = reversed ? [...SURFACE_ROWS].reverse() : SURFACE_ROWS;
    return kinds.map((k) => <SurfaceRow key={`${surface}-${k}`} kind={k} surface={surface} row={row} {...p} />);
  };
  const header = <ToothHeaderRow key="hdr" row={row} {...p} />;
  const mobility = <MobilityRow key="mob" row={row} {...p} />;
  const drawing = (surface: Surface) =>
    p.showDrawing && (
      <div className="grow drawing-row" key={`draw-${surface}`}>
        <div className="rlabel">{surface === 'buccal' ? 'Buccal' : p.arch === 'upper' ? 'Palatal' : 'Lingual'}</div>
        <div style={{ gridColumn: '2 / span 16' }}>
          <JawDrawing chart={p.chart} arch={p.arch} surface={surface} />
        </div>
      </div>
    );

  const oral = oralName(p.arch);
  return (
    <section className="jaw">
      <div className="jaw-inner">
        {p.arch === 'upper' ? (
          <>
            <div className="jaw-title">Maxilla — buccal</div>
            {header}
            {mobility}
            {surfaceRows('buccal', false)}
            {drawing('buccal')}
            {drawing('oral')}
            {surfaceRows('oral', true)}
            <div className="jaw-title">Maxilla — {oral}</div>
          </>
        ) : (
          <>
            <div className="jaw-title">Mandible — {oral}</div>
            {surfaceRows('oral', false)}
            {drawing('oral')}
            {drawing('buccal')}
            {surfaceRows('buccal', true)}
            {mobility}
            {header}
            <div className="jaw-title">Mandible — buccal</div>
          </>
        )}
      </div>
    </section>
  );
}

function colClass(chart: Chart, t: Fdi, extra = ''): string {
  const s = chart[t].status;
  const mid = t === 21 || t === 31 ? ' midline' : '';
  return `tcol ${extra}${mid} ${s === 'missing' ? 'missing' : s === 'implant' ? 'implant' : ''}`;
}

function ToothHeaderRow({ row, chart, cycleStatus }: GridProps & { row: readonly Fdi[] }) {
  return (
    <div className="grow">
      <div className="rlabel">Tooth</div>
      {row.map((t) => (
        <div key={t} className={colClass(chart, t, 'one')}>
          <button
            className={`toothnum ${chart[t].status}`}
            onClick={() => cycleStatus(t)}
            title="Tap to cycle present / missing / implant"
          >
            {t}
            {chart[t].status !== 'present' && <small>{chart[t].status === 'missing' ? 'missing' : 'implant'}</small>}
          </button>
        </div>
      ))}
    </div>
  );
}

function MobilityRow({ row, chart, cycleMob }: GridProps & { row: readonly Fdi[] }) {
  return (
    <div className="grow">
      <div className="rlabel">Mobility</div>
      {row.map((t) => {
        const tooth = chart[t];
        const disabled = tooth.status !== 'present';
        return (
          <div key={t} className={colClass(chart, t, 'one')}>
            <button className={`cell ${disabled ? 'disabled' : ''} ${(tooth.mobility ?? 0) >= 2 ? 'flag5' : ''}`} disabled={disabled} onClick={() => cycleMob(t)}>
              {disabled ? '' : tooth.mobility ?? ''}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SurfaceRow(p: GridProps & { kind: RowKind; surface: Surface; row: readonly Fdi[] }) {
  const { kind, surface, row, chart } = p;
  return (
    <div className="grow">
      <div className="rlabel">{ROW_LABEL[kind]}</div>
      {row.map((t) => {
        const tooth = chart[t];
        if (kind === 'furc') {
          let entrances = furcationEntrances(t).filter((e) => furcationSurface(e) === surface);
          // Mesial entrance on the mesial side of the screen.
          const distalLeft = quadrant(t) === 1 || quadrant(t) === 4;
          if (entrances.length === 2) {
            const [mesial, distal] = entrances[0] === 'MP' || entrances[0] === 'M' ? entrances : [entrances[1], entrances[0]];
            entrances = distalLeft ? [distal, mesial] : [mesial, distal];
          }
          const active = tooth.status === 'present' && entrances.length > 0;
          return (
            <div key={t} className={colClass(chart, t, entrances.length === 2 ? '' : 'one')} style={entrances.length === 2 ? { gridTemplateColumns: '1fr 1fr' } : undefined}>
              {active ? (
                entrances.map((e) => (
                  <button key={e} className="cell furc" title={`Furcation ${e}`} onClick={() => p.cycleFurc(t, e)}>
                    {ROMAN[tooth.furcation[e] ?? 0] || <span className="muted" style={{ fontWeight: 400 }}>·</span>}
                  </button>
                ))
              ) : (
                <span />
              )}
            </div>
          );
        }
        const sites = siteScreenOrder(t, surface);
        let cells: ReactNode;
        if (tooth.status === 'missing') {
          cells = sites.map((s) => <span key={s} />);
        } else {
          cells = sites.map((s) => {
            const site = tooth.sites[s];
            if (kind === 'bop' || kind === 'plaque' || kind === 'supp') {
              const on = site[kind];
              return (
                <button
                  key={s}
                  className="cell"
                  title={`${ROW_LABEL[kind]} ${t} ${siteLabel(t, s)}`}
                  onClick={() => p.toggleFlag(t, s, kind)}
                >
                  <span className={`dot ${kind} ${on ? 'on' : ''}`} />
                </button>
              );
            }
            if (kind === 'cal') {
              const cal = calOf(site);
              return (
                <span key={s} className={`cell calc ${cal !== null && cal >= 5 ? 'flag4' : ''}`}>
                  {cal ?? ''}
                </span>
              );
            }
            const idx = p.indexOf.get(fieldKey(t, s, kind));
            const v = site[kind];
            const flag = kind === 'pd' && v !== null ? (v >= 5 ? 'flag5' : v === 4 ? 'flag4' : '') : '';
            return (
              <button
                key={s}
                className={`cell ${flag} ${idx === p.cursor ? 'cur' : ''}`}
                onClick={() => idx !== undefined && p.dispatch({ type: 'goto', index: idx })}
                title={`${kind.toUpperCase()} ${t} ${siteLabel(t, s)}`}
              >
                {v === null ? '' : kind === 'gm' && v < 0 ? `−${-v}` : kind === 'gm' && v > 0 ? `+${v}` : v}
              </button>
            );
          });
        }
        return (
          <div key={t} className={colClass(chart, t)}>
            {cells}
          </div>
        );
      })}
    </div>
  );
}

