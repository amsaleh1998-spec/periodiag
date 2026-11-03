import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chart } from '../domain/chart';
import type { Exam, Patient } from '../domain/records';
import * as db from '../storage/db';
import { ChartEntry } from './charting/ChartEntry';
import { ChartView } from './chartview/ChartView';
import { PdfButton } from './pdf/PdfButton';
import { RadiographsView } from './radiographs/RadiographsView';
import { UpdateBanner } from './UpdateBanner';
import { Wizard } from './wizard/Wizard';
import { PatientsView } from './patients/PatientsView';
import { fmtDate } from './util';

export type Tab = 'patients' | 'entry' | 'chart' | 'radiographs' | 'diagnosis';

export function App() {
  const [tab, setTab] = useState<Tab>('patients');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Exam | null>(null);

  useEffect(() => {
    void db.requestPersistence();
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const e = pending.current;
    pending.current = null;
    if (!e) return;
    try {
      await db.saveExam(e);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  // Save immediately when the page is hidden (tablet switching apps, tab closing).
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  /** Update the open exam and autosave (debounced). */
  const updateExam = useCallback(
    (fn: (e: Exam) => Exam) => {
      setExam((cur) => {
        if (!cur) return cur;
        const next = { ...fn(cur), updatedAt: new Date().toISOString() };
        pending.current = next;
        setSaveState('saving');
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => void flush(), 400);
        setExams((list) => list.map((x) => (x.id === next.id ? next : x)));
        return next;
      });
    },
    [flush],
  );

  const setChart = useCallback((fn: (c: Chart) => Chart) => updateExam((e) => ({ ...e, chart: fn(e.chart) })), [updateExam]);

  const openExam = async (p: Patient, e: Exam, list: Exam[]) => {
    await flush();
    setPatient(p);
    setExams(list);
    setExam(e);
    setTab('entry');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'patients', label: 'Patients' },
    { id: 'entry', label: 'Charting' },
    { id: 'chart', label: 'Chart & summary' },
    { id: 'radiographs', label: 'Radiographs' },
    { id: 'diagnosis', label: 'Diagnosis' },
  ];

  return (
    <>
      <header className="topbar">
        <div className="brand">
          PerioDiag<small>2017 AAP/EFP</small>
        </div>
        {patient && exam && (
          <div className="context">
            {patient.label} · exam {fmtDate(exam.date)}
            {exams.length > 1 && ` (${exams.findIndex((x) => x.id === exam.id) + 1} of ${exams.length})`}{' '}
            <span className="small" style={{ opacity: 0.75 }}>
              {saveState === 'saving' ? '· saving…' : saveState === 'error' ? '· NOT SAVED' : '· saved'}
            </span>
          </div>
        )}
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              disabled={t.id !== 'patients' && !exam}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
          {exam && <PdfButton exam={exam} patient={patient} exams={exams} />}
        </nav>
      </header>
      <main>
        <UpdateBanner beforeReload={flush} />
        {tab === 'patients' && (
          <PatientsView
            current={patient}
            currentExamId={exam?.id}
            onOpenExam={openExam}
            beforeChange={flush}
            onPatientChanged={(p) => {
              if (patient?.id === p.id) setPatient(p);
            }}
            onPatientDeleted={(id) => {
              if (patient?.id === id) {
                pending.current = null;
                setPatient(null);
                setExam(null);
                setExams([]);
              }
            }}
            onExamDeleted={(id) => {
              if (exam?.id === id) {
                pending.current = null;
                setExam(null);
              }
            }}
          />
        )}
        {tab === 'entry' && exam && <ChartEntry exam={exam} setChart={setChart} updateExam={updateExam} />}
        {tab === 'chart' && exam && (
          <ChartView chart={exam.chart} pdf={<PdfButton exam={exam} patient={patient} exams={exams} sections={['chart']} variant="btn" label="PDF: chart" />} />
        )}
        {tab === 'radiographs' && exam && <RadiographsView exam={exam} patient={patient} exams={exams} updateExam={updateExam} />}
        {tab === 'diagnosis' && exam && <Wizard exam={exam} patient={patient} exams={exams} updateExam={updateExam} />}
      </main>
    </>
  );
}
