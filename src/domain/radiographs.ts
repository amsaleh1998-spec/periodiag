// Full-mouth radiographic survey (FMX): mount presets and image slot bookkeeping.
// Pure module: images themselves live in storage, referenced here by id.

import type { Fdi } from './teeth';

export type RadiographKind = 'pa' | 'bw' | 'pano';
export type Orientation = 'portrait' | 'landscape';
export type PresetId = 'fmx18' | 'fmx18v' | 'fmx14' | 'bw4';

export interface RadiographSlot {
  id: string;
  kind: RadiographKind;
  /** e.g. "Maxillary right molars" */
  label: string;
  /** e.g. "18–16" */
  short: string;
  teeth: Fdi[];
  orientation: Orientation;
  /** Mount position: row 0 = maxillary PAs, 1 = bitewings / panoramic, 2 = mandibular PAs; 7 columns. */
  row: 0 | 1 | 2;
  col: number;
  span?: number;
}

export interface RadiographPreset {
  id: PresetId;
  name: string;
  description: string;
  slots: RadiographSlot[];
}

export interface RadiographImageRef {
  imageId: string;
  fileName?: string;
  addedAt: string;
  note?: string;
}

export interface ExtraRadiograph extends RadiographImageRef {
  id: string;
  label: string;
}

export interface RadiographSurvey {
  preset: PresetId;
  /** Date the radiographs were taken (may differ from the exam date). */
  date?: string;
  /** Adds a panoramic slot in the middle of the mount. */
  panoramic: boolean;
  slots: Record<string, RadiographImageRef>;
  extras: ExtraRadiograph[];
  notes?: string;
}

export const MOUNT_COLUMNS = 7;

const pa = (id: string, label: string, short: string, teeth: Fdi[], row: 0 | 2, col: number): RadiographSlot => ({
  id,
  kind: 'pa',
  label,
  short,
  teeth,
  // Posterior periapicals are mounted horizontally, anterior ones vertically.
  orientation: col <= 1 || col >= 5 ? 'landscape' : 'portrait',
  row,
  col,
});

const PERIAPICALS: RadiographSlot[] = [
  pa('pa-ur-molar', 'Maxillary right molars', '18–16', [18, 17, 16], 0, 0),
  pa('pa-ur-premolar', 'Maxillary right premolars', '15–14', [15, 14], 0, 1),
  pa('pa-ur-canine', 'Maxillary right canine', '13', [13], 0, 2),
  pa('pa-u-incisors', 'Maxillary incisors', '12–22', [12, 11, 21, 22], 0, 3),
  pa('pa-ul-canine', 'Maxillary left canine', '23', [23], 0, 4),
  pa('pa-ul-premolar', 'Maxillary left premolars', '24–25', [24, 25], 0, 5),
  pa('pa-ul-molar', 'Maxillary left molars', '26–28', [26, 27, 28], 0, 6),
  pa('pa-lr-molar', 'Mandibular right molars', '48–46', [48, 47, 46], 2, 0),
  pa('pa-lr-premolar', 'Mandibular right premolars', '45–44', [45, 44], 2, 1),
  pa('pa-lr-canine', 'Mandibular right canine', '43', [43], 2, 2),
  pa('pa-l-incisors', 'Mandibular incisors', '42–32', [42, 41, 31, 32], 2, 3),
  pa('pa-ll-canine', 'Mandibular left canine', '33', [33], 2, 4),
  pa('pa-ll-premolar', 'Mandibular left premolars', '34–35', [34, 35], 2, 5),
  pa('pa-ll-molar', 'Mandibular left molars', '36–38', [36, 37, 38], 2, 6),
];

const bitewings = (orientation: Orientation): RadiographSlot[] => [
  { id: 'bw-r-molar', kind: 'bw', label: 'Right molar bitewing', short: '17–16 / 47–46', teeth: [17, 16, 47, 46], orientation, row: 1, col: 0 },
  { id: 'bw-r-premolar', kind: 'bw', label: 'Right premolar bitewing', short: '15–14 / 45–44', teeth: [15, 14, 45, 44], orientation, row: 1, col: 1 },
  { id: 'bw-l-premolar', kind: 'bw', label: 'Left premolar bitewing', short: '24–25 / 34–35', teeth: [24, 25, 34, 35], orientation, row: 1, col: 5 },
  { id: 'bw-l-molar', kind: 'bw', label: 'Left molar bitewing', short: '26–27 / 36–37', teeth: [26, 27, 36, 37], orientation, row: 1, col: 6 },
];

export const PANORAMIC_SLOT: RadiographSlot = {
  id: 'pano',
  kind: 'pano',
  label: 'Panoramic',
  short: 'OPG',
  teeth: [],
  orientation: 'landscape',
  row: 1,
  col: 2,
  span: 3,
};

