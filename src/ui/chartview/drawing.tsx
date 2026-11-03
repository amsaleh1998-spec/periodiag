// SVG drawing of one arch surface: schematic teeth, CEJ grid, gingival margin
// (red) and pocket base (blue) lines. Shared by the entry page, the chart view
// and the PDF. Coordinates: x across 16 tooth columns, `a` = mm along the
// tooth axis, apical positive, 0 at the CEJ.

import type { ReactNode } from 'react';
import type { Chart, SiteData } from '../../domain/chart';
import {
  LOWER_ROW,
  UPPER_ROW,
  siteScreenOrder,
  toothType,
  type Arch,
  type Fdi,
  type Surface,
} from '../../domain/teeth';

export const TW = 30; // tooth column width
export const MM = 2.2; // svg units per mm
export const ROOT_MM = 17; // apical extent drawn
export const CROWN_MM = 11; // coronal extent drawn
export const VIEW_H = (ROOT_MM + CROWN_MM) * MM;
export const JAW_W = 16 * TW;

export const COLORS = {
  gm: '#d32f2f',
  pd: '#1565c0',
  pocket: 'rgba(21, 101, 192, 0.22)',
  tooth: '#fbfaf6',
  toothStroke: '#8c96a3',
  implant: '#b7bcc6',
  grid: '#e3e7ed',
  cej: '#b9c1cc',
  flag: '#d32f2f',
};

/** Roots point up (towards smaller y) in this view? */
export function apicalUp(arch: Arch, surface: Surface): boolean {
  return arch === 'upper' ? surface === 'buccal' : surface === 'oral';
}

export function rowOf(arch: Arch): readonly Fdi[] {
  return arch === 'upper' ? UPPER_ROW : LOWER_ROW;
}

/** x of a site (0..2 in screen order) inside a column starting at colX. */
export function siteX(colX: number, i: number): number {
  return colX + ((i + 0.5) * TW) / 3;
}

type Pt = [number, number]; // [x, a]

