import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ChevronLeft as CaretLeft, ChevronRight as CaretRight } from 'lucide-react';
import { getCampaign, listCampaignRecipients, retryFailedRecipients } from '@/api/campaigns';
import { socket } from '@/lib/socket';
import { fmtDateTime } from '@/lib/datetime';
import { useNotificationStore } from '@/stores/notificationStore';
import type { CampaignProgressEvent, RecipientStatus } from '@/types/api';

function statusPillClass(status: string): string {
  switch (status) {
    case 'SENT': return 'pill pill-green';
    case 'FAILED': return 'pill pill-red';
    case 'COMPLETED': return 'pill pill-green';
    case 'SENDING': return 'pill pill-blue';
    default: return 'pill pill-gray';
  }
}

function CampaignDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | 'ALL'>('ALL');
  const [live, setLive] = useState<CampaignProgressEvent | null>(null);

  const { data: campaign, isLoading } = useQuery({ queryKey: ['campaigns', id], queryFn: () => getCampaign(id), enabled: !!id });

  const { data: recipients, isLoading: recipientsLoading } = useQuery({
    queryKey: ['campaigns', id, 'recipients', page, statusFilter],
    queryFn: () => listCampaignRecipients(id, { page, limit: 20, status: statusFilter === 'ALL' ? undefined : statusFilter }),
    enabled: !!id,
  });

  // Live progress: the dispatcher (backend/src/modules/campaigns/dispatch.service.ts)
  // pushes one `campaign:progress` event per batch instead of the frontend polling.
  useEffect(() => {
    function onProgress(event: CampaignProgressEvent) {
      if (event.campaignId !== id) return;
      setLive(event);
      queryClient.invalidateQueries({ queryKey: ['campaigns', id, 'recipients'] });
      if (event.status !== 'SENDING') {
        queryClient.invalidateQueries({ queryKey: ['campaigns', id] });
      }
    }
    socket.on('campaign:progress', onProgress);
    return () => { socket.off('campaign:progress', onProgress); };
  }, [id, queryClient]);

  const retryMutation = useMutation({
    mutationFn: () => retryFailedRecipients(id),
    onSuccess: (result) => {
      addNotification({ type: 'success', title: 'Retrying', message: `Re-sending to ${result.retrying} recipient(s).` });
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Retry failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  if (isLoading || !campaign) {
    return <div className="skel" style={{ height: 320 }} />;
  }

  const sentCount = live?.sentCount ?? campaign.sentCount;
  const failedCount = live?.failedCount ?? campaign.failedCount;
  const status = live?.status ?? campaign.status;
  const totalRecipients = campaign.totalRecipients;
  const donePct = totalRecipients > 0 ? Math.round(((sentCount + failedCount) / totalRecipients) * 100) : 0;

  const rows = recipients?.data ?? [];
  const meta = recipients?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 };

  return (
    <div className="col" style={{ gap: 20 }}>
      <button className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }} onClick={() => navigate('/campaigns')}>
        <ArrowLeft size={14} /> Back to campaigns
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Campaign</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{campaign.name}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Sent {fmtDateTime(campaign.createdAt)} by {campaign.createdBy.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={statusPillClass(status)}>{status}</span>
          {status !== 'SENDING' && failedCount > 0 && (
            <button className="btn btn-soft btn-sm" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate()}>
              <RefreshCw size={14} /> Retry failed ({failedCount})
            </button>
          )}
        </div>
      </div>

      <div className="card card-pad col" style={{ gap: 10 }}>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--muted)' }}>{sentCount + failedCount} of {totalRecipients} processed</span>
          <span className="font-bold" style={{ color: 'var(--ink)' }}>{donePct}%</span>
        </div>
        <div className="meter"><span style={{ width: `${donePct}%` }} /></div>
        <div className="flex gap-4 text-sm mt-1">
          <span><b style={{ color: 'var(--green)' }}>{sentCount}</b> sent</span>
          <span><b style={{ color: 'var(--red)' }}>{failedCount}</b> failed</span>
          <span><b style={{ color: 'var(--muted)' }}>{totalRecipients - sentCount - failedCount}</b> pending</span>
        </div>
      </div>

      <div className="card card-pad col" style={{ gap: 12 }}>
        <div>
          <label className="label">Title</label>
          <p className="text-sm mt-2 font-bold" style={{ color: 'var(--ink)' }}>{campaign.title}</p>
        </div>
        <div>
          <label className="label">Body</label>
          <p className="text-sm mt-2" style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{campaign.message}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Delivery log</span>
          <select className="eoc-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as RecipientStatus | 'ALL'); setPage(1); }} style={{ maxWidth: 160 }}>
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        {recipientsLoading ? (
          <div className="card-pad"><div className="skel" style={{ height: 200 }} /></div>
        ) : rows.length === 0 ? (
          <div className="card-pad text-center text-sm" style={{ color: 'var(--muted)', padding: '32px 20px' }}>No recipients match this filter.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>{['Name', 'Phone', 'Status', 'Sent at', 'Error'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ cursor: 'default' }}>
                    <td className="strong">{r.nameSnapshot}</td>
                    <td className="mono">{r.phoneSnapshot}</td>
                    <td><span className={statusPillClass(r.status)}>{r.status}</span></td>
                    <td>{r.sentAt ? fmtDateTime(r.sentAt) : '-'}</td>
                    <td style={{ color: 'var(--red)' }}>{r.error || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between card-pad" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Page {meta.page} of {meta.totalPages} · {meta.total} recipients</span>
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

export default CampaignDetailPage;
