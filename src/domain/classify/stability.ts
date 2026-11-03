// Current periodontitis status (EFP S3 guideline / BSP implementation):
//   stable:       BOP < 10 %, PD ≤ 4 mm, no BOP at 4 mm sites
//   in remission: BOP ≥ 10 %, PD ≤ 4 mm, no BOP at 4 mm sites
//   unstable:     PD ≥ 5 mm, or PD 4 mm with BOP

import { isNatural, type Chart } from '../chart';
import type { ChartSummary } from '../metrics';
import { ALL_TEETH, SITES, siteLabel } from '../teeth';
import type { Finding, Reason, Status } from './types';

export function classifyStatus(chart: Chart, summary: ChartSummary): Finding<Status> {
  const bleeding4: string[] = [];
  for (const t of ALL_TEETH) {
    const tooth = chart[t];
    if (!isNatural(tooth)) continue;
    for (const s of SITES) {
      const site = tooth.sites[s];
      if (site.pd !== null && site.pd >= 4 && site.bop) bleeding4.push(`${t} ${siteLabel(t, s)}`);
    }
  }
  const bop = summary.bopPercent ?? 0;
  const reasons: Reason[] = [];

  if (summary.sitesPd5plus > 0 || bleeding4.length > 0) {
    if (summary.sitesPd5plus > 0) {
      reasons.push({ text: `${summary.sitesPd5plus} site(s) with PD ≥ 5 mm`, source: 'chart', decisive: true });
    }
    if (bleeding4.length > 0) {
      reasons.push({
        text: `${bleeding4.length} site(s) with PD ≥ 4 mm and BOP (${bleeding4.slice(0, 6).join(', ')}${bleeding4.length > 6 ? '…' : ''})`,
        source: 'chart',
        decisive: summary.sitesPd5plus === 0,
      });
    }
    return { value: 'unstable', reasons };
  }
  reasons.push({ text: 'No site with PD ≥ 5 mm and no 4 mm site with BOP', source: 'chart' });
  if (bop < 10) {
    reasons.push({ text: `BOP ${bop.toFixed(1)} % < 10 % → stable`, source: 'chart', decisive: true });
    return { value: 'stable', reasons };
  }
  reasons.push({ text: `BOP ${bop.toFixed(1)} % ≥ 10 % → in remission (gingival inflammation persists)`, source: 'chart', decisive: true });
  return { value: 'remission', reasons };
}
