import type { ReactNode } from 'react';
import type { Reason } from '../../domain/classify';

export function Choices<T extends string | number | boolean>(props: {
  value: T | undefined;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T | undefined) => void;
  /** Clicking the selected option again clears it. */
  clearable?: boolean;
}) {
  return (
    <div className="choices">
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          className={`choice ${props.value === o.value ? 'on' : ''}`}
          onClick={() => props.onChange(props.clearable !== false && props.value === o.value ? undefined : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function YesNo(props: { value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  return (
    <Choices
      value={props.value}
      onChange={props.onChange}
      options={[
        { value: false, label: 'No' },
        { value: true, label: 'Yes' },
      ]}
    />
  );
}

export function Question(props: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="q">
      <div className="qt">{props.title}</div>
      {props.children}
      {props.hint && <div className="hint">{props.hint}</div>}
    </div>
  );
}

/** Numeric input that stores undefined when empty. */
export function NumberInput(props: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  width?: number;
}) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <input
        type="number"
        inputMode="decimal"
        value={props.value ?? ''}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        style={{ width: props.width ?? 100, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, minHeight: 40 }}
        onChange={(e) => {
          const v = e.target.value === '' ? undefined : Number(e.target.value);
          props.onChange(v === undefined || Number.isNaN(v) ? undefined : v);
        }}
      />
      {props.suffix && <span className="muted">{props.suffix}</span>}
    </span>
  );
}

const SOURCE_LABEL: Record<Reason['source'], string> = {
  chart: 'chart',
  wizard: 'answer',
  history: 'history',
  default: 'default',
  override: 'override',
};

export function Reasons({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="reasons">
      {reasons.map((r, i) => (
        <li key={i} className={r.decisive ? 'decisive' : ''}>
          {r.text}
          <span className="src">{SOURCE_LABEL[r.source]}</span>
        </li>
      ))}
    </ul>
  );
}
