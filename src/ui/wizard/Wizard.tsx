import { useEffect, useMemo, useState } from 'react';
import { missingTeeth } from '../../domain/chart';
import {
  classify,
  EXTENT_LABEL,
  finalize,
  ROMAN,
  rblThird,
  STATUS_LABEL,
  type ClinicalInputs,
  type Diagnosis,
  type DiagnosisKind,
  type Extent,
  type Grade,
  type Override,
  type Stage,
  type Status,
} from '../../domain/classify';
import { ageOn, type Exam, type Patient } from '../../domain/records';
import { unit, type Fdi } from '../../domain/teeth';
import { fmtDate } from '../util';
import { Choices, NumberInput, Question, Reasons, YesNo } from './controls';
import { effectiveInputs, historyFor, priorForGrading } from './history';

interface Props {
  exam: Exam;
  patient: Patient | null;
  exams: Exam[];
  updateExam: (fn: (e: Exam) => Exam) => void;
}

type StepId = 'case' | 'patient' | 'xray' | 'records' | 'risk' | 'complexity' | 'result';
const STEPS: { id: StepId; title: string; perioOnly: boolean }[] = [
  { id: 'case', title: 'Case definition', perioOnly: false },
  { id: 'patient', title: 'Age & tooth loss', perioOnly: true },
  { id: 'xray', title: 'Radiographs', perioOnly: true },
  { id: 'records', title: 'Previous records', perioOnly: true },
  { id: 'risk', title: 'Smoking & diabetes', perioOnly: true },
  { id: 'complexity', title: 'Complexity', perioOnly: true },
  { id: 'result', title: 'Diagnosis', perioOnly: false },
];

export function useDiagnosis(exam: Exam, patient: Patient | null, exams: Exam[]) {
  const inputs = effectiveInputs(exam, patient);
  const history = useMemo(() => historyFor(exam, exams), [exam, exams]);
  const diagnosis = useMemo(() => classify(exam.chart, inputs, history), [exam.chart, inputs, history]);
  const final = finalize(diagnosis, exam.override);
  return { inputs, history, diagnosis, final };
}

