import { useState } from 'react';
import { hasImages } from '../../domain/radiographs';
import type { Exam, Patient } from '../../domain/records';
import { downloadBlob, safeFilename } from '../util';
import type { PdfSection } from './report';

interface Props {
  exam: Exam;
  patient: Patient | null;
  exams: Exam[];
  /** Sections to include; the full report leaves out radiographs when none are attached. */
  sections?: PdfSection[];
  label?: string;
  variant?: 'tab' | 'btn';
}

const SUFFIX: Record<string, string> = { chart: 'chart', diagnosis: 'diagnosis', radiographs: 'radiographs' };

export function PdfButton({ exam, patient, exams, sections, label = 'Export PDF', variant = 'tab' }: Props) {
  const [busy, setBusy] = useState(false);
  const full = !sections;
  const wanted: PdfSection[] = sections ?? (['chart', 'diagnosis', 'radiographs'] as PdfSection[]).filter((x) => x !== 'radiographs' || hasImages(exam.radiographs));
  const disabled = busy || (wanted.length === 1 && wanted[0] === 'radiographs' && !hasImages(exam.radiographs));

  const run = async () => {
    setBusy(true);
    try {
      const { buildPdf, reportData } = await import('./report');
      const blob = await buildPdf(reportData(exam, patient, exams), wanted);
      const suffix = full ? 'report' : wanted.map((x) => SUFFIX[x]).join('-');
      downloadBlob(`periodiag-${safeFilename(patient?.label ?? 'patient')}-${exam.date}-${suffix}.pdf`, blob);
    } catch (err) {
      alert(`PDF export failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className={variant === 'tab' ? 'tab' : 'btn'}
      onClick={() => void run()}
      disabled={disabled}
      title={full ? 'Full report: chart, diagnosis and radiographs' : `PDF of this page only`}
    >
      {busy ? 'Building PDF…' : label}
    </button>
  );
}
