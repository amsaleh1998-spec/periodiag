// Types shared by the classification module (2017 AAP/EFP World Workshop).

import type { Fdi } from '../teeth';

export type Stage = 1 | 2 | 3 | 4;
export type Grade = 'A' | 'B' | 'C';
export type Extent = 'localized' | 'generalized' | 'molar-incisor';
export type Status = 'stable' | 'remission' | 'unstable';
export type Smoking = 'none' | 'lt10' | 'ge10';
export type RidgeDefect = 'none' | 'moderate' | 'severe';
export type DiagnosisKind = 'insufficient' | 'health' | 'gingivitis' | 'periodontitis';

/** Where a piece of evidence came from. */
export type Source = 'chart' | 'wizard' | 'history' | 'default' | 'override';

export interface Reason {
  text: string;
  source: Source;
  /** True for the criterion that set the final value. */
  decisive?: boolean;
}

export interface Finding<T> {
  value: T;
  reasons: Reason[];
}

/** Answers the clinician gives in the wizard (everything the chart cannot tell us). */
export interface ClinicalInputs {
  age?: number;
  /** Teeth whose attachment loss has a non-periodontal cause (trauma, caries, third molar…). */
  nonPerioTeeth: Fdi[];
  teethLostToPerio?: number;
  /** Radiographic bone loss at the worst site, % of root length. */
  rblPercent?: number;
  verticalDefect3mm?: boolean;
  previousRecord?: {
    available: boolean;
    /** Interval between the records, years. */
    years?: number;
    /** Worst-site increase in CAL or bone loss over that interval, mm. */
    changeMm?: number;
    measure?: 'cal' | 'bone';
  };
  smoking?: Smoking;
  diabetes?: { diabetic: boolean; hba1c?: number };
  complexity: {
    masticatoryDysfunction?: boolean;
    biteCollapse?: boolean;
    driftingFlaring?: boolean;
    ridgeDefect?: RidgeDefect;
    /** Secondary occlusal trauma. Undefined → derived from the chart (mobility ≥ 2). */
    occlusalTrauma?: boolean;
    /** Occluding pairs. Undefined → counted from the chart. */
    opposingPairs?: number;
  };
}

export function emptyInputs(): ClinicalInputs {
  return { nonPerioTeeth: [], complexity: {} };
}

/** Information from earlier exams of the same patient. */
export interface History {
  /** Highest stage diagnosed at any earlier exam: the stage never goes down. */
  previousMaxStage?: Stage;
  previousMaxStageDate?: string;
}

/** Clinician override of the computed diagnosis. */
export interface Override {
  kind?: DiagnosisKind;
  stage?: Stage;
  grade?: Grade;
  extent?: Extent;
  status?: Status;
  /** Free-text label replacing the generated one. */
  label?: string;
  note?: string;
}