export function Wizard({ exam, patient, exams, updateExam }: Props) {
  const [step, setStep] = useState<StepId>('case');
  const { inputs, diagnosis, final } = useDiagnosis(exam, patient, exams);
  const perio = diagnosis.kind === 'periodontitis';
  const visible = STEPS.filter((s) => !s.perioOnly || perio);
  const idx = Math.max(0, visible.findIndex((s) => s.id === step));
  const current = visible[idx];

  const setInputs = (fn: (i: ClinicalInputs) => ClinicalInputs) => updateExam((e) => ({ ...e, inputs: fn(e.inputs) }));
  const setOverride = (patch: Partial<Override>) => updateExam((e) => ({ ...e, override: { ...e.override, ...patch } }));

  // Store the final label and stage on the exam (patient list + "stage never goes down" history).
  const finalStage = final.kind === 'periodontitis' ? final.stage : undefined;
  useEffect(() => {
    if (exam.finalLabel !== final.label || exam.finalStage !== finalStage) {
      updateExam((e) => ({ ...e, finalLabel: final.label, finalStage }));
    }
  }, [final.label, finalStage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (diagnosis.kind === 'insufficient') {
    return (
      <section className="card">
        <h2>Diagnosis</h2>
        <p>{diagnosis.label}.</p>
        <Reasons reasons={diagnosis.notes} />
      </section>
    );
  }

  const props = { exam, patient, inputs, diagnosis, setInputs };
  return (
    <div className="wizard">
      <nav className="card" style={{ padding: 8 }}>
        <ul className="steps">
          {visible.map((s, i) => (
            <li key={s.id}>
              <button className={`${s.id === current.id ? 'active' : ''} ${i < idx ? 'done' : ''}`} onClick={() => setStep(s.id)}>
                <span className="n">{i + 1}</span>
                {s.title}
              </button>
            </li>
          ))}
        </ul>
        <div className="small muted" style={{ padding: '8px 12px' }}>
          {perio ? 'Periodontitis case: staging & grading questions shown.' : 'Not a periodontitis case: staging questions skipped.'}
        </div>
      </nav>
      <section className="card">
        <h2>{current.title}</h2>
        {current.id === 'case' && <CaseStep {...props} />}
        {current.id === 'patient' && <PatientStep {...props} />}
        {current.id === 'xray' && <XrayStep {...props} />}
        {current.id === 'records' && <RecordsStep {...props} exams={exams} />}
        {current.id === 'risk' && <RiskStep {...props} />}
        {current.id === 'complexity' && <ComplexityStep {...props} />}
        {current.id === 'result' && <ResultStep diagnosis={diagnosis} override={exam.override ?? {}} setOverride={setOverride} final={final} />}
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn" disabled={idx === 0} onClick={() => setStep(visible[idx - 1].id)}>
            ← Back
          </button>
          <span className="spacer" />
          {idx < visible.length - 1 && (
            <button className="btn primary" onClick={() => setStep(visible[idx + 1].id)}>
              Next →
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

interface StepProps {
  exam: Exam;
  patient: Patient | null;
  inputs: ClinicalInputs;
  diagnosis: Diagnosis;
  setInputs: (fn: (i: ClinicalInputs) => ClinicalInputs) => void;
}

// ------------------------------------------------------------------ steps

function CaseStep({ inputs, diagnosis, setInputs }: StepProps) {
  const cd = diagnosis.caseDefinition;
  const toggle = (t: Fdi) =>
    setInputs((i) => ({ ...i, nonPerioTeeth: i.nonPerioTeeth.includes(t) ? i.nonPerioTeeth.filter((x) => x !== t) : [...i.nonPerioTeeth, t] }));
  return (
    <>
      <div className={`result ${cd.met ? '' : 'overridden'}`} style={{ fontSize: 16 }}>
        {cd.met ? 'Periodontitis case definition met' : 'Periodontitis case definition not met'}
      </div>
      <Reasons reasons={cd.reasons} />
      {cd.candidateTeeth.length > 0 && (
        <Question
          title="Could the attachment loss at any of these teeth have a non-periodontal cause?"
          hint="e.g. trauma or tooth-brushing recession, caries or a restoration extending to the cervical area, distal of a second molar after third-molar extraction or malposition, endodontic lesion draining through the periodontium, vertical root fracture. Ticked teeth are left out of the case definition, staging and extent."
        >
          <div className="row">
            {cd.candidateTeeth.map((t) => (
              <label key={t} className="check" style={{ minWidth: 70 }}>
                <input type="checkbox" checked={inputs.nonPerioTeeth.includes(t)} onChange={() => toggle(t)} />
                {t}
                {unit(t) === 8 && <span className="chip">3rd molar</span>}
              </label>
            ))}
          </div>
        </Question>
      )}
      {!cd.met && diagnosis.gingival && (
        <>
          <h3>Health or gingivitis</h3>
          <Reasons reasons={diagnosis.gingival.reasons} />
        </>
      )}
      {diagnosis.notes
        .filter((n) => n.source === 'chart')
        .map((n, i) => (
          <div key={i} className="warning">
            {n.text}
          </div>
        ))}
    </>
  );
}

function PatientStep({ exam, patient, inputs, setInputs }: StepProps) {
  const dobAge = patient?.dateOfBirth ? ageOn(patient.dateOfBirth, exam.date) : undefined;
  const missing = missingTeeth(exam.chart);
  const nonThird = missing.filter((t) => unit(t) !== 8);
  return (
    <>
      <Question
        title="Patient age"
        hint={dobAge !== undefined ? `Calculated from the date of birth: ${dobAge} years. Type a value only to override it.` : 'Needed for % bone loss / age (grading).'}
      >
        <NumberInput
          value={exam.inputs.age ?? (dobAge !== undefined ? undefined : inputs.age)}
          onChange={(age) => setInputs((i) => ({ ...i, age }))}
          min={1}
          max={110}
          suffix={dobAge !== undefined && exam.inputs.age === undefined ? `years (using ${dobAge})` : 'years'}
        />
      </Question>
      <Question
        title="How many teeth were lost due to periodontitis?"
        hint={`The chart shows ${missing.length} missing tooth/teeth${missing.length ? ` (${missing.join(', ')}; ${nonThird.length} excluding third molars)` : ''}. Count only teeth lost because of periodontitis.`}
      >
        <div className="row">
          <Choices
            value={inputs.teethLostToPerio === undefined ? undefined : Math.min(inputs.teethLostToPerio, 5)}
            onChange={(v) => setInputs((i) => ({ ...i, teethLostToPerio: v }))}
            options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })).concat([{ value: 5, label: '5 or more' }])}
          />
          {(inputs.teethLostToPerio ?? 0) >= 5 && (
            <NumberInput value={inputs.teethLostToPerio} min={5} max={32} onChange={(v) => setInputs((i) => ({ ...i, teethLostToPerio: v ?? 5 }))} width={80} />
          )}
        </div>
      </Question>
    </>
  );
}

function XrayStep({ inputs, setInputs }: StepProps) {
  const presets = [
    { value: 10, label: 'Coronal third, < 15 %' },
    { value: 25, label: 'Coronal third, 15–33 %' },
    { value: 50, label: 'Middle third' },
    { value: 75, label: 'Apical third' },
  ];
  return (
    <>
      <Question
        title="Radiographic bone loss at the worst site (% of root length)"
        hint={
          inputs.rblPercent !== undefined
            ? `${inputs.rblPercent} % → ${rblThird(inputs.rblPercent)}. Measure from the CEJ minus 1 mm to the apex.`
            : 'Leave empty if no radiographs are available: staging will use CAL only and grading will default to B unless other evidence exists.'
        }
      >
        <div className="row">
          <NumberInput value={inputs.rblPercent} min={0} max={100} suffix="%" onChange={(v) => setInputs((i) => ({ ...i, rblPercent: v }))} />
          <span className="muted small">or pick:</span>
          <Choices value={inputs.rblPercent} onChange={(v) => setInputs((i) => ({ ...i, rblPercent: v }))} options={presets} />
        </div>
      </Question>
      <Question title="Vertical (angular) bone defect ≥ 3 mm?">
        <YesNo value={inputs.verticalDefect3mm} onChange={(v) => setInputs((i) => ({ ...i, verticalDefect3mm: v }))} />
      </Question>
    </>
  );
}

function RecordsStep({ exam, inputs, setInputs, exams }: StepProps & { exams: Exam[] }) {
  const prior = priorForGrading(exam, exams);
  const rec = inputs.previousRecord;
  const set = (patch: Partial<NonNullable<ClinicalInputs['previousRecord']>>) =>
    setInputs((i) => ({ ...i, previousRecord: { available: true, ...i.previousRecord, ...patch } }));
  return (
    <>
      {prior && (
        <div className="warning" style={{ background: 'var(--primary-soft)' }}>
          An earlier exam of this patient ({fmtDate(prior.exam.date)}, {prior.years.toFixed(1)} years earlier) is stored. Worst interdental CAL increase:{' '}
          <b>{prior.comparison.maxIncrease} mm</b>
          {prior.comparison.tooth && ` at ${prior.comparison.tooth} ${prior.comparison.site}`} ({prior.comparison.comparedSites} sites compared).{' '}
          <button
            className="btn sm primary"
            onClick={() => set({ available: true, years: Number(prior.years.toFixed(1)), changeMm: prior.comparison.maxIncrease, measure: 'cal' })}
          >
            Use this
          </button>
        </div>
      )}
      <Question title="Are there previous records (CAL or radiographic bone level) from about 5 years ago?">
        <YesNo
          value={rec?.available}
          onChange={(v) => setInputs((i) => ({ ...i, previousRecord: v === undefined ? undefined : { ...i.previousRecord, available: v } }))}
        />
      </Question>
      {rec?.available && (
        <>
          <Question title="Measure">
            <Choices
              clearable={false}
              value={rec.measure ?? 'cal'}
              onChange={(v) => set({ measure: v })}
              options={[
                { value: 'cal', label: 'Clinical attachment level' },
                { value: 'bone', label: 'Radiographic bone level' },
              ]}
            />
          </Question>
          <Question title="Interval between the records" hint="Values are scaled to 5 years.">
            <NumberInput value={rec.years} min={0.5} max={30} step={0.5} suffix="years" onChange={(v) => set({ years: v })} />
          </Question>
          <Question title="Additional loss at the worst site over that interval" hint="0 = no loss (Grade A); < 2 mm per 5 years → B; ≥ 2 mm → C.">
            <NumberInput value={rec.changeMm} min={0} max={20} step={0.5} suffix="mm" onChange={(v) => set({ changeMm: v })} />
          </Question>
        </>
      )}
    </>
  );
}

function RiskStep({ inputs, setInputs }: StepProps) {
  const dm = inputs.diabetes;
  return (
    <>
      <Question title="Smoking">
        <Choices
          value={inputs.smoking}
          onChange={(v) => setInputs((i) => ({ ...i, smoking: v }))}
          options={[
            { value: 'none', label: 'Non-smoker' },
            { value: 'lt10', label: '< 10 cigarettes/day' },
            { value: 'ge10', label: '≥ 10 cigarettes/day' },
          ]}
        />
      </Question>
      <Question title="Diabetes">
        <Choices
          value={dm?.diabetic}
          onChange={(v) => setInputs((i) => ({ ...i, diabetes: v === undefined ? undefined : { ...i.diabetes, diabetic: v } }))}
          options={[
            { value: false, label: 'No diabetes' },
            { value: true, label: 'Diabetes' },
          ]}
        />
      </Question>
      {dm?.diabetic && (
        <Question title="Latest HbA1c" hint="< 7.0 % → at least Grade B; ≥ 7.0 % → Grade C. Leave empty if unknown (treated as < 7.0 %).">
          <NumberInput
            value={dm.hba1c}
            min={3}
            max={20}
            step={0.1}
            suffix="%"
            onChange={(v) => setInputs((i) => ({ ...i, diabetes: { diabetic: true, hba1c: v } }))}
          />
        </Question>
      )}
    </>
  );
}

function ComplexityStep({ inputs, diagnosis, setInputs }: StepProps) {
  const f = diagnosis.stage!.factors;
  const cx = inputs.complexity;
  const setCx = (patch: Partial<ClinicalInputs['complexity']>) => setInputs((i) => ({ ...i, complexity: { ...i.complexity, ...patch } }));
  const autoTrauma = f.mobilityTeeth.length > 0;
  return (
    <>
      <h3 style={{ marginTop: 0 }}>From the chart</h3>
      <div className="row small">
        <span className="chip auto">Max PD {f.maxPd ?? '–'} mm{f.maxPdTooth ? ` (${f.maxPdTooth})` : ''}</span>
        <span className="chip auto">Furcation II/III: {f.furcationTeeth.length ? f.furcationTeeth.join(', ') : 'none'}</span>
        <span className="chip auto">Mobility ≥ 2: {f.mobilityTeeth.length ? f.mobilityTeeth.join(', ') : 'none'}</span>
        <span className="chip auto">{f.remainingTeeth} natural teeth</span>
      </div>

      <h3>Stage III / IV complexity</h3>
      <Question title="Ridge defect">
        <Choices
          value={cx.ridgeDefect}
          onChange={(v) => setCx({ ridgeDefect: v })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'moderate', label: 'Moderate (Stage III)' },
            { value: 'severe', label: 'Severe (Stage IV)' },
          ]}
        />
      </Question>
      <Question title="Masticatory dysfunction?">
        <YesNo value={cx.masticatoryDysfunction} onChange={(v) => setCx({ masticatoryDysfunction: v })} />
      </Question>
      <Question
        title="Secondary occlusal trauma (tooth mobility degree ≥ 2)?"
        hint={cx.occlusalTrauma === undefined ? `Taken from the chart: ${autoTrauma ? `yes (${f.mobilityTeeth.join(', ')})` : 'no'}. Answer to override.` : 'Overrides the chart.'}
      >
        <YesNo value={cx.occlusalTrauma} onChange={(v) => setCx({ occlusalTrauma: v })} />
      </Question>
      <Question title="Bite collapse?">
        <YesNo value={cx.biteCollapse} onChange={(v) => setCx({ biteCollapse: v })} />
      </Question>
      <Question title="Drifting or flaring of teeth?">
        <YesNo value={cx.driftingFlaring} onChange={(v) => setCx({ driftingFlaring: v })} />
      </Question>
      <Question
        title="Opposing (occluding) pairs"
        hint={`Counted from the chart: ${f.opposingPairs} (implant crowns count). Fewer than 10 pairs (< 20 remaining teeth) is a Stage IV factor. Type a value only to correct it.`}
      >
        <NumberInput value={cx.opposingPairs} min={0} max={16} onChange={(v) => setCx({ opposingPairs: v })} suffix={cx.opposingPairs === undefined ? `pairs (using ${f.opposingPairs})` : 'pairs'} />
      </Question>
    </>
  );
}

