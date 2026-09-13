import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, Pencil as PencilSimple, Trash2, X, Layers, Send } from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import DotLoader from '@/components/shared/DotLoader';
import { confirmDialog } from '@/lib/alert';
import { createGroup, deleteGroup, getGroup, listGroups, setMemberPosition, updateGroup } from '@/api/groups';
import type { Group, GroupPosition } from '@/types/api';
import { GROUP_POSITION_OPTIONS } from '@/types/api';

const groupSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  description: z.string().optional(),
});
type GroupForm = z.infer<typeof groupSchema>;

function GroupsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: groups = [], isLoading } = useQuery({ queryKey: ['groups'], queryFn: listGroups });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['groups'] });

  const createMutation = useMutation({
    mutationFn: (values: GroupForm) => createGroup(values),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      addNotification({ type: 'success', title: 'Group created', message: 'Members can now be added to it.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Failed to create group', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: GroupForm }) => updateGroup(id, values),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      addNotification({ type: 'success', title: 'Group updated', message: 'Changes have been saved.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Update failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Group deleted', message: 'Its members were not removed.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Delete failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const handleDelete = async (group: Group) => {
    const confirmed = await confirmDialog({
      title: 'Delete group',
      text: `Delete "${group.name}"? Its ${group._count.members} member(s) will stay onboarded but lose this grouping.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (confirmed) deleteMutation.mutate(group.id);
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Audience</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Groups</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{groups.length} group(s) to target a campaign at</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <FolderPlus size={16} /> New Group
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="card-pad"><div className="skel" style={{ height: 200 }} /></div>
        ) : groups.length === 0 ? (
          <div className="card-pad flex flex-col items-center text-center" style={{ gap: 8, padding: '48px 20px' }}>
            <Layers size={32} style={{ color: 'var(--red)' }} />
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>No groups yet</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Create one to start organizing your members.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {['Name', 'Description', 'Members', ''].map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} onClick={() => setViewingId(g.id)}>
                    <td className="strong">{g.name}</td>
                    <td>{g.description || '-'}</td>
                    <td>{g._count.members}</td>
                    <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        className="icon-btn" title="Send campaign"
                        onClick={() => navigate('/campaigns/new', { state: { audience: 'GROUP', groupId: g.id, groupName: g.name } })}
                      >
                        <Send size={14} />
                      </button>
                      <button className="icon-btn" title="Edit" onClick={() => setEditing(g)}><PencilSimple size={14} /></button>
                      <button className="icon-btn" title="Delete" onClick={() => handleDelete(g)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <GroupModal
          title="New Group"
          onClose={() => setCreateOpen(false)}
          submitting={createMutation.isPending}
          onSubmit={async (values) => { await createMutation.mutateAsync(values); }}
        />
      )}

      {editing && (
        <GroupModal
          title="Edit Group"
          group={editing}
          onClose={() => setEditing(null)}
          submitting={editMutation.isPending}
          onSubmit={async (values) => { await editMutation.mutateAsync({ id: editing.id, values }); }}
        />
      )}

      {viewingId && <GroupMembersDrawer groupId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  );
}

function GroupModal({ title, group, onClose, onSubmit, submitting }: {
  title: string;
  group?: Group;
  onClose: () => void;
  onSubmit: (values: GroupForm) => Promise<void> | void;
  submitting?: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: group?.name ?? '', description: group?.description ?? '' },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,20,15,0.45)' }}>
      <div className="card w-full" style={{ maxWidth: 420 }}>
        <div className="card-head">
          <span className="card-title">{title}</span>
          <button className="icon-btn" onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <form className="card-pad col" style={{ gap: 14 }} onSubmit={handleSubmit(async (v) => onSubmit(v))}>
          <div className="field">
            <label className="label" htmlFor="group-name">Name</label>
            <input id="group-name" className="input" {...register('name')} />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="group-description">Description (optional)</label>
            <textarea id="group-description" className="eoc-textarea" {...register('description')} />
          </div>
          <div className="flex gap-2" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary flex-1" disabled={submitting}>
              {submitting ? <DotLoader size={16} /> : null}
              {submitting ? 'Saving…' : 'Save group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GroupMembersDrawer({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { data: group, isLoading } = useQuery({ queryKey: ['groups', groupId], queryFn: () => getGroup(groupId) });
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const positionMutation = useMutation({
    mutationFn: ({ memberId, position }: { memberId: string; position: GroupPosition | null }) =>
      setMemberPosition(groupId, memberId, position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', groupId] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not update position', message: err?.response?.data?.message || 'Please try again.' }),
  });

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <div className="drawer">
        <div className="card-head">
          <span className="card-title">{group?.name ?? 'Group'}</span>
          <button className="icon-btn" onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <div className="col scroll-thin" style={{ gap: 10, padding: 16, overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div className="skel" style={{ height: 200 }} />
          ) : !group || group.members.data.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No members in this group yet.</p>
          ) : (
            group.members.data.map((m) => (
              <div key={m.id} className="card card-pad flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{m.name}</p>
                  <p className="text-xs mono" style={{ color: 'var(--muted)' }}>{m.phone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`pill ${m.isSubscribed ? 'pill-green' : 'pill-gray'}`}>{m.isSubscribed ? 'Subscribed' : 'Opted out'}</span>
                  <select
                    className="eoc-select"
                    style={{ minWidth: 150 }}
                    value={m.position ?? ''}
                    onChange={(e) => positionMutation.mutate({ memberId: m.id, position: (e.target.value || null) as GroupPosition | null })}
                  >
                    <option value="">No position</option>
                    {GROUP_POSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default GroupsPage;
