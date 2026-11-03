import { compareCharts, type ChartComparison } from '../../domain/chart';
import type { ClinicalInputs, History, Stage } from '../../domain/classify';
import { ageOn, yearsBetween, type Exam, type Patient } from '../../domain/records';

/** Earlier exams of the same patient (strictly before this exam's date). */
export function earlierExams(exam: Exam, exams: Exam[]): Exam[] {
  return exams.filter((e) => e.id !== exam.id && e.date < exam.date);
}

export function historyFor(exam: Exam, exams: Exam[]): History {
  let best: { stage: Stage; date: string } | undefined;
  for (const e of earlierExams(exam, exams)) {
    if (e.finalStage && (!best || e.finalStage > best.stage)) best = { stage: e.finalStage, date: e.date };
  }
  return best ? { previousMaxStage: best.stage, previousMaxStageDate: best.date } : {};
}

export interface PriorComparison {
  exam: Exam;
  years: number;
  comparison: ChartComparison;
}

/** The earlier exam closest to 5 years before this one (at least 2 years back), compared site by site. */
export function priorForGrading(exam: Exam, exams: Exam[]): PriorComparison | undefined {
  const candidates = earlierExams(exam, exams)
    .map((e) => ({ exam: e, years: yearsBetween(e.date, exam.date) }))
    .filter((c) => c.years >= 2)
    .sort((a, b) => Math.abs(a.years - 5) - Math.abs(b.years - 5));
  const c = candidates[0];
  if (!c) return undefined;
  const comparison = compareCharts(c.exam.chart, exam.chart);
  return comparison.comparedSites > 0 ? { ...c, comparison } : undefined;
}

/** Wizard answers with the age filled in from the date of birth when not entered. */
export function effectiveInputs(exam: Exam, patient: Patient | null): ClinicalInputs {
  const i = exam.inputs;
  if (i.age !== undefined || !patient?.dateOfBirth) return i;
  return { ...i, age: ageOn(patient.dateOfBirth, exam.date) };
}
