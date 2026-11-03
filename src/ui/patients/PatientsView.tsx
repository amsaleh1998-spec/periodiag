import { useEffect, useRef, useState } from 'react';
import {
  buildExport,
  ImportError,
  newExam,
  newPatient,
  parseImport,
  todayIso,
  type Exam,
  type ExportFile,
  type Patient,
} from '../../domain/records';
import * as db from '../../storage/db';
import { downloadJson, fmtDate, safeFilename } from '../util';
import { demoRecords } from './demo';

interface Props {
  current: Patient | null;
  currentExamId?: string;
  onOpenExam: (p: Patient, e: Exam, exams: Exam[]) => void;
  beforeChange: () => Promise<void>;
  onPatientChanged: (p: Patient) => void;
  onPatientDeleted: (id: string) => void;
  onExamDeleted: (id: string) => void;
}

export function PatientsView(props: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(props.current?.id ?? null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [filter, setFilter] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDob, setNewDob] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = patients.find((p) => p.id === selectedId) ?? null;

  const reload = async () => {
    await props.beforeChange();
    setPatients(await db.listPatients());
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return setExams([]);
    void props.beforeChange().then(() => db.listExams(selectedId).then(setExams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const create = async () => {
    const label = newLabel.trim();
    if (!label) return;
    const p = newPatient(label, newDob || undefined);
    await db.savePatient(p);
    setNewLabel('');
    setNewDob('');
    await reload();
    setSelectedId(p.id);
  };

  const addDemo = async () => {
    const { patient, exam } = demoRecords();
    await db.savePatient(patient);
    await db.saveExam(exam);
    await reload();
    setSelectedId(patient.id);
  };

  const updatePatient = async (patch: Partial<Patient>) => {
    if (!selected) return;
    const p = { ...selected, ...patch };
    setPatients((list) => list.map((x) => (x.id === p.id ? p : x)));
    await db.savePatient(p);
    props.onPatientChanged(p);
  };

  const removePatient = async () => {
    if (!selected) return;
    if (!confirm(`Delete ${selected.label} and all ${exams.length} exam(s)? This cannot be undone.`)) return;
    await db.deletePatient(selected.id);
    props.onPatientDeleted(selected.id);
    setSelectedId(null);
    await reload();
  };

  const startExam = async () => {
    if (!selected) return;
    const latest = exams[exams.length - 1];
    const e = newExam(selected.id, latest);
    await db.saveExam(e);
    const list = [...exams, e];
    setExams(list);
    props.onOpenExam(selected, e, list);
  };

  const removeExam = async (e: Exam) => {
    if (!confirm(`Delete the exam of ${fmtDate(e.date)}?`)) return;
    await db.deleteExam(e.id);
    props.onExamDeleted(e.id);
    setExams((l) => l.filter((x) => x.id !== e.id));
  };

  const exportPatient = () => {
    if (!selected) return;
    downloadJson(`periodiag-${safeFilename(selected.label)}-${todayIso()}.json`, buildExport([selected], exams));
  };

  const exportAll = async () => {
    await props.beforeChange();
    const [ps, es] = await Promise.all([db.listPatients(), db.listAllExams()]);
    downloadJson(`periodiag-backup-${todayIso()}.json`, buildExport(ps, es));
  };

  const [pendingImport, setPendingImport] = useState<ExportFile | null>(null);

  const readImport = async (file: File) => {
    try {
      setPendingImport(parseImport(await file.text()));
    } catch (err) {
      setMessage(err instanceof ImportError ? err.message : `Import failed: ${String(err)}`);
    }
  };

  const applyImport = async (mode: 'merge' | 'replace') => {
    const data = pendingImport;
    if (!data) return;
    if (mode === 'replace' && !confirm('Replace ALL records on this device with the imported file?')) return;
    setPendingImport(null);
    await props.beforeChange();
    await db.importRecords(data.patients, data.exams, mode);
    setMessage(`Imported ${data.patients.length} patient(s) and ${data.exams.length} exam(s) (${mode}).`);
    await reload();
    if (selectedId) setExams(await db.listExams(selectedId));
  };

  const shown = patients.filter((p) => p.label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <div className="banner">
        Records are stored only in this browser on this device. Export a backup regularly (Export all).
      </div>
      {message && (
        <div className="banner" style={{ background: 'var(--primary-soft)', borderColor: '#aac4de', color: 'var(--primary)' }}>
          {message}{' '}
          <button className="btn sm" onClick={() => setMessage(null)}>
            OK
          </button>
        </div>
      )}
      <div className="patients">
        <section className="card">
          <h2>Patients</h2>
          <label className="field">
            Search
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name or code" />
          </label>
          <ul className="list" style={{ margin: '10px 0' }}>
            {shown.map((p) => (
              <li key={p.id}>
                <button className={p.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(p.id)}>
                  {p.label}
                  {p.dateOfBirth && <span className="muted small"> · {fmtDate(p.dateOfBirth)}</span>}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="muted small">No patients yet.</li>}
          </ul>
          <h3>New patient</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field">
              Name or code
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
            </label>
            <label className="field">
              Date of birth (optional, gives age automatically)
              <input type="date" value={newDob} onChange={(e) => setNewDob(e.target.value)} />
            </label>
            <button className="btn primary" onClick={() => void create()} disabled={!newLabel.trim()}>
              Add patient
            </button>
          </div>
          <h3>Backup</h3>
          {pendingImport && (
            <div className="warning">
              Import {pendingImport.patients.length} patient(s) and {pendingImport.exams.length} exam(s)?
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn sm primary" onClick={() => void applyImport('merge')} title="Records with the same ID are overwritten">
                  Merge
                </button>
                <button className="btn sm danger" onClick={() => void applyImport('replace')}>
                  Replace all
                </button>
                <button className="btn sm" onClick={() => setPendingImport(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="row">
            <button className="btn" onClick={() => void exportAll()}>
              Export all
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Import…
            </button>
            <button className="btn" onClick={() => void addDemo()} title="Adds a sample patient with a charted exam">
              Load demo patient
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void readImport(f);
              }}
            />
          </div>
        </section>

        <section className="card">
          {!selected ? (
            <p className="muted">Select or add a patient.</p>
          ) : (
            <>
              <div className="row">
                <h2 style={{ margin: 0 }}>{selected.label}</h2>
                <span className="spacer" />
                <button className="btn" onClick={exportPatient}>
                  Export patient (JSON)
                </button>
                <button className="btn danger" onClick={() => void removePatient()}>
                  Delete patient
                </button>
              </div>
              <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
                <label className="field">
                  Name or code
                  <input value={selected.label} onChange={(e) => void updatePatient({ label: e.target.value })} />
                </label>
                <label className="field">
                  Date of birth
                  <input type="date" value={selected.dateOfBirth ?? ''} onChange={(e) => void updatePatient({ dateOfBirth: e.target.value || undefined })} />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 220 }}>
                  Notes
                  <input value={selected.notes ?? ''} onChange={(e) => void updatePatient({ notes: e.target.value || undefined })} />
                </label>
              </div>

              <h3>Examinations</h3>
              <table className="plain">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Diagnosis</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...exams].reverse().map((e) => (
                    <tr key={e.id}>
                      <td>
                        {fmtDate(e.date)}
                        {e.id === props.currentExamId && <span className="chip auto">open</span>}
                      </td>
                      <td>{e.finalLabel ?? <span className="muted">not diagnosed yet</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn sm primary" onClick={() => props.onOpenExam(selected, e, exams)}>
                          Open
                        </button>{' '}
                        <button className="btn sm danger" onClick={() => void removeExam(e)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {exams.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No examinations yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={() => void startExam()}>
                  New examination
                </button>
                {exams.length > 0 && <span className="muted small">Missing teeth and implants are copied from the latest exam.</span>}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
