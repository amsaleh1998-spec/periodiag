import { useState } from 'react';
import type { Exam, Patient } from '../../domain/records';
import { downloadBlob, safeFilename } from '../util';

export function PdfButton({ exam, patient, exams }: { exam: Exam; patient: Patient | null; exams: Exam[] }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { buildPdf, reportData } = await import('./report');
      const blob = await buildPdf(reportData(exam, patient, exams));
      downloadBlob(`periodiag-${safeFilename(patient?.label ?? 'patient')}-${exam.date}.pdf`, blob);
    } catch (err) {
      alert(`PDF export failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="tab" onClick={() => void run()} disabled={busy} title="Chart, summary and diagnosis as PDF">
      {busy ? 'Building PDF…' : 'Export PDF'}
    </button>
  );
}
