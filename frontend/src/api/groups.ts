import api from '@/api/client';
import type { Group, GroupDetail, GroupPosition, Member } from '@/types/api';

export async function listGroups(): Promise<Group[]> {
  const res = await api.get('/groups');
  return res.data.data;
}

export async function getGroup(id: string, page = 1, limit = 20): Promise<GroupDetail> {
  const res = await api.get(`/groups/${id}`, { params: { page, limit } });
  return res.data.data;
}

export async function createGroup(data: { name: string; description?: string }): Promise<Group> {
  const res = await api.post('/groups', data);
  return res.data.data;
}

export async function updateGroup(id: string, data: { name?: string; description?: string }): Promise<Group> {
  const res = await api.patch(`/groups/${id}`, data);
  return res.data.data;
}

export async function deleteGroup(id: string): Promise<void> {
  await api.delete(`/groups/${id}`);
}

/** Sets (or clears, with position: null) a member's leadership position within one group. */
export async function setMemberPosition(
  groupId: string,
  memberId: string,
  position: GroupPosition | null
): Promise<Pick<Member, 'id' | 'name' | 'phone' | 'email' | 'isSubscribed'> & { position: GroupPosition | null }> {
  const res = await api.patch(`/groups/${groupId}/members/${memberId}/position`, { position });
  return res.data.data;
}
