// Complete periodontal chart as a single SVG (screen + PDF): per-site value
// rows, BOP/plaque dots, furcation symbols, mobility and the drawings.

import type { ReactNode } from 'react';
import { calOf, type Chart } from '../../domain/chart';
import {
  furcationEntrances,
  furcationSurface,
  oralName,
  quadrant,
  siteScreenOrder,
  type Arch,
  type Fdi,
  type FurcationEntrance,
  type Surface,
} from '../../domain/teeth';
import { COLORS, JAW_W, SurfaceDrawing, TW, VIEW_H, rowOf, siteX } from './drawing';

const LABEL_W = 74;
const ROW_H = 9;
const GAP = 14;
export const FULL_W = LABEL_W + JAW_W + 4;
const FONT = 'Helvetica, Arial, sans-serif';

type RowKind = 'num' | 'mob' | 'furc' | 'bop' | 'plaque' | 'gm' | 'pd' | 'cal' | 'draw' | 'title';
interface RowSpec {
  kind: RowKind;
  surface?: Surface;
  text?: string;
}

const LABELS: Partial<Record<RowKind, string>> = {
  num: 'Tooth',
  mob: 'Mobility',
  furc: 'Furcation',
  bop: 'Bleeding / Supp.',
  plaque: 'Plaque',
  gm: 'Gingival margin',
  pd: 'Probing depth',
  cal: 'CAL',
};

function surfaceRows(surface: Surface, reversed: boolean): RowSpec[] {
  const kinds: RowKind[] = ['furc', 'bop', 'plaque', 'gm', 'pd', 'cal'];
  return (reversed ? kinds.reverse() : kinds).map((kind) => ({ kind, surface }));
}

function layout(arch: Arch): RowSpec[] {
  const oral = oralName(arch);
  if (arch === 'upper') {
    return [
      { kind: 'title', text: 'MAXILLA — buccal' },
      { kind: 'num' },
      { kind: 'mob' },
      ...surfaceRows('buccal', false),
      { kind: 'draw', surface: 'buccal' },
      { kind: 'draw', surface: 'oral' },
      ...surfaceRows('oral', true),
      { kind: 'title', text: `MAXILLA — ${oral}` },
    ];
  }
  return [
    { kind: 'title', text: `MANDIBLE — ${oral}` },
    ...surfaceRows('oral', false),
    { kind: 'draw', surface: 'oral' },
    { kind: 'draw', surface: 'buccal' },
    ...surfaceRows('buccal', true),
    { kind: 'mob' },
    { kind: 'num' },
    { kind: 'title', text: 'MANDIBLE — buccal' },
  ];
}

const rowHeight = (r: RowSpec) => (r.kind === 'draw' ? VIEW_H : r.kind === 'title' ? 10 : r.kind === 'num' ? 11 : ROW_H);

export function fullChartHeight(): number {
  const h = (arch: Arch) => layout(arch).reduce((s, r) => s + rowHeight(r), 0);
  return h('upper') + GAP + h('lower');
}

function furcSymbol(x: number, cy: number, grade: number, key: string): ReactNode {
  if (!grade) return null;
  const s = 3.6;
  const pts = `${x - s},${cy + s * 0.8} ${x + s},${cy + s * 0.8} ${x},${cy - s * 0.9}`;
  return (
    <g key={key}>
      {grade === 2 && <polygon points={`${x - s},${cy + s * 0.8} ${x},${cy + s * 0.8} ${x},${cy - s * 0.9}`} fill="#1f4e79" />}
      <polygon points={pts} fill={grade === 3 ? '#1f4e79' : 'none'} stroke="#1f4e79" strokeWidth={0.6} />
    </g>
  );
}

/** Ordered entrances on a surface, mesial entrance on the mesial side of the screen. */
function screenEntrances(t: Fdi, surface: Surface): { e: FurcationEntrance; pos: number }[] {
  const list = furcationEntrances(t).filter((e) => furcationSurface(e) === surface);
  if (list.length === 1) return [{ e: list[0], pos: 1 }];
  if (list.length === 0) return [];
  const distalLeft = quadrant(t) === 1 || quadrant(t) === 4;
  const mesial = list.find((e) => e === 'MP' || e === 'M')!;
  const distal = list.find((e) => e === 'DP' || e === 'D')!;
  return distalLeft ? [{ e: distal, pos: 0 }, { e: mesial, pos: 2 }] : [{ e: mesial, pos: 0 }, { e: distal, pos: 2 }];
}

