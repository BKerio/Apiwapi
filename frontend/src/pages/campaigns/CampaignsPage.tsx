import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Send, ChevronLeft as CaretLeft, ChevronRight as CaretRight, Megaphone } from 'lucide-react';
import { listCampaigns } from '@/api/campaigns';
import { fmtDateTime } from '@/lib/datetime';
import type { CampaignStatus } from '@/types/api';

const STATUS_OPTIONS: { value: CampaignStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
];

function statusPillClass(status: CampaignStatus): string {
  switch (status) {
    case 'COMPLETED': return 'pill pill-green';
    case 'SENDING': return 'pill pill-blue';
    case 'FAILED': return 'pill pill-red';
  }
}

function audienceLabel(c: { audience: string; groupNameSnapshot?: string | null; totalRecipients: number }): string {
  if (c.audience === 'ALL_MEMBERS') return 'All members';
  if (c.audience === 'GROUP') return c.groupNameSnapshot ? `Group: ${c.groupNameSnapshot}` : 'Group';
  return `${c.totalRecipients} selected`;
}

function CampaignsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CampaignStatus | 'ALL'>('ALL');
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', page, status],
    queryFn: () => listCampaigns({ page, limit: 20, status: status === 'ALL' ? undefined : status }),
  });

  const campaigns = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Sending</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Campaigns</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{meta.total} campaign(s) sent</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/campaigns/new')}>
          <Send size={16} /> New Campaign
        </button>
      </div>

      <div className="card card-pad">
        <select className="eoc-select" value={status} onChange={(e) => { setStatus(e.target.value as CampaignStatus | 'ALL'); setPage(1); }} style={{ maxWidth: 220 }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="card-pad"><div className="skel" style={{ height: 240 }} /></div>
        ) : campaigns.length === 0 ? (
          <div className="card-pad flex flex-col items-center text-center" style={{ gap: 8, padding: '48px 20px' }}>
            <Megaphone size={32} style={{ color: 'var(--red)' }} />
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>No campaigns yet</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Send your first push notification to get started.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {['Name', 'Audience', 'Sent', 'Failed', 'Status', 'Created'].map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <td className="strong">{c.name}</td>
                    <td>{audienceLabel(c)}</td>
                    <td>{c.sentCount} / {c.totalRecipients}</td>
                    <td>{c.failedCount > 0 ? <span style={{ color: 'var(--red)' }}>{c.failedCount}</span> : 0}</td>
                    <td><span className={statusPillClass(c.status)}>{c.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between card-pad" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Page {meta.page} of {meta.totalPages}</span>
            <div className="flex gap-2">
              <button className="btn btn-soft btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><CaretLeft size={14} /></button>
              <button className="btn btn-soft btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}><CaretRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CampaignsPage;