export const PRESETS: Record<PresetId, RadiographPreset> = {
  fmx18: {
    id: 'fmx18',
    name: 'FMX 18',
    description: '14 periapicals + 4 horizontal bitewings',
    slots: [...PERIAPICALS, ...bitewings('landscape')],
  },
  fmx18v: {
    id: 'fmx18v',
    name: 'FMX 18 (vertical bitewings)',
    description: '14 periapicals + 4 vertical bitewings (periodontal)',
    slots: [...PERIAPICALS, ...bitewings('portrait')],
  },
  fmx14: {
    id: 'fmx14',
    name: 'Periapicals 14',
    description: '14 periapicals, no bitewings',
    slots: [...PERIAPICALS],
  },
  bw4: {
    id: 'bw4',
    name: 'Bitewings 4',
    description: '4 horizontal bitewings',
    slots: bitewings('landscape'),
  },
};

export function emptySurvey(preset: PresetId = 'fmx18'): RadiographSurvey {
  return { preset, panoramic: false, slots: {}, extras: [] };
}

/** Slots of the survey in mount order (row by row, left to right). */
export function surveySlots(survey: RadiographSurvey): RadiographSlot[] {
  const slots = [...PRESETS[survey.preset].slots];
  if (survey.panoramic) slots.push(PANORAMIC_SLOT);
  return slots.sort((a, b) => a.row - b.row || a.col - b.col);
}

export function findSlot(survey: RadiographSurvey, slotId: string): RadiographSlot | undefined {
  return surveySlots(survey).find((s) => s.id === slotId);
}

export function assignImage(survey: RadiographSurvey, slotId: string, ref: RadiographImageRef): { survey: RadiographSurvey; replaced?: string } {
  const replaced = survey.slots[slotId]?.imageId;
  return { survey: { ...survey, slots: { ...survey.slots, [slotId]: ref } }, replaced };
}

export function removeImage(survey: RadiographSurvey, slotId: string): { survey: RadiographSurvey; removed?: string } {
  const removed = survey.slots[slotId]?.imageId;
  const slots = { ...survey.slots };
  delete slots[slotId];
  return { survey: { ...survey, slots }, removed };
}

export function swapSlots(survey: RadiographSurvey, a: string, b: string): RadiographSurvey {
  if (a === b) return survey;
  const slots = { ...survey.slots };
  const ra = slots[a];
  const rb = slots[b];
  delete slots[a];
  delete slots[b];
  if (rb) slots[a] = rb;
  if (ra) slots[b] = ra;
  return { ...survey, slots };
}

export function setSlotNote(survey: RadiographSurvey, slotId: string, note: string | undefined): RadiographSurvey {
  const ref = survey.slots[slotId];
  if (!ref) return survey;
  return { ...survey, slots: { ...survey.slots, [slotId]: { ...ref, note } } };
}

/**
 * Switch the mount preset. Images in slots that the new preset does not have
 * (e.g. bitewings when switching to periapicals only) are kept as extra images.
 */
export function changePreset(survey: RadiographSurvey, preset: PresetId, panoramic = survey.panoramic): RadiographSurvey {
  const next: RadiographSurvey = { ...survey, preset, panoramic, slots: {}, extras: [...survey.extras] };
  const keep = new Set(surveySlots(next).map((s) => s.id));
  const oldSlots = surveySlots(survey);
  for (const [slotId, ref] of Object.entries(survey.slots)) {
    if (keep.has(slotId)) {
      next.slots[slotId] = ref;
    } else {
      const label = oldSlots.find((s) => s.id === slotId)?.label ?? slotId;
      next.extras.push({ ...ref, id: `extra-${slotId}-${ref.imageId}`, label });
    }
  }
  return next;
}

/** Slots in the current preset whose images are hidden by `changePreset` (to warn the user). */
export function slotsLostByPreset(survey: RadiographSurvey, preset: PresetId, panoramic: boolean): RadiographSlot[] {
  const keep = new Set(surveySlots({ ...survey, preset, panoramic }).map((s) => s.id));
  return surveySlots(survey).filter((s) => survey.slots[s.id] && !keep.has(s.id));
}

export function emptySlotIds(survey: RadiographSurvey): string[] {
  return surveySlots(survey)
    .filter((s) => !survey.slots[s.id])
    .map((s) => s.id);
}

export function surveyProgress(survey: RadiographSurvey): { filled: number; total: number } {
  const slots = surveySlots(survey);
  return { filled: slots.filter((s) => survey.slots[s.id]).length, total: slots.length };
}

/** All image ids referenced by the survey (slots + extras). */
export function surveyImageIds(survey: RadiographSurvey | undefined): string[] {
  if (!survey) return [];
  return [...Object.values(survey.slots).map((r) => r.imageId), ...survey.extras.map((e) => e.imageId)];
}

export function hasImages(survey: RadiographSurvey | undefined): boolean {
  return surveyImageIds(survey).length > 0;
}

/** Slots (in the current preset) that show a given tooth. */
export function slotsForTooth(survey: RadiographSurvey, tooth: Fdi): RadiographSlot[] {
  return surveySlots(survey).filter((s) => s.teeth.includes(tooth));
}
