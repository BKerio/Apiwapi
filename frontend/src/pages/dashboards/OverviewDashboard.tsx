import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Layers, Send, TrendingUp, ArrowRight } from 'lucide-react';
import { listMembers } from '@/api/members';
import { listGroups } from '@/api/groups';
import { listCampaigns } from '@/api/campaigns';
import { fmtDateTime } from '@/lib/datetime';
import { useAuthStore } from '@/stores/authStore';

function statusPillClass(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'pill pill-green';
    case 'SENDING': return 'pill pill-blue';
    case 'FAILED': return 'pill pill-red';
    default: return 'pill pill-gray';
  }
}

function OverviewDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: membersPage } = useQuery({ queryKey: ['members', 'count'], queryFn: () => listMembers({ page: 1, limit: 1 }) });
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups });
  const { data: campaignsPage, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns', 'recent'],
    queryFn: () => listCampaigns({ page: 1, limit: 50 }),
  });

  const totalMembers = membersPage?.meta.total ?? 0;
  const totalGroups = groups.length;
  const campaigns = campaignsPage?.data ?? [];
  const totalCampaigns = campaignsPage?.meta.total ?? 0;

  const now = new Date();
  const sentThisMonth = campaigns.filter((c) => {
    const d = new Date(c.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const lastCampaign = campaigns[0];
  const lastDeliveryRate = lastCampaign && lastCampaign.totalRecipients > 0
    ? Math.round((lastCampaign.sentCount / lastCampaign.totalRecipients) * 100)
    : null;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <p className="eyebrow">Overview</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Here's how your push notification platform is doing.</p>
      </div>

      <div className="stat-grid">
        <button className="stat" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/members')}>
          <div className="stat-ico"><Users /></div>
          <div className="stat-label">Members</div>
          <div className="stat-val">{totalMembers}</div>
          <div className="stat-foot">Onboarded recipients</div>
        </button>
        <button className="stat" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/groups')}>
          <div className="stat-ico"><Layers /></div>
          <div className="stat-label">Groups</div>
          <div className="stat-val">{totalGroups}</div>
          <div className="stat-foot">Audience segments</div>
        </button>
        <button className="stat" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/campaigns')}>
          <div className="stat-ico"><Send /></div>
          <div className="stat-label">Campaigns this month</div>
          <div className="stat-val">{sentThisMonth}</div>
          <div className="stat-foot">{totalCampaigns} sent all-time</div>
        </button>
        <div className="stat">
          <div className="stat-ico"><TrendingUp /></div>
          <div className="stat-label">Last campaign delivery</div>
          <div className="stat-val">{lastDeliveryRate !== null ? `${lastDeliveryRate}%` : '-'}</div>
          <div className="stat-foot">{lastCampaign ? lastCampaign.name : 'No campaigns yet'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Recent campaigns</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/campaigns')}>View all <ArrowRight size={14} /></button>
        </div>
        {campaignsLoading ? (
          <div className="card-pad"><div className="skel" style={{ height: 160 }} /></div>
        ) : campaigns.length === 0 ? (
          <div className="card-pad flex flex-col items-center text-center" style={{ gap: 8, padding: '40px 20px' }}>
            <Send size={28} style={{ color: 'var(--red)' }} />
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>No campaigns yet</p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/campaigns/new')}>Send your first campaign</button>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>{['Name', 'Sent', 'Status', 'Created'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 6).map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <td className="strong">{c.name}</td>
                    <td>{c.sentCount} / {c.totalRecipients}</td>
                    <td><span className={statusPillClass(c.status)}>{c.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default OverviewDashboard;
