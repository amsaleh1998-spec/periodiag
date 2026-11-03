import type { Chart } from '../../domain/chart';
import type { Arch, Surface } from '../../domain/teeth';
import { JAW_W, SurfaceDrawing, VIEW_H } from './drawing';

/** Stand-alone SVG of one arch surface, sized to the 16 entry-grid columns. */
export function JawDrawing({ chart, arch, surface }: { chart: Chart; arch: Arch; surface: Surface }) {
  return (
    <svg viewBox={`0 0 ${JAW_W} ${VIEW_H}`} role="img" aria-label={`${arch} ${surface} drawing`}>
      <SurfaceDrawing chart={chart} arch={arch} surface={surface} />
    </svg>
  );
}
