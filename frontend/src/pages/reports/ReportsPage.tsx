import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { Users, Layers, Send, MessageSquare, FileDown, FileSpreadsheet, TrendingUp, TrendingDown } from 'lucide-react';
import DotLoader from '@/components/shared/DotLoader';
import { getReportsOverview, type ReportsRange } from '@/api/reports';
import { fmtDateTime } from '@/lib/datetime';
import { useNotificationStore } from '@/stores/notificationStore';

// Literal hex, not CSS var() - these feed straight into Recharts' SVG fill/
// stroke attributes, and html2canvas (used for the PDF export) can't
// reliably resolve custom properties referenced from inside an SVG
// presentation attribute. Values mirror index.css's --teal/--red/--blue/
// --violet/--cyan/--green so the on-screen and exported colors match.
// Sent/failed reuse the app's real green (--teal) and red (--red) - not the
// brand-primary --green, which was repurposed to a dark blue during the
// rebrand and no longer reads as a "success" color.
const COLOR = {
  sent: '#0D9488',
  failed: '#D62828',
  allMembers: '#2563EB',
  group: '#7C3AED',
  selected: '#0891B2',
  brand: '#1E3A8A',
  border: '#E3E8E5',
  muted: '#6B7670',
} as const;

const AUDIENCE_COLORS: Record<string, string> = {
  ALL_MEMBERS: COLOR.allMembers,
  GROUP: COLOR.group,
  SELECTED: COLOR.selected,
};
const AUDIENCE_LABELS: Record<string, string> = {
  ALL_MEMBERS: 'All members',
  GROUP: 'A group',
  SELECTED: 'Selected members',
};