function ResultStep(props: {
  diagnosis: Diagnosis;
  override: Override;
  final: ReturnType<typeof finalize>;
  setOverride: (p: Partial<Override>) => void;
}) {
  const { diagnosis: d, override: o, final, setOverride } = props;
  const opt = <T extends string | number>(values: T[], label: (v: T) => string, computed: T | undefined) =>
    values.map((v) => ({
      value: v,
      label: (
        <>
          {label(v)}
          {v === computed && <span className="chip auto">computed</span>}
        </>
      ),
    }));
  return (
    <>
      <div className={`result ${final.overridden.length ? 'overridden' : ''}`}>{final.label}</div>
      {final.overridden.length > 0 && (
        <p className="small">
          Clinician override: {final.overridden.join(', ')}. Computed: <i>{d.label}</i>
        </p>
      )}
      {d.notes.map((n, i) => (
        <div key={i} className="warning">
          {n.text}
        </div>
      ))}

      <div className="component">
        <h4>
          Case definition <span className="val">{d.caseDefinition.met ? 'met' : 'not met'}</span>
        </h4>
        <Reasons reasons={d.caseDefinition.reasons} />
      </div>
      {d.gingival && (
        <div className="component">
          <h4>
            {d.gingival.kind === 'health' ? 'Health' : 'Gingivitis'} <span className="val">{d.gingival.extent ?? ''}</span>
          </h4>
          <Reasons reasons={d.gingival.reasons} />
        </div>
      )}
      {d.stage && (
        <div className="component">
          <h4>
            Stage <span className="val">{ROMAN[d.stage.value]}</span>
          </h4>
          <Reasons reasons={d.stage.reasons} />
        </div>
      )}
      {d.extent && (
        <div className="component">
          <h4>
            Extent <span className="val">{EXTENT_LABEL[d.extent.value]}</span>
          </h4>
          <Reasons reasons={d.extent.reasons} />
        </div>
      )}
      {d.grade && (
        <div className="component">
          <h4>
            Grade <span className="val">{d.grade.value}</span>
          </h4>
          <Reasons reasons={d.grade.reasons} />
        </div>
      )}
      {d.status && (
        <div className="component">
          <h4>
            Current status <span className="val">{STATUS_LABEL[d.status.value]}</span>
          </h4>
          <Reasons reasons={d.status.reasons} />
        </div>
      )}

      <div className="component no-print">
        <h4>Clinician override</h4>
        <p className="small muted">Selecting a value different from the computed one overrides it. Tap the selected value again to go back to the computed value.</p>
        <Question title="Diagnosis">
          <Choices<DiagnosisKind>
            value={o.kind}
            onChange={(kind) => setOverride({ kind })}
            options={opt<DiagnosisKind>(['health', 'gingivitis', 'periodontitis'], (v) => v[0].toUpperCase() + v.slice(1), d.kind)}
          />
        </Question>
        {final.kind === 'periodontitis' && (
          <>
            <Question title="Stage">
              <Choices<Stage> value={o.stage} onChange={(stage) => setOverride({ stage })} options={opt<Stage>([1, 2, 3, 4], (v) => `Stage ${ROMAN[v]}`, d.stage?.value)} />
            </Question>
            <Question title="Extent">
              <Choices<Extent> value={o.extent} onChange={(extent) => setOverride({ extent })} options={opt<Extent>(['localized', 'generalized', 'molar-incisor'], (v) => EXTENT_LABEL[v], d.extent?.value)} />
            </Question>
            <Question title="Grade">
              <Choices<Grade> value={o.grade} onChange={(grade) => setOverride({ grade })} options={opt<Grade>(['A', 'B', 'C'], (v) => `Grade ${v}`, d.grade?.value)} />
            </Question>
            <Question title="Current status">
              <Choices<Status> value={o.status} onChange={(status) => setOverride({ status })} options={opt<Status>(['stable', 'remission', 'unstable'], (v) => STATUS_LABEL[v], d.status?.value)} />
            </Question>
          </>
        )}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, minWidth: 260 }}>
            Free-text diagnosis (replaces the label)
            <input value={o.label ?? ''} onChange={(e) => setOverride({ label: e.target.value || undefined })} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 260 }}>
            Reason for override / note
            <input value={o.note ?? ''} onChange={(e) => setOverride({ note: e.target.value || undefined })} />
          </label>
          <button className="btn" onClick={() => setOverride({ kind: undefined, stage: undefined, grade: undefined, extent: undefined, status: undefined, label: undefined })}>
            Reset to computed
          </button>
        </div>
      </div>
    </>
  );
}
