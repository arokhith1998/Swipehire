/**
 * Honesty Dashboard — public page at /honesty.
 *
 * Shows calibration error, job liveness rate, per-ATS auto-apply success,
 * visa data freshness, cancellation friction. The forcing function for
 * not gaming match scores.
 *
 * Spec: docs/03_architecture.md §13.2
 */

import { useQuery } from '@tanstack/react-query';

interface HonestyMetrics {
  generatedAt: string;
  windowDays: number;
  calibration: Array<{
    band: string;
    predictedAvg: number;
    actualInterviewRate: number;
    sampleSize: number;
  }>;
  jobLivenessRate: { surfacedCount: number; liveOnClickRate: number };
  atsAutoApplyHealth: Array<{
    ats: string;
    tier: number;
    attempted: number;
    successRate: number;
    requiresHumanRate: number;
  }>;
  visaDataFreshness: {
    latestQuarter: string | null;
    daysSinceIngest: number | null;
    nextExpectedRefresh: string | null;
  };
  cancellation: { medianTimeToCancelMs: number | null; requiresEmail: false };
}

export default function HonestyDashboard() {
  const { data, isLoading, error } = useQuery<HonestyMetrics>({
    queryKey: ['honesty-metrics'],
    queryFn: async () => {
      const r = await fetch('/api/honesty');
      if (!r.ok) throw new Error('Failed to load metrics');
      return r.json();
    },
    refetchInterval: 5 * 60 * 1000,  // 5 min
  });

  if (isLoading) return <div className="p-8 text-gray-600">Loading honesty metrics…</div>;
  if (error || !data) return <div className="p-8 text-red-600">Could not load metrics.</div>;

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-12">
      <header className="border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#1E2A38' }}>
          Honesty Dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          Public metrics, updated weekly. The competition won't show you these. We will.
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Generated {new Date(data.generatedAt).toLocaleString()} · Window: last {data.windowDays} days
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-3">Match score calibration</h2>
        <p className="text-sm text-gray-600 mb-4">
          Of jobs we predicted at each probability band, what % actually led to interviews?
          Closer to 1:1 = honest. Below = we're under-predicting; above = over-promising (the Jobright trap).
        </p>
        {data.calibration.length === 0 ? (
          <EmptyMetric note="Not enough labeled outcomes yet — calibration begins after first 100 confirmed interviews." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Band</th>
                <th className="text-right py-2">Predicted (avg)</th>
                <th className="text-right py-2">Actual interview rate</th>
                <th className="text-right py-2">N</th>
              </tr>
            </thead>
            <tbody>
              {data.calibration.map(c => (
                <tr key={c.band} className="border-b">
                  <td className="py-2">{c.band}</td>
                  <td className="text-right">{(c.predictedAvg * 100).toFixed(0)}%</td>
                  <td className="text-right">{(c.actualInterviewRate * 100).toFixed(0)}%</td>
                  <td className="text-right text-gray-500">{c.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Job liveness</h2>
        <Big
          value={`${(data.jobLivenessRate.liveOnClickRate * 100).toFixed(1)}%`}
          label={`of ${data.jobLivenessRate.surfacedCount} jobs surfaced were verified live within 24h`}
          target="≥ 95%"
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Auto-apply health (per ATS)</h2>
        {data.atsAutoApplyHealth.length === 0 ? (
          <EmptyMetric note="No auto-apply attempts in this window." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">ATS</th>
                <th className="text-left py-2">Tier</th>
                <th className="text-right py-2">Attempted</th>
                <th className="text-right py-2">Success</th>
                <th className="text-right py-2">Needs human</th>
              </tr>
            </thead>
            <tbody>
              {data.atsAutoApplyHealth.map(a => (
                <tr key={a.ats} className="border-b">
                  <td className="py-2 capitalize">{a.ats}</td>
                  <td>Tier {a.tier}</td>
                  <td className="text-right">{a.attempted}</td>
                  <td className="text-right">{(a.successRate * 100).toFixed(0)}%</td>
                  <td className="text-right text-gray-500">{(a.requiresHumanRate * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Visa data freshness</h2>
        {data.visaDataFreshness.latestQuarter ? (
          <Big
            value={data.visaDataFreshness.latestQuarter}
            label={`DOL OFLC LCA data ingested ${data.visaDataFreshness.daysSinceIngest ?? '?'} days ago`}
            target="quarterly"
          />
        ) : (
          <EmptyMetric note="No DOL ingestion run yet." />
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Cancellation</h2>
        <Big
          value={`${data.cancellation.medianTimeToCancelMs ?? '—'} ms`}
          label="Median time from cancel-click to confirmation. No email required."
          target="≤ 1000 ms, no email"
        />
      </section>

      <footer className="border-t border-gray-200 pt-6 text-xs text-gray-500">
        Source: <code>GET /api/honesty</code>. Cached 1 hour. Recomputed nightly.
      </footer>
    </div>
  );
}

function Big({ value, label, target }: { value: string; label: string; target: string }) {
  return (
    <div className="border rounded-lg p-6 bg-gray-50">
      <div className="text-4xl font-bold" style={{ color: '#00ABA8' }}>{value}</div>
      <div className="text-sm text-gray-700 mt-2">{label}</div>
      <div className="text-xs text-gray-500 mt-1">Target: {target}</div>
    </div>
  );
}

function EmptyMetric({ note }: { note: string }) {
  return <div className="text-sm text-gray-500 italic">{note}</div>;
}
