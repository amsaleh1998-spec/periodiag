import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  assignImage,
  changePreset,
  emptySlotIds,
  emptySurvey,
  removeImage,
  slotsForTooth,
  slotsLostByPreset,
  surveyImageIds,
  surveyProgress,
  surveySlots,
  swapSlots,
  type RadiographSurvey,
} from '../../src/domain/radiographs';
import { ImportError, buildExport, newExam, newPatient, parseImport, type ExportImage } from '../../src/domain/records';
import { ALL_TEETH } from '../../src/domain/teeth';

const ref = (imageId: string) => ({ imageId, addedAt: '2026-11-03T00:00:00Z' });
const withImages = (survey: RadiographSurvey, slots: string[]) =>
  slots.reduce((s, id, i) => assignImage(s, id, ref(`img${i}`)).survey, survey);

describe('radiograph presets', () => {
  it('FMX 18 has 14 periapicals and 4 bitewings with unique positions', () => {
    const slots = PRESETS.fmx18.slots;
    expect(slots.filter((s) => s.kind === 'pa')).toHaveLength(14);
    expect(slots.filter((s) => s.kind === 'bw')).toHaveLength(4);
    expect(new Set(slots.map((s) => s.id)).size).toBe(18);
    expect(new Set(slots.map((s) => `${s.row}-${s.col}`)).size).toBe(18);
  });

  it('the periapicals cover every tooth', () => {
    for (const preset of [PRESETS.fmx18, PRESETS.fmx14]) {
      const covered = new Set(preset.slots.filter((s) => s.kind === 'pa').flatMap((s) => s.teeth));
      expect(ALL_TEETH.filter((t) => !covered.has(t))).toEqual([]);
    }
  });

  it('bitewings show posterior teeth of both arches', () => {
    for (const bw of PRESETS.fmx18.slots.filter((s) => s.kind === 'bw')) {
      expect(bw.teeth.every((t) => t % 10 >= 4)).toBe(true);
      expect(bw.teeth.some((t) => t < 30) && bw.teeth.some((t) => t > 30)).toBe(true);
    }
  });

  it('mounts posterior periapicals horizontally, anterior ones vertically; vertical bitewings upright', () => {
    const byId = (p: keyof typeof PRESETS, id: string) => PRESETS[p].slots.find((s) => s.id === id)!;
    expect(byId('fmx18', 'pa-ur-molar').orientation).toBe('landscape');
    expect(byId('fmx18', 'pa-u-incisors').orientation).toBe('portrait');
    expect(byId('fmx18', 'bw-r-molar').orientation).toBe('landscape');
    expect(byId('fmx18v', 'bw-r-molar').orientation).toBe('portrait');
  });

  it('adds the panoramic slot in the middle row on request, in mount order', () => {
    const slots = surveySlots({ ...emptySurvey('fmx18'), panoramic: true });
    expect(slots).toHaveLength(19);
    expect(slots.map((s) => s.id).slice(7, 12)).toEqual(['bw-r-molar', 'bw-r-premolar', 'pano', 'bw-l-premolar', 'bw-l-molar']);
  });

  it('finds the slots showing a tooth', () => {
    expect(slotsForTooth(emptySurvey('fmx18'), 16).map((s) => s.id)).toEqual(['pa-ur-molar', 'bw-r-molar']);
  });
});

describe('survey bookkeeping', () => {
  it('assigns, replaces and removes images', () => {
    let s = emptySurvey();
    s = assignImage(s, 'pa-ur-molar', ref('a')).survey;
    const r = assignImage(s, 'pa-ur-molar', ref('b'));
    expect(r.replaced).toBe('a');
    const rem = removeImage(r.survey, 'pa-ur-molar');
    expect(rem.removed).toBe('b');
    expect(rem.survey.slots).toEqual({});
  });

  it('counts progress and lists empty positions in mount order', () => {
    const s = withImages(emptySurvey(), ['pa-ur-molar', 'bw-l-molar']);
    expect(surveyProgress(s)).toEqual({ filled: 2, total: 18 });
    expect(emptySlotIds(s)[0]).toBe('pa-ur-premolar');
    expect(emptySlotIds(s)).not.toContain('bw-l-molar');
  });

  it('swaps two positions, including with an empty one', () => {
    let s = withImages(emptySurvey(), ['pa-ur-molar', 'pa-ul-molar']);
    s = swapSlots(s, 'pa-ur-molar', 'pa-ul-molar');
    expect(s.slots['pa-ur-molar'].imageId).toBe('img1');
    expect(s.slots['pa-ul-molar'].imageId).toBe('img0');
    s = swapSlots(s, 'pa-ur-molar', 'pa-lr-molar');
    expect(s.slots['pa-ur-molar']).toBeUndefined();
    expect(s.slots['pa-lr-molar'].imageId).toBe('img1');
  });

  it('keeps images of positions dropped by a preset change as additional images', () => {
    const s = withImages(emptySurvey('fmx18'), ['pa-ur-molar', 'bw-r-molar']);
    expect(slotsLostByPreset(s, 'fmx14', false).map((x) => x.id)).toEqual(['bw-r-molar']);
    const next = changePreset(s, 'fmx14');
    expect(Object.keys(next.slots)).toEqual(['pa-ur-molar']);
    expect(next.extras).toHaveLength(1);
    expect(next.extras[0].label).toBe('Right molar bitewing');
    expect(surveyImageIds(next).sort()).toEqual(['img0', 'img1']);
  });

  it('keeps bitewing images when switching between horizontal and vertical bitewings', () => {
    const s = withImages(emptySurvey('fmx18'), ['bw-r-molar']);
    expect(changePreset(s, 'fmx18v').slots['bw-r-molar'].imageId).toBe('img0');
  });
});

describe('export format v2', () => {
  const p = newPatient('X');
  const exam = { ...newExam(p.id), radiographs: withImages(emptySurvey('fmx18v'), ['pa-ur-molar']) };
  const image: ExportImage = {
    id: 'img0', examId: exam.id, patientId: p.id, name: 'a.jpg', type: 'image/jpeg',
    width: 10, height: 10, addedAt: '2026-11-03T00:00:00Z', data: 'AAAA', thumb: 'AAAA',
  };

  it('round-trips surveys and images', () => {
    const parsed = parseImport(JSON.stringify(buildExport([p], [exam], [image])));
    expect(parsed.exams[0].radiographs).toEqual(exam.radiographs);
    expect(parsed.images).toEqual([image]);
  });

  it('still reads version 1 files (no images)', () => {
    const v1 = { ...buildExport([p], [{ ...exam, radiographs: undefined }]), schemaVersion: 1 } as Record<string, unknown>;
    delete v1.images;
    const parsed = parseImport(JSON.stringify(v1));
    expect(parsed.images).toEqual([]);
    expect(parsed.exams[0].radiographs).toBeUndefined();
  });

  it('rejects images of unknown exams or non-image types', () => {
    expect(() => parseImport(JSON.stringify(buildExport([p], [exam], [{ ...image, examId: 'nope' }])))).toThrow(ImportError);
    expect(() => parseImport(JSON.stringify(buildExport([p], [exam], [{ ...image, type: 'text/html' }])))).toThrow(/not an image/);
  });

  it('sanitises an unknown preset', () => {
    const raw = buildExport([p], [{ ...exam, radiographs: { ...exam.radiographs, preset: 'weird' as never } }]);
    expect(parseImport(JSON.stringify(raw)).exams[0].radiographs?.preset).toBe('fmx18');
  });
});
