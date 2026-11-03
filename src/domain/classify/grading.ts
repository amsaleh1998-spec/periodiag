// Grading (Tonetti, Greenwell & Kornman 2018).
// Primary criteria, in order of preference:
//   direct evidence (CAL or bone loss over 5 years): none → A, < 2 mm → B, ≥ 2 mm → C
//   indirect evidence (% bone loss / age):          < 0.25 → A, 0.25–1.0 → B, > 1.0 → C
//   no evidence → Grade B
// Modifiers can only raise the grade:
//   smoking < 10/day → at least B, ≥ 10/day → C
//   diabetes HbA1c < 7.0 % → at least B, ≥ 7.0 % → C

import type { ClinicalInputs, Finding, Grade, Reason, Source } from './types';

export interface GradeResult extends Finding<Grade> {
  basis: 'direct' | 'indirect' | 'default';
  /** % bone loss / age when available. */
  ratio?: number;
}

const ORDER: Grade[] = ['A', 'B', 'C'];
const higher = (a: Grade, b: Grade): boolean => ORDER.indexOf(a) > ORDER.indexOf(b);

export function directGrade(lossPer5Years: number): Grade {
  if (lossPer5Years <= 0) return 'A';
  return lossPer5Years < 2 ? 'B' : 'C';
}

export function indirectGrade(ratio: number): Grade {
  if (ratio < 0.25) return 'A';
  return ratio <= 1.0 ? 'B' : 'C';
}

export function gradePeriodontitis(inputs: ClinicalInputs): GradeResult {
  const reasons: Reason[] = [];
  let value: Grade;
  let decisive: Reason;
  let basis: GradeResult['basis'];

  const set = (g: Grade, text: string, source: Source) => {
    const r = { text, source };
    reasons.push(r);
    value = g;
    decisive = r;
  };

  const prev = inputs.previousRecord;
  const ratio =
    inputs.rblPercent !== undefined && inputs.age !== undefined && inputs.age > 0 ? inputs.rblPercent / inputs.age : undefined;

  if (prev?.available && prev.changeMm !== undefined && prev.years !== undefined && prev.years > 0) {
    const per5 = (prev.changeMm * 5) / prev.years;
    const g = directGrade(per5);
    const what = prev.measure === 'bone' ? 'radiographic bone loss' : 'CAL loss';
    const scaled = Math.abs(prev.years - 5) > 0.25 ? ` (${prev.changeMm} mm over ${prev.years.toFixed(1)} years ≈ ${per5.toFixed(1)} mm per 5 years)` : '';
    const band = g === 'A' ? 'no loss' : g === 'B' ? '< 2 mm' : '≥ 2 mm';
    set(g, `Direct evidence: ${what} ${per5 <= 0 ? '0' : per5.toFixed(1)} mm over 5 years${scaled} → ${band}: Grade ${g}`, 'wizard');
    basis = 'direct';
    if (ratio !== undefined) {
      reasons.push({ text: `% bone loss / age = ${ratio.toFixed(2)} (indirect evidence, not used because direct evidence is available)`, source: 'wizard' });
    }
  } else if (ratio !== undefined) {
    const g = indirectGrade(ratio);
    const band = g === 'A' ? '< 0.25' : g === 'B' ? '0.25–1.0' : '> 1.0';
    set(g, `Indirect evidence: ${inputs.rblPercent} % bone loss / age ${inputs.age} = ${ratio.toFixed(2)} (${band}) → Grade ${g}`, 'wizard');
    basis = 'indirect';
  } else {
    const missing = [inputs.rblPercent === undefined && 'radiographic bone loss', (inputs.age === undefined || inputs.age <= 0) && 'age']
      .filter(Boolean)
      .join(' and ');
    set('B', `No direct or indirect evidence of progression (${missing || 'no previous records'} not available) → Grade B assumed`, 'default');
    basis = 'default';
  }

  // ---- modifiers
  const modify = (g: Grade, text: string, source: Source) => {
    const r: Reason = { text, source };
    reasons.push(r);
    if (higher(g, value)) {
      r.text += `: raises Grade ${value} → ${g}`;
      value = g;
      decisive = r;
    }
  };

  switch (inputs.smoking) {
    case 'ge10':
      modify('C', 'Smoker ≥ 10 cigarettes/day → Grade C', 'wizard');
      break;
    case 'lt10':
      modify('B', 'Smoker < 10 cigarettes/day → at least Grade B', 'wizard');
      break;
    case 'none':
      reasons.push({ text: 'Non-smoker', source: 'wizard' });
      break;
    default:
      reasons.push({ text: 'Smoking status not recorded', source: 'default' });
  }

  const dm = inputs.diabetes;
  if (dm?.diabetic) {
    if (dm.hba1c !== undefined && dm.hba1c >= 7) {
      modify('C', `Diabetes with HbA1c ${dm.hba1c} % (≥ 7.0 %) → Grade C`, 'wizard');
    } else if (dm.hba1c !== undefined) {
      modify('B', `Diabetes with HbA1c ${dm.hba1c} % (< 7.0 %) → at least Grade B`, 'wizard');
    } else {
      modify('B', 'Diabetes, HbA1c unknown (treated as < 7.0 %) → at least Grade B', 'wizard');
    }
  } else if (dm && !dm.diabetic) {
    reasons.push({ text: 'No diabetes', source: 'wizard' });
  } else {
    reasons.push({ text: 'Diabetes status not recorded', source: 'default' });
  }

  decisive!.decisive = true;
  return { value: value!, basis: basis!, ratio, reasons };
}
