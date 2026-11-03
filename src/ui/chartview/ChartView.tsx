import type { Chart } from '../../domain/chart';
import { formatNumber, summarize, type ChartSummary } from '../../domain/metrics';
import { ALL_TEETH, SITES, siteLabel } from '../../domain/teeth';
import { FullChart } from './FullChart';

export function SummaryPanel({ summary }: { summary: ChartSummary }) {
  const pct = (v: number | null) => (v === null ? '–' : `${v.toFixed(0)} %`);
  const stats: { k: string; v: string; alert?: boolean }[] = [
    { k: 'Mean PD', v: `${formatNumber(summary.meanPd)} mm` },
    { k: 'Mean CAL', v: `${formatNumber(summary.meanCal)} mm` },
    { k: 'Bleeding on probing', v: pct(summary.bopPercent), alert: (summary.bopPercent ?? 0) >= 10 },
    { k: 'Plaque', v: pct(summary.plaquePercent), alert: (summary.plaquePercent ?? 0) >= 20 },
    { k: 'Sites PD ≥ 4 mm', v: String(summary.sitesPd4plus), alert: summary.sitesPd4plus > 0 },
    { k: 'Sites PD ≥ 6 mm', v: String(summary.sitesPd6plus), alert: summary.sitesPd6plus > 0 },
    { k: 'Max PD / max CAL', v: `${summary.maxPd ?? '–'} / ${summary.maxCal ?? '–'} mm` },
    { k: 'Teeth present', v: `${summary.teethPresent}` },
    { k: 'Suppuration sites', v: String(summary.suppurationSites), alert: summary.suppurationSites > 0 },
  ];
  return (
    <>
      <div className="stats">
        {stats.map((s) => (
          <div key={s.k} className={`stat ${s.alert ? 'alert' : ''}`}>
            <div className="v">{s.v}</div>
            <div className="k">{s.k}</div>
          </div>
        ))}
      </div>
      <p className="muted small">
        {summary.teethExamined} of {summary.teethPresent} natural teeth examined ({summary.sites} sites, {summary.sitesProbed} probed).
        Percentages use 6 sites per examined tooth. Implants are excluded from these figures.
      </p>
      {summary.implantCount > 0 && (
        <p className="small">
          <b>Implants ({summary.implantCount}):</b> mean PD {formatNumber(summary.implants.meanPd)} mm · BOP {pct(summary.implants.bopPercent)} · max PD{' '}
          {summary.implants.maxPd ?? '–'} mm · suppuration at {summary.implants.suppurationSites} site(s)
        </p>
      )}
    </>
  );
}

/** Sites with PD ≥ 5 mm, for the flag list. */
export function deepSites(chart: Chart): string[] {
  const out: string[] = [];
  for (const t of ALL_TEETH) {
    const tooth = chart[t];
    if (tooth.status === 'missing') continue;
    for (const s of SITES) {
      const pd = tooth.sites[s].pd;
      if (pd !== null && pd >= 5) out.push(`${t} ${siteLabel(t, s)} (${pd})`);
    }
  }
  return out;
}

export function ChartLegend() {
  return (
    <div className="legend">
      <span>
        <i className="swatch" style={{ background: '#d32f2f' }} /> Gingival margin
      </span>
      <span>
        <i className="swatch" style={{ background: '#1565c0' }} /> Pocket base (PD)
      </span>
      <span>
        <i className="swatch" style={{ background: '#b9c1cc', height: 1 }} /> CEJ
      </span>
      <span>
        <i className="dot on bop" /> Bleeding
      </span>
      <span>
        <i className="dot on supp" /> Suppuration
      </span>
      <span>
        <i className="dot on plaque" /> Plaque
      </span>
      <span>
        <span style={{ background: '#fde3e3', color: '#d32f2f', fontWeight: 700, padding: '0 4px' }}>5</span> PD ≥ 5 mm
      </span>
      <span>△ ◭ ▲ Furcation I / II / III</span>
    </div>
  );
}

export function ChartView({ chart }: { chart: Chart }) {
  const summary = summarize(chart);
  const deep = deepSites(chart);
  return (
    <>
      <section className="card">
        <h2>Summary</h2>
        <SummaryPanel summary={summary} />
        {deep.length > 0 && (
          <p className="small">
            <b style={{ color: 'var(--danger)' }}>PD ≥ 5 mm ({deep.length}):</b> {deep.join(', ')}
          </p>
        )}
      </section>
      <section className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Periodontal chart</h2>
          <span className="spacer" />
          <ChartLegend />
        </div>
        <div className="chart-svg-wrap">
          <FullChart chart={chart} />
        </div>
      </section>
    </>
  );
}
