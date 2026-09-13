import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, Users, Layers, UserCheck, Search } from 'lucide-react';
import DotLoader from '@/components/shared/DotLoader';
import { useNotificationStore } from '@/stores/notificationStore';
import { createCampaign, previewCampaign } from '@/api/campaigns';
import { listGroups } from '@/api/groups';
import { listMembers } from '@/api/members';
import type { CampaignAudience } from '@/types/api';

interface NavState {
  audience?: CampaignAudience;
  groupId?: string;
  groupName?: string;
  memberIds?: string[];
  memberNames?: string[];
}

interface PickedMember {
  id: string;
  name: string;
}

function NewCampaignPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const incoming = (location.state ?? {}) as NavState;

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<CampaignAudience>(incoming.audience ?? 'ALL_MEMBERS');
  const [groupId, setGroupId] = useState(incoming.groupId ?? '');
  // Pre-populated when arriving from "Members" with a bulk selection already
  // made there; otherwise the operator picks members right here via MemberPicker.
  const [selectedMembers, setSelectedMembers] = useState<PickedMember[]>(() => {
    const ids = incoming.memberIds ?? [];
    const names = incoming.memberNames ?? [];
    return ids.map((id, i) => ({ id, name: names[i] ?? id }));
  });
  const memberIds = useMemo(() => selectedMembers.map((m) => m.id), [selectedMembers]);

  const toggleMember = (m: PickedMember) => {
    setSelectedMembers((prev) => (prev.some((x) => x.id === m.id) ? prev.filter((x) => x.id !== m.id) : [...prev, m]));
  };

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups });

  const audienceValid = audience === 'ALL_MEMBERS' || (audience === 'GROUP' && !!groupId) || (audience === 'SELECTED' && memberIds.length > 0);

  const previewInput = useMemo(() => ({
    audience,
    groupId: audience === 'GROUP' ? groupId : undefined,
    memberIds: audience === 'SELECTED' ? memberIds : undefined,
    message: message.trim() || ' ',
  }), [audience, groupId, memberIds, message]);

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['campaigns', 'preview', previewInput],
    queryFn: () => previewCampaign(previewInput),
    enabled: audienceValid,
  });

  const sendMutation = useMutation({
    mutationFn: () => createCampaign({
      name,
      title,
      message,
      audience,
      groupId: audience === 'GROUP' ? groupId : undefined,
      memberIds: audience === 'SELECTED' ? memberIds : undefined,
    }),
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      addNotification({ type: 'success', title: 'Campaign sending', message: `"${campaign.name}" is on its way to ${campaign.totalRecipients} recipient(s).` });
      navigate(`/campaigns/${campaign.id}`);
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not send campaign', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const canSend =
    name.trim().length >= 2 &&
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    audienceValid &&
    !sendMutation.isPending;

  return (
    <div className="col" style={{ gap: 20, maxWidth: 720 }}>
      <div>
        <p className="eyebrow">Sending</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>New Campaign</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Compose a message and choose who receives it.</p>
      </div>

      <div className="card card-pad col" style={{ gap: 16 }}>
        <div className="field">
          <label className="label" htmlFor="campaign-name">Campaign name</label>
          <input id="campaign-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. August promo" />
        </div>

        <div className="field">
          <label className="label" htmlFor="campaign-title">Notification title</label>
          <input
            id="campaign-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New update available"
            maxLength={200}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="campaign-message">Notification body</label>
          <textarea
            id="campaign-message"
            className="eoc-textarea"
            style={{ minHeight: 120 }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Body text shown under the title…"
            maxLength={2000}
          />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Sent as-is to every device - push notifications go out in batches and are not personalized per recipient.
          </span>
        </div>

        <div className="field">
          <label className="label">Audience</label>
          <div className="seg" style={{ width: 'fit-content' }}>
            <button type="button" className={audience === 'ALL_MEMBERS' ? 'on' : ''} onClick={() => setAudience('ALL_MEMBERS')}>
              <Users size={14} /> All members
            </button>
            <button type="button" className={audience === 'GROUP' ? 'on' : ''} onClick={() => setAudience('GROUP')}>
              <Layers size={14} /> A group
            </button>
            <button
              type="button"
              className={audience === 'SELECTED' ? 'on' : ''}
              onClick={() => setAudience('SELECTED')}
            >
              <UserCheck size={14} /> Selected ({memberIds.length})
            </button>
          </div>
        </div>

        {audience === 'GROUP' && (
          <div className="field">
            <label className="label" htmlFor="campaign-group">Group</label>
            <select id="campaign-group" className="eoc-select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Choose a group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g._count.members})</option>)}
            </select>
          </div>
        )}

        {audience === 'SELECTED' && (
          <div className="field">
            <label className="label">Members</label>
            <MemberPicker selected={selectedMembers} onToggle={toggleMember} />
          </div>
        )}

        <div className="card card-pad" style={{ background: 'var(--surface-3)' }}>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}><DotLoader size={14} /> Calculating recipients…</div>
          ) : preview ? (
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                {preview.recipientCount} member(s) with the app installed will receive this ({preview.deviceCount} device(s))
              </span>
              {preview.recipientCount === 0 && (
                <span className="text-xs" style={{ color: 'var(--red)' }}>None of the matched members have registered the app yet</span>
              )}
            </div>
          ) : (
            <span className="text-sm" style={{ color: 'var(--muted)' }}>Choose an audience and write a message to preview recipients.</span>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/campaigns')}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSend} onClick={() => sendMutation.mutate()}>
            {sendMutation.isPending ? <DotLoader size={16} /> : <Send size={16} />}
            {sendMutation.isPending ? 'Sending…' : `Send to ${preview?.recipientCount ?? 0}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline searchable member picker, so an operator can build a one-off recipient list without leaving the New Campaign form. */
function MemberPicker({ selected, onToggle }: { selected: PickedMember[]; onToggle: (m: PickedMember) => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['members', 'picker', search, page],
    queryFn: () => listMembers({ search: search || undefined, page, limit: 8 }),
  });
  const members = data?.data ?? [];
  const meta = data?.meta;
  const selectedIds = useMemo(() => new Set(selected.map((m) => m.id)), [selected]);

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="input-icon">
        <input
          className="input"
          placeholder="Search members by name or phone…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Search size={16} />
      </div>

      <div className="col scroll-thin" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 230, overflowY: 'auto' }}>
        {isLoading ? (
          <div className="skel" style={{ height: 120, margin: 8 }} />
        ) : members.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)', padding: 16 }}>
            {search ? `No members match "${search}".` : 'No members yet - add some on the Members page first.'}
          </p>
        ) : (
          members.map((m, i) => (
            <label
              key={m.id}
              className="flex items-center gap-2"
              style={{ padding: '9px 12px', cursor: 'pointer', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
            >
              <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => onToggle({ id: m.id, name: m.name })} />
              <span className="text-sm" style={{ color: 'var(--ink)' }}>{m.name}</span>
              <span className="text-xs mono" style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{m.phone}</span>
            </label>
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Page {meta.page} of {meta.totalPages}</span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-soft btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button type="button" className="btn btn-soft btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="wrap-gap">
          {selected.map((m) => (
            <span key={m.id} className="tag-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {m.name}
              <button
                type="button"
                onClick={() => onToggle(m)}
                style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', padding: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default NewCampaignPage;