/** Smooth closed path through points (corners rounded with quadratic curves). */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${start[0].toFixed(2)},${start[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${m[0].toFixed(2)},${m[1].toFixed(2)}`;
  }
  return d + 'Z';
}

// Half-width profiles (a, half-width as a fraction of TW), crown tip → apex.
const PROFILES: Record<'incisor' | 'canine' | 'premolar', [number, number][]> = {
  incisor: [[-10.5, 0.24], [-9.5, 0.3], [-4, 0.3], [0, 0.23], [5, 0.19], [10, 0.12], [14, 0.05], [15, 0]],
  canine: [[-10.8, 0.03], [-9.5, 0.2], [-7, 0.31], [-3, 0.3], [0, 0.24], [6, 0.2], [12, 0.12], [16.5, 0.04], [17, 0]],
  premolar: [[-8.8, 0.06], [-8, 0.26], [-6.5, 0.34], [-3, 0.34], [0, 0.26], [5, 0.22], [10, 0.14], [13.5, 0.05], [14, 0]],
};

const MOLAR: Pt[] = [
  [-0.2, -8.2], [-0.36, -7.6], [-0.43, -6.3], [-0.43, -2], [-0.37, 0], [-0.35, 5], [-0.29, 10], [-0.22, 13],
  [-0.15, 12.6], [-0.1, 7], [-0.04, 3.6], [0.04, 3.6], [0.1, 7], [0.15, 12.6], [0.22, 13], [0.29, 10],
  [0.35, 5], [0.37, 0], [0.43, -2], [0.43, -6.3], [0.36, -7.6], [0.2, -8.2], [0, -7.6],
];

function outline(t: Fdi): Pt[] {
  const type = toothType(t);
  if (type === 'molar') return MOLAR;
  const prof = PROFILES[type];
  const left: Pt[] = prof.map(([a, hw]) => [-hw, a]);
  const right: Pt[] = [...prof].reverse().filter(([, hw]) => hw > 0).map(([a, hw]) => [hw, a]);
  return [...left, ...right];
}

interface ViewProps {
  chart: Chart;
  arch: Arch;
  surface: Surface;
  /** Top-left corner of the drawing area. */
  x0?: number;
  y0?: number;
}

/** <g> with the drawing of one surface; height VIEW_H, width JAW_W. */
export function SurfaceDrawing({ chart, arch, surface, x0 = 0, y0 = 0 }: ViewProps) {
  const up = apicalUp(arch, surface);
  const cejY = y0 + (up ? ROOT_MM : CROWN_MM) * MM;
  const y = (a: number) => (up ? cejY - a * MM : cejY + a * MM);
  const clampA = (a: number) => Math.max(-CROWN_MM, Math.min(ROOT_MM, a));
  const row = rowOf(arch);
  const items: ReactNode[] = [];

  // mm grid
  for (let a = -CROWN_MM + 1; a < ROOT_MM; a++) {
    if (a === 0) continue;
    items.push(<line key={`g${a}`} x1={x0} x2={x0 + JAW_W} y1={y(a)} y2={y(a)} stroke={COLORS.grid} strokeWidth={a % 5 === 0 ? 0.5 : 0.25} />);
  }

  // teeth
  row.forEach((t, i) => {
    const tooth = chart[t];
    const cx = x0 + i * TW + TW / 2;
    if (tooth.status === 'missing') return;
    if (tooth.status === 'implant') {
      const crown: Pt[] = [[-0.3, -8], [-0.36, -6], [-0.34, -1.5], [-0.2, 0.5], [0.2, 0.5], [0.34, -1.5], [0.36, -6], [0.3, -8]];
      const fixture: Pt[] = [[-0.18, 0.5], [-0.18, 11], [-0.1, 12.5], [0.1, 12.5], [0.18, 11], [0.18, 0.5]];
      const toPts = (ps: Pt[]) => ps.map(([dx, a]) => [cx + dx * TW, y(a)] as [number, number]);
      items.push(
        <g key={`t${t}`}>
          <path d={smoothPath(toPts(crown))} fill={COLORS.tooth} stroke={COLORS.toothStroke} strokeWidth={0.5} />
          <polygon points={toPts(fixture).map((p) => p.join(',')).join(' ')} fill={COLORS.implant} stroke="#7d8492" strokeWidth={0.5} />
          {Array.from({ length: 7 }, (_, k) => 1.8 + k * 1.5).map((a) => (
            <line key={a} x1={cx - 0.18 * TW} x2={cx + 0.18 * TW} y1={y(a)} y2={y(a + 0.5)} stroke="#7d8492" strokeWidth={0.4} />
          ))}
        </g>,
      );
      return;
    }
    const pts = outline(t).map(([dx, a]) => [cx + dx * TW, y(a)] as [number, number]);
    items.push(<path key={`t${t}`} d={smoothPath(pts)} fill={COLORS.tooth} stroke={COLORS.toothStroke} strokeWidth={0.5} />);
  });

  // CEJ reference line
  items.push(<line key="cej" x1={x0} x2={x0 + JAW_W} y1={cejY} y2={cejY} stroke={COLORS.cej} strokeWidth={0.6} strokeDasharray="2 1.5" />);

  // gingival margin and pocket lines, in contiguous runs of recorded sites
  type P = { x: number; gm: number; base: number; pd: number };
  const runs: P[][] = [];
  let run: P[] = [];
  row.forEach((t, i) => {
    const tooth = chart[t];
    const colX = x0 + i * TW;
    const sites = siteScreenOrder(t, surface);
    sites.forEach((s, k) => {
      const site: SiteData = tooth.sites[s];
      if (tooth.status === 'missing' || site.pd === null) {
        if (run.length) runs.push(run);
        run = [];
        return;
      }
      const gmA = -(site.gm ?? 0); // apical positive
      run.push({ x: siteX(colX, k), gm: y(clampA(gmA)), base: y(clampA(gmA + site.pd)), pd: site.pd });
    });
  });
  if (run.length) runs.push(run);

  runs.forEach((r, k) => {
    const gmPts = r.map((p) => `${p.x.toFixed(2)},${p.gm.toFixed(2)}`);
    const basePts = r.map((p) => `${p.x.toFixed(2)},${p.base.toFixed(2)}`);
    items.push(<polygon key={`f${k}`} points={[...gmPts, ...[...basePts].reverse()].join(' ')} fill={COLORS.pocket} stroke="none" />);
    items.push(<polyline key={`g${k}`} points={gmPts.join(' ')} fill="none" stroke={COLORS.gm} strokeWidth={1} strokeLinejoin="round" />);
    items.push(<polyline key={`p${k}`} points={basePts.join(' ')} fill="none" stroke={COLORS.pd} strokeWidth={1} strokeLinejoin="round" />);
    for (const p of r) {
      if (p.pd >= 5) items.push(<circle key={`x${k}-${p.x}`} cx={p.x} cy={p.base} r={1.6} fill={COLORS.flag} />);
    }
  });

  // column separators and midline
  row.forEach((t, i) => {
    if (i === 0) return;
    const x = x0 + i * TW;
    items.push(<line key={`c${t}`} x1={x} x2={x} y1={y0} y2={y0 + VIEW_H} stroke={i === 8 ? '#9aa6b5' : '#eef1f5'} strokeWidth={i === 8 ? 0.8 : 0.4} />);
  });

  return <g>{items}</g>;
}