function JawBlock({ chart, arch, y0 }: { chart: Chart; arch: Arch; y0: number }) {
  const row = rowOf(arch);
  const items: ReactNode[] = [];
  let y = y0;
  const x0 = LABEL_W;

  for (const [ri, r] of layout(arch).entries()) {
    const h = rowHeight(r);
    const cy = y + h / 2;
    const key = `${arch}-${ri}`;
    if (r.kind === 'title') {
      items.push(
        <text key={key} x={x0} y={y + 7.5} fontSize={6.5} fontWeight="bold" fill="#5d6b7c" fontFamily={FONT}>
          {r.text}
        </text>,
      );
      y += h;
      continue;
    }
    if (r.kind === 'draw') {
      items.push(<SurfaceDrawing key={key} chart={chart} arch={arch} surface={r.surface!} x0={x0} y0={y} />);
      items.push(
        <rect key={`${key}-b`} x={x0} y={y} width={JAW_W} height={h} fill="none" stroke="#d3dae3" strokeWidth={0.4} />,
      );
      y += h;
      continue;
    }
    // label
    items.push(
      <text key={`${key}-l`} x={2} y={cy + 2} fontSize={5.2} fill="#5d6b7c" fontFamily={FONT}>
        {LABELS[r.kind]}
      </text>,
    );
    items.push(<line key={`${key}-hl`} x1={x0} x2={x0 + JAW_W} y1={y + h} y2={y + h} stroke="#e8ebf0" strokeWidth={0.3} />);

    row.forEach((t, i) => {
      const tooth = chart[t];
      const colX = x0 + i * TW;
      const k = `${key}-${t}`;
      if (tooth.status === 'missing' && r.kind !== 'num') {
        items.push(<rect key={`${k}-m`} x={colX} y={y} width={TW} height={h} fill="#eceef2" />);
        if (r.kind === 'mob') items.push(<text key={`${k}-s`} x={colX + TW / 2} y={cy + 1.6} fontSize={4.4} textAnchor="middle" fontFamily={FONT} fill="#8a94a3">missing</text>);
        return;
      }
      if (tooth.status === 'implant' && r.kind !== 'num') {
        items.push(<rect key={`${k}-i`} x={colX} y={y} width={TW} height={h} fill="#f5f1fb" />);
      }
      if (r.kind === 'mob' && tooth.status !== 'present') {
        items.push(
          <text key={`${k}-s`} x={colX + TW / 2} y={cy + 1.6} fontSize={4.4} textAnchor="middle" fontFamily={FONT}
            fill={tooth.status === 'implant' ? '#6a3fb5' : '#8a94a3'}>
            {tooth.status === 'implant' ? 'implant' : 'missing'}
          </text>,
        );
      }
      switch (r.kind) {
        case 'num':
          items.push(
            <text key={k} x={colX + TW / 2} y={cy + 1.5} fontSize={7} fontWeight="bold" textAnchor="middle" fontFamily={FONT}
              fill={tooth.status === 'missing' ? '#a3acb8' : '#1b2430'} textDecoration={tooth.status === 'missing' ? 'line-through' : undefined}>
              {t}
            </text>,
          );
          break;
        case 'mob':
          if (tooth.status === 'present' && tooth.mobility !== null) {
            items.push(
              <text key={k} x={colX + TW / 2} y={cy + 2.2} fontSize={6} textAnchor="middle" fontFamily={FONT}
                fill={tooth.mobility >= 2 ? COLORS.flag : '#1b2430'} fontWeight={tooth.mobility >= 2 ? 'bold' : undefined}>
                {tooth.mobility}
              </text>,
            );
          }
          break;
        case 'furc':
          if (tooth.status === 'present') {
            for (const { e, pos } of screenEntrances(t, r.surface!)) {
              items.push(furcSymbol(siteX(colX, pos), cy, tooth.furcation[e] ?? 0, `${k}-${e}`));
            }
          }
          break;
        default:
          siteScreenOrder(t, r.surface!).forEach((s, si) => {
            const site = tooth.sites[s];
            const sx = siteX(colX, si);
            const sk = `${k}-${s}`;
            if (r.kind === 'bop') {
              if (site.bop) items.push(<circle key={sk} cx={sx - (site.supp ? 1.6 : 0)} cy={cy} r={2} fill={COLORS.gm} />);
              if (site.supp) items.push(<circle key={`${sk}-s`} cx={sx + (site.bop ? 1.6 : 0)} cy={cy} r={2} fill="#e0a800" />);
              return;
            }
            if (r.kind === 'plaque') {
              if (site.plaque) items.push(<circle key={sk} cx={sx} cy={cy} r={2} fill="#1976d2" />);
              return;
            }
            const v = r.kind === 'cal' ? calOf(site) : site[r.kind as 'pd' | 'gm'];
            if (v === null) return;
            const flag = r.kind === 'pd' && v >= 5;
            if (flag) items.push(<rect key={`${sk}-bg`} x={sx - TW / 6 + 0.3} y={y + 0.6} width={TW / 3 - 0.6} height={h - 1.2} rx={1} fill="#fde3e3" />);
            items.push(
              <text key={sk} x={sx} y={cy + 2} fontSize={r.kind === 'pd' ? 5.6 : r.kind === 'gm' && v < 0 ? 4.6 : 5} textAnchor="middle" fontFamily={FONT}
                fill={flag ? COLORS.flag : r.kind === 'cal' ? '#5d6b7c' : '#1b2430'} fontWeight={flag ? 'bold' : undefined}>
                {v < 0 ? `−${-v}` : v}
              </text>,
            );
          });
      }
    });
    // column separators
    row.forEach((t, i) => {
      if (i === 0) return;
      items.push(<line key={`${key}-v${t}`} x1={x0 + i * TW} x2={x0 + i * TW} y1={y} y2={y + h} stroke={i === 8 ? '#9aa6b5' : '#e8ebf0'} strokeWidth={i === 8 ? 0.7 : 0.3} />);
    });
    y += h;
  }
  return <g>{items}</g>;
}

export function FullChart({ chart, id }: { chart: Chart; id?: string }) {
  const upperH = layout('upper').reduce((s, r) => s + rowHeight(r), 0);
  const H = fullChartHeight();
  return (
    <svg id={id} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${FULL_W} ${H}`} width={FULL_W * 2} height={H * 2} fontFamily={FONT}>
      <rect x={0} y={0} width={FULL_W} height={H} fill="#ffffff" />
      <JawBlock chart={chart} arch="upper" y0={0} />
      <JawBlock chart={chart} arch="lower" y0={upperH + GAP} />
    </svg>
  );
}
