// FDI two-digit tooth notation and dental-arch geometry.
// Pure module: no DOM, no storage.

export type Fdi = number;
export type Quadrant = 1 | 2 | 3 | 4;
export type Arch = 'upper' | 'lower';
export type ToothType = 'incisor' | 'canine' | 'premolar' | 'molar';
export type Surface = 'buccal' | 'oral';
export type SiteId = 'MB' | 'B' | 'DB' | 'ML' | 'L' | 'DL';

/** Upper arch as seen by the clinician facing the patient: patient's right on the left. */
export const UPPER_ROW: readonly Fdi[] = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
/** Lower arch as seen by the clinician facing the patient. */
export const LOWER_ROW: readonly Fdi[] = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const ALL_TEETH: readonly Fdi[] = [...UPPER_ROW, ...LOWER_ROW];

export const SITES: readonly SiteId[] = ['MB', 'B', 'DB', 'ML', 'L', 'DL'];
export const BUCCAL_SITES: readonly SiteId[] = ['MB', 'B', 'DB'];
export const ORAL_SITES: readonly SiteId[] = ['ML', 'L', 'DL'];
/** Interproximal sites (used for the interdental CAL criterion and for staging). */
export const INTERDENTAL_SITES: readonly SiteId[] = ['MB', 'DB', 'ML', 'DL'];
/** Mid-buccal / mid-oral sites (used for the buccal/oral case-definition criterion). */
export const MID_SITES: readonly SiteId[] = ['B', 'L'];

export function isValidFdi(t: number): boolean {
  return ALL_TEETH.includes(t);
}

export function quadrant(t: Fdi): Quadrant {
  return Math.floor(t / 10) as Quadrant;
}

export function unit(t: Fdi): number {
  return t % 10;
}

export function arch(t: Fdi): Arch {
  const q = quadrant(t);
  return q === 1 || q === 2 ? 'upper' : 'lower';
}

export function isUpper(t: Fdi): boolean {
  return arch(t) === 'upper';
}

export function toothType(t: Fdi): ToothType {
  const u = unit(t);
  if (u <= 2) return 'incisor';
  if (u === 3) return 'canine';
  if (u <= 5) return 'premolar';
  return 'molar';
}

export function isMolar(t: Fdi): boolean {
  return toothType(t) === 'molar';
}

/** Teeth used for the molar-incisor pattern: first molars and incisors. */
export function isFirstMolarOrIncisor(t: Fdi): boolean {
  const u = unit(t);
  return u === 6 || u === 1 || u === 2;
}

/** Position of the tooth in its arch row (0..15, left to right on screen). */
export function archIndex(t: Fdi): number {
  return (isUpper(t) ? UPPER_ROW : LOWER_ROW).indexOf(t);
}

/**
 * Two teeth are adjacent if they are next to each other in the same arch of a
 * full dentition (11/21 and 31/41 included). Teeth separated by a missing tooth
 * are therefore NOT adjacent (decision D4).
 */
export function areAdjacent(a: Fdi, b: Fdi): boolean {
  if (a === b) return false;
  if (arch(a) !== arch(b)) return false;
  return Math.abs(archIndex(a) - archIndex(b)) === 1;
}

/** Tooth in the opposing arch at the same position (16 ↔ 46, 24 ↔ 34). */
export function antagonist(t: Fdi): Fdi {
  const q = quadrant(t);
  const opposite: Record<Quadrant, Quadrant> = { 1: 4, 2: 3, 3: 2, 4: 1 };
  return opposite[q] * 10 + unit(t);
}

/**
 * Furcation entrances recorded for a tooth.
 * Upper molars: buccal, mesio-palatal, disto-palatal. Lower molars: buccal, lingual.
 * Upper premolars (14, 15, 24, 25): mesial and distal (probed from palatal).
 */
export type FurcationEntrance = 'B' | 'L' | 'MP' | 'DP' | 'M' | 'D';

export function furcationEntrances(t: Fdi): FurcationEntrance[] {
  const type = toothType(t);
  if (type === 'molar') return isUpper(t) ? ['B', 'MP', 'DP'] : ['B', 'L'];
  if (type === 'premolar' && isUpper(t)) return ['M', 'D'];
  return [];
}

export function hasFurcation(t: Fdi): boolean {
  return furcationEntrances(t).length > 0;
}

/** Which side of the chart a furcation entrance is drawn on. */
export function furcationSurface(e: FurcationEntrance): Surface {
  return e === 'B' ? 'buccal' : 'oral';
}

/**
 * Sites of a surface in left-to-right screen order. For quadrants 1 and 4
 * (patient's right, drawn on the left) the distal side faces left.
 */
export function siteScreenOrder(t: Fdi, surface: Surface): SiteId[] {
  const q = quadrant(t);
  const distalLeft = q === 1 || q === 4;
  const [m, mid, d]: SiteId[] = surface === 'buccal' ? ['MB', 'B', 'DB'] : ['ML', 'L', 'DL'];
  return distalLeft ? [d, mid, m] : [m, mid, d];
}

export function surfaceOf(site: SiteId): Surface {
  return BUCCAL_SITES.includes(site) ? 'buccal' : 'oral';
}

export function isInterdental(site: SiteId): boolean {
  return INTERDENTAL_SITES.includes(site);
}

/** Display name of the oral surface: palatal for the upper arch, lingual for the lower. */
export function oralName(t: Fdi | Arch): 'palatal' | 'lingual' {
  const a = typeof t === 'number' ? arch(t) : t;
  return a === 'upper' ? 'palatal' : 'lingual';
}

/** Short site label as shown to clinicians (upper oral sites use P for palatal). */
export function siteLabel(t: Fdi, site: SiteId): string {
  if (!isUpper(t)) return site;
  return site.replace('L', 'P');
}
