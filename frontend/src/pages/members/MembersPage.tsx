import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus, Upload, ChevronLeft as CaretLeft, ChevronRight as CaretRight,
  Pencil as PencilSimple, Trash2, X, Users, Send, Search, FileDown, FileSpreadsheet,
} from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import DotLoader from '@/components/shared/DotLoader';
import CreatableCombobox from '@/components/shared/CreatableCombobox';
import { confirmDialog } from '@/lib/alert';
import { createMember, deleteMember, importMembersFile, listAllMembers, listMembers, updateMember } from '@/api/members';
import { createGroup, listGroups } from '@/api/groups';
import type { GroupRef, ImportResult, Member } from '@/types/api';
import { GROUP_POSITION_LABELS } from '@/types/api';

const memberSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z.string().min(6, 'Enter a valid phone number'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
});
type MemberForm = z.infer<typeof memberSchema>;

function MembersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['members', page, search, groupFilter],
    queryFn: () => listMembers({ page, limit: 20, search: search || undefined, groupId: groupFilter || undefined }),
  });
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['members'] });

  const createMutation = useMutation({
    mutationFn: (values: MemberForm & { groupIds: string[] }) => createMember({ ...values, email: values.email || undefined }),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      addNotification({ type: 'success', title: 'Member added', message: 'They can now be included in campaigns.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Failed to add member', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: MemberForm & { groupIds: string[] } }) =>
      updateMember(id, { ...values, email: values.email || undefined }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      addNotification({ type: 'success', title: 'Member updated', message: 'Changes have been saved.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Update failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMember(id),
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Member removed', message: 'They will no longer receive campaigns.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Delete failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const handleDelete = async (member: Member) => {
    const confirmed = await confirmDialog({
      title: 'Remove member',
      text: `Remove ${member.name} (${member.phone})? This can't be undone.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (confirmed) deleteMutation.mutate(member.id);
  };

  const members = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startCampaignWithSelected = () => {
    const chosen = members.filter((m) => selected.has(m.id));
    navigate('/campaigns/new', { state: { audience: 'SELECTED', memberIds: chosen.map((m) => m.id), memberNames: chosen.map((m) => m.name) } });
  };

  // Exports every member matching the current search/group filter (not just
  // the current page) - the heavy libraries are dynamically imported so they
  // only ever load once someone actually clicks one of these buttons.
  const handleExport = async (kind: 'pdf' | 'excel') => {
    setExporting(kind);
    try {
      const all = await listAllMembers({ search: search || undefined, groupId: groupFilter || undefined });
      const groupName = groups.find((g) => g.id === groupFilter)?.name;
      if (kind === 'excel') {
        const { exportMembersToExcel } = await import('@/lib/exportMembersExcel');
        await exportMembersToExcel(all, groupName ? `_${groupName}` : '');
      } else {
        const { exportMembersToPdf } = await import('@/lib/exportMembersPdf');
        await exportMembersToPdf(all, { search: search || undefined, groupName });
      }
    } catch {
      addNotification({ type: 'error', title: 'Export failed', message: `Could not export members to ${kind === 'pdf' ? 'PDF' : 'Excel'}. Please try again.` });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Audience</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Members</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{meta.total} people onboarded</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-soft" disabled={exporting !== null} onClick={() => handleExport('excel')}>
            {exporting === 'excel' ? <DotLoader size={14} /> : <FileSpreadsheet size={16} />} Export Excel
          </button>
          <button className="btn btn-soft" disabled={exporting !== null} onClick={() => handleExport('pdf')}>
            {exporting === 'pdf' ? <DotLoader size={14} /> : <FileDown size={16} />} Export PDF
          </button>
          <button className="btn btn-soft" onClick={() => setImportOpen(true)}><Upload size={16} /> Import</button>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}><UserPlus size={16} /> Add Member</button>
        </div>
      </div>

      <div className="card card-pad flex flex-wrap items-end gap-3">
        <form
          className="field grow"
          style={{ minWidth: 220 }}
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}
        >
          <label className="label">Search</label>
          <div className="input-icon">
            <input className="input" placeholder="Name, phone or email…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <Search size={16} />
          </div>
        </form>
        <div className="field" style={{ minWidth: 200 }}>
          <label className="label">Group</label>
          <select className="eoc-select" value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(''); setSearch(''); setGroupFilter(''); setPage(1); }}>Reset</button>
      </div>

      {selected.size > 0 && (
        <div className="card card-pad flex items-center justify-between" style={{ background: 'var(--green-light)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--green)' }}>{selected.size} member(s) selected</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            <button className="btn btn-primary btn-sm" onClick={startCampaignWithSelected}><Send size={14} /> New campaign</button>
          </div>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="card-pad"><div className="skel" style={{ height: 240 }} /></div>
        ) : members.length === 0 ? (
          <div className="card-pad flex flex-col items-center text-center" style={{ gap: 8, padding: '48px 20px' }}>
            <Users size={32} style={{ color: 'var(--red)' }} />
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>No members found</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={members.length > 0 && members.every((m) => selected.has(m.id))}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          members.forEach((m) => (e.target.checked ? next.add(m.id) : next.delete(m.id)));
                          return next;
                        });
                      }}
                    />
                  </th>
                  {['Name', 'Phone', 'Email', 'Groups', 'Status', ''].map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelected(m.id)} /></td>
                    <td className="strong">{m.name}</td>
                    <td className="mono">{m.phone}</td>
                    <td>{m.email || '-'}</td>
                    <td>
                      <div className="wrap-gap" style={{ gap: 4 }}>
                        {m.groups.length === 0 ? <span className="tag-soft">-</span> : m.groups.map((g) => (
                          <span key={g.id} className="tag-soft">{g.name}{g.position ? ` · ${GROUP_POSITION_LABELS[g.position]}` : ''}</span>
                        ))}
                      </div>
                    </td>
                    <td><span className={`pill ${m.isSubscribed ? 'pill-green' : 'pill-gray'}`}>{m.isSubscribed ? 'Subscribed' : 'Opted out'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="icon-btn" title="Edit" onClick={() => setEditing(m)}><PencilSimple size={14} /></button>
                      <button className="icon-btn" title="Remove" onClick={() => handleDelete(m)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between card-pad" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Page {meta.page} of {meta.totalPages} · {meta.total} members</span>
            <div className="flex gap-2">
              <button className="btn btn-soft btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><CaretLeft size={14} /></button>
              <button className="btn btn-soft btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}><CaretRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {addOpen && (
        <MemberModal
          title="Add Member"
          allGroups={groups}
          submitting={createMutation.isPending}
          onClose={() => setAddOpen(false)}
          onSubmit={async (values, groupIds) => { await createMutation.mutateAsync({ ...values, groupIds }); }}
        />
      )}

      {editing && (
        <MemberModal
          title="Edit Member"
          member={editing}
          allGroups={groups}
          submitting={editMutation.isPending}
          onClose={() => setEditing(null)}
          onSubmit={async (values, groupIds) => { await editMutation.mutateAsync({ id: editing.id, values: { ...values, groupIds } }); }}
        />
      )}

      {importOpen && (
        <ImportMembersModal
          onClose={() => setImportOpen(false)}
          onImported={() => { invalidate(); queryClient.invalidateQueries({ queryKey: ['groups'] }); }}
        />
      )}
    </div>
  );
}

function MemberModal({ title, member, allGroups, onClose, onSubmit, submitting }: {
  title: string;
  member?: Member;
  allGroups: GroupRef[];
  onClose: () => void;
  onSubmit: (values: MemberForm, groupIds: string[]) => Promise<void> | void;
  submitting?: boolean;
}) {
  const [selectedGroups, setSelectedGroups] = useState<GroupRef[]>(member?.groups ?? []);
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<MemberForm>({
    resolver: zodResolver(memberSchema),
    defaultValues: { name: member?.name ?? '', phone: member?.phone ?? '', email: member?.email ?? '', notes: member?.notes ?? '' },
  });

  const availableGroupNames = allGroups.filter((g) => !selectedGroups.some((sg) => sg.id === g.id)).map((g) => g.name);

  function addGroupByName(name: string) {
    if (selectedGroups.some((g) => g.name === name)) return;
    const existing = allGroups.find((g) => g.name === name);
    if (existing) setSelectedGroups((prev) => [...prev, existing]);
  }

  async function handleCreateGroup(name: string) {
    const g = await createGroup({ name });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    setSelectedGroups((prev) => [...prev, { id: g.id, name: g.name }]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,20,15,0.45)' }}>
      <div className="card w-full" style={{ maxWidth: 460 }}>
        <div className="card-head">
          <span className="card-title">{title}</span>
          <button className="icon-btn" onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <form
          className="card-pad col"
          style={{ gap: 14 }}
          onSubmit={handleSubmit(async (v) => onSubmit(v, selectedGroups.map((g) => g.id)))}
        >
          <div className="field">
            <label className="label" htmlFor="member-name">Full name</label>
            <input id="member-name" className="input" {...register('name')} />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="member-phone">Phone number</label>
            <input id="member-phone" className="input" type="tel" placeholder="0712345678" {...register('phone')} />
            {errors.phone && <span className="field-error">{errors.phone.message}</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="member-email">Email (optional)</label>
            <input id="member-email" className="input" type="email" {...register('email')} />
            {errors.email && <span className="field-error">{errors.email.message}</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="member-notes">Notes (optional)</label>
            <textarea id="member-notes" className="eoc-textarea" {...register('notes')} />
          </div>
          <div className="field">
            <label className="label">Groups</label>
            <CreatableCombobox
              options={availableGroupNames}
              value=""
              onChange={addGroupByName}
              onCreateOption={handleCreateGroup}
              placeholder="Add to a group…"
            />
            {selectedGroups.length > 0 && (
              <div className="wrap-gap" style={{ marginTop: 4 }}>
                {selectedGroups.map((g) => (
                  <span key={g.id} className="tag-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {g.name}
                    <button
                      type="button"
                      onClick={() => setSelectedGroups((prev) => prev.filter((x) => x.id !== g.id))}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', padding: 0, lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary flex-1" disabled={submitting}>
              {submitting ? <DotLoader size={16} /> : null}
              {submitting ? 'Saving…' : 'Save member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportMembersModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { addNotification } = useNotificationStore();

  const importMutation = useMutation({
    mutationFn: (f: File) => importMembersFile(f),
    onSuccess: (data) => {
      setResult(data);
      onImported();
      addNotification({ type: 'success', title: 'Import complete', message: `${data.created} member(s) added.` });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Import failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,20,15,0.45)' }}>
      <div className="card w-full" style={{ maxWidth: 480 }}>
        <div className="card-head">
          <span className="card-title">Import Members</span>
          <button className="icon-btn" onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <div className="card-pad col" style={{ gap: 14 }}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Upload a <code className="kbd">.csv</code> or <code className="kbd">.xlsx</code> file. Columns: <code className="kbd">name</code>, <code className="kbd">phone</code>, optionally <code className="kbd">email</code> and <code className="kbd">groups</code> (comma-separated group names - new groups are created automatically). Duplicate phone numbers are skipped.
          </p>
          <input
            className="input"
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
          />

          {result && (
            <div className="col" style={{ gap: 8 }}>
              <div className="flex gap-2">
                <span className="pill pill-green">{result.created} added</span>
                <span className="pill pill-gray">{result.skipped} skipped</span>
                {result.errors.length > 0 && <span className="pill pill-red">{result.errors.length} errors</span>}
              </div>
              {result.errors.length > 0 && (
                <div className="col scroll-thin" style={{ gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => (
                    <span key={i} className="text-xs" style={{ color: 'var(--red)' }}>Row {e.row}: {e.reason}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={!file || importMutation.isPending}
              onClick={() => file && importMutation.mutate(file)}
            >
              {importMutation.isPending ? <DotLoader size={16} /> : null}
              {importMutation.isPending ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MembersPage;