const RANGE_PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
];

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(days: number): Required<ReportsRange> {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

const chartTick = { fontSize: 11, fill: COLOR.muted };
const tooltipStyle = { borderRadius: 10, border: `1px solid ${COLOR.border}`, fontSize: 12 };

function ReportsPage() {
  const [range, setRange] = useState<Required<ReportsRange>>(() => presetRange(30));
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const chartsRef = useRef<HTMLDivElement>(null);
  const { addNotification } = useNotificationStore();

  const { data: report, isLoading, isFetching } = useQuery({
    queryKey: ['reports', 'overview', range],
    queryFn: () => getReportsOverview(range),
  });

  const deliveryTotal = report ? report.deliveryBreakdown.reduce((s, d) => s + d.count, 0) : 0;
  const sentCount = report?.deliveryBreakdown.find((d) => d.status === 'SENT')?.count ?? 0;
  const successRate = report && deliveryTotal > 0 ? Math.round((sentCount / deliveryTotal) * 100) : null;

  const runExport = async (kind: 'pdf' | 'excel') => {
    if (!report) return;
    setExporting(kind);
    try {
      // Dynamically imported so jspdf/html2canvas/exceljs - only ever needed
      // once someone actually exports - don't bloat this page's own chunk.
      if (kind === 'pdf') {
        const { exportReportToPdf } = await import('@/lib/exportPdf');
        await exportReportToPdf(report, chartsRef.current);
      } else {
        const { exportReportToExcel } = await import('@/lib/exportExcel');
        await exportReportToExcel(report);
      }
    } catch {
      addNotification({ type: 'error', title: 'Export failed', message: `Could not generate the ${kind === 'pdf' ? 'PDF' : 'spreadsheet'}. Please try again.` });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Reports</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Sending trends, audience mix, and delivery performance.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-soft" disabled={!report || exporting !== null} onClick={() => runExport('excel')}>
            {exporting === 'excel' ? <DotLoader size={14} /> : <FileSpreadsheet size={16} />} Export Excel
          </button>
          <button className="btn btn-primary" disabled={!report || exporting !== null} onClick={() => runExport('pdf')}>
            {exporting === 'pdf' ? <DotLoader size={14} /> : <FileDown size={16} />} Export PDF
          </button>
        </div>
      </div>

      <div className="card card-pad flex flex-wrap items-end gap-3">
        <div className="field" style={{ minWidth: 160 }}>
          <label className="label" htmlFor="report-from">From</label>
          <input id="report-from" type="date" className="input" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </div>
        <div className="field" style={{ minWidth: 160 }}>
          <label className="label" htmlFor="report-to">To</label>
          <input id="report-to" type="date" className="input" value={range.to} min={range.from} max={toDateOnly(new Date())} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          {RANGE_PRESETS.map((p) => (
            <button key={p.days} type="button" className="btn btn-ghost btn-sm" onClick={() => setRange(presetRange(p.days))}>{p.label}</button>
          ))}
        </div>
        {isFetching && <DotLoader size={14} />}
      </div>

      {isLoading || !report ? (
        <div className="card card-pad"><div className="skel" style={{ height: 400 }} /></div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-ico"><Users /></div>
              <div className="stat-label">Members</div>
              <div className="stat-val">{report.totals.members}</div>
              <div className="stat-foot">{report.totals.subscribedMembers} subscribed</div>
            </div>
            <div className="stat">
              <div className="stat-ico"><Layers /></div>
              <div className="stat-label">Groups</div>
              <div className="stat-val">{report.totals.groups}</div>
              <div className="stat-foot">Audience segments</div>
            </div>
            <div className="stat">
              <div className="stat-ico"><Send /></div>
              <div className="stat-label">Campaigns</div>
              <div className="stat-val">{report.totals.campaigns}</div>
              <div className="stat-foot">All-time</div>
            </div>
            <div className="stat">
              <div className="stat-ico"><MessageSquare /></div>
              <div className="stat-label">Messages sent</div>
              <div className="stat-val">{report.totals.messagesSent}</div>
              <div className="stat-foot">All-time</div>
            </div>
            <div className="stat">
              <div className="stat-ico"><TrendingDown /></div>
              <div className="stat-label">Messages failed</div>
              <div className="stat-val">{report.totals.messagesFailed}</div>
              <div className="stat-foot">All-time</div>
            </div>
            <div className="stat">
              <div className="stat-ico"><TrendingUp /></div>
              <div className="stat-label">Success rate</div>
              <div className="stat-val">{successRate !== null ? `${successRate}%` : '-'}</div>
              <div className="stat-foot">Selected range</div>
            </div>
          </div>

          <div ref={chartsRef} className="col" style={{ gap: 16 }}>
            <div className="card">
              <div className="card-head"><span className="card-title">Messages sent vs failed</span></div>
              <div className="card-pad" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.campaignsOverTime} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sentFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLOR.sent} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={COLOR.sent} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="failedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLOR.failed} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={COLOR.failed} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} vertical={false} />
                    <XAxis dataKey="date" tick={chartTick} tickLine={false} axisLine={{ stroke: COLOR.border }} minTickGap={24} />
                    <YAxis tick={chartTick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="sent" name="Sent" stroke={COLOR.sent} strokeWidth={2} fill="url(#sentFill)" />
                    <Area type="monotone" dataKey="failed" name="Failed" stroke={COLOR.failed} strokeWidth={2} fill="url(#failedFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div className="card">
                <div className="card-head"><span className="card-title">Delivery success rate</span></div>
                <div className="card-pad" style={{ height: 240 }}>
                  {deliveryTotal === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted)' }}>No sends in this range</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={report.deliveryBreakdown} dataKey="count" nameKey="status" innerRadius={55} outerRadius={80} paddingAngle={2}>
                          {report.deliveryBreakdown.map((d) => (
                            <Cell key={d.status} fill={d.status === 'SENT' ? COLOR.sent : COLOR.failed} stroke="#fff" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => (value === 'SENT' ? 'Sent' : 'Failed')} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><span className="card-title">Campaign audience mix</span></div>
                <div className="card-pad" style={{ height: 240 }}>
                  {report.audienceBreakdown.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted)' }}>No campaigns in this range</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={report.audienceBreakdown} dataKey="count" nameKey="audience" innerRadius={55} outerRadius={80} paddingAngle={2}>
                          {report.audienceBreakdown.map((d) => (
                            <Cell key={d.audience} fill={AUDIENCE_COLORS[d.audience] ?? COLOR.muted} stroke="#fff" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [value, AUDIENCE_LABELS[name] ?? name]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => AUDIENCE_LABELS[value] ?? value} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><span className="card-title">Members by group</span></div>
                <div className="card-pad" style={{ height: 240 }}>
                  {report.membersByGroup.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted)' }}>No groups yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.membersByGroup} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={chartTick} tickLine={false} axisLine={{ stroke: COLOR.border }} />
                        <YAxis type="category" dataKey="group" width={90} tick={chartTick} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="count" name="Members" fill={COLOR.brand} radius={[0, 4, 4, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title">Recent campaigns</span></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>{['Name', 'Status', 'Audience', 'Recipients', 'Sent', 'Failed', 'Created'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {report.recentCampaigns.map((c) => (
                    <tr key={c.id}>
                      <td className="strong">{c.name}</td>
                      <td>{c.status}</td>
                      <td>{AUDIENCE_LABELS[c.audience] ?? c.audience}</td>
                      <td>{c.totalRecipients}</td>
                      <td>{c.sentCount}</td>
                      <td>{c.failedCount}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ReportsPage;
