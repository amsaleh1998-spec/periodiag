import type { EntryAction, EntryField, EntryState } from '../../domain/entry';

interface Props {
  dispatch: (a: EntryAction) => void;
  state: EntryState;
  field?: EntryField;
}

/** On-screen keypad for tablets: sends the same actions as the physical keyboard. */
export function Keypad({ dispatch, state, field }: Props) {
  const digit = (d: number) => (
    <button key={d} className="key" onClick={() => dispatch({ type: 'digit', digit: d })}>
      {field?.kind === 'gm' && d !== 0 ? (state.positive ? '+' : '−') : ''}
      {state.tens ? 10 + d : d}
    </button>
  );
  return (
    <div className="keypad" onPointerDown={(e) => e.preventDefault() /* keep focus off buttons */}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(digit)}
      <button
        className={`key k-mod ${state.positive ? 'on' : ''}`}
        disabled={field?.kind !== 'gm'}
        onClick={() => dispatch({ type: 'plus' })}
        title="Positive gingival margin (coronal to the CEJ). Without it, GM values are entered as recession (negative)."
      >
        +
      </button>
      <button className={`key k-mod k-small ${state.tens ? 'on' : ''}`} onClick={() => dispatch({ type: 'tens' })}>
        10+
      </button>
      <button className="key k-small" onClick={() => dispatch({ type: 'back' })} title="Back and clear">
        ⌫
      </button>
      <button className="key k-bop k-small" onClick={() => dispatch({ type: 'toggle', flag: 'bop' })}>
        Bleed
      </button>
      <button className="key k-plaque k-small" onClick={() => dispatch({ type: 'toggle', flag: 'plaque' })}>
        Plaque
      </button>
      <button className="key k-supp k-small" onClick={() => dispatch({ type: 'toggle', flag: 'supp' })}>
        Supp
      </button>
      <button className="key" onClick={() => dispatch({ type: 'move', delta: -1 })}>
        ←
      </button>
      <button className="key k-small" onClick={() => dispatch({ type: 'skip' })}>
        Skip
      </button>
      <button className="key" onClick={() => dispatch({ type: 'move', delta: 1 })}>
        →
      </button>
      <button className="key k-small" onClick={() => dispatch({ type: 'clear' })}>
        Clear
      </button>
    </div>
  );
}
