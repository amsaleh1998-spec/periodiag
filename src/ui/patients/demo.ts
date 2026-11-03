// Deterministic sample patient for trying the app (generalized periodontitis).
import { emptyChart, type Chart } from '../../domain/chart';
import { newExam, newPatient, type Exam, type Patient } from '../../domain/records';
import { ALL_TEETH, SITES, isInterdental, unit } from '../../domain/teeth';

export function demoRecords(): { patient: Patient; exam: Exam } {
  const patient = newPatient('Demo patient (sample data)', '1972-04-10');
  const chart: Chart = emptyChart();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const t of ALL_TEETH) {
    const tooth = chart[t];
    if (unit(t) === 8 || t === 46) {
      tooth.status = 'missing';
      continue;
    }
    if (t === 36) tooth.status = 'implant';
    const molar = unit(t) >= 6 && tooth.status === 'present';
    for (const s of SITES) {
      const deep = molar && isInterdental(s);
      const pd = deep ? 5 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 3);
      const gm = [31, 41, 32, 42, 13, 23].includes(t) ? -Math.floor(rnd() * 3) : Math.floor(rnd() * 3) - 1;
      tooth.sites[s] = { pd, gm, bop: rnd() < (deep ? 0.7 : 0.15), plaque: rnd() < 0.3, supp: deep && rnd() < 0.1 };
    }
    if (tooth.status === 'present') tooth.mobility = t === 31 || t === 41 ? 2 : unit(t) === 6 ? 1 : 0;
  }
  chart[16].furcation = { B: 2, MP: 1, DP: 2 };
  chart[26].furcation = { B: 1 };
  chart[47].furcation = { B: 2, L: 1 };
  const exam = { ...newExam(patient.id), chart };
  return { patient, exam };
}
