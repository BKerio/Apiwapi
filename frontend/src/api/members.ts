import api from '@/api/client';
import type { ImportResult, Member, PaginatedResponse } from '@/types/api';

export interface ListMembersParams {
  search?: string;
  groupId?: string;
  page?: number;
  limit?: number;
}

export async function listMembers(params: ListMembersParams): Promise<PaginatedResponse<Member>> {
  const res = await api.get('/members', { params });
  return res.data;
}

/** Pages through every member matching a filter - used by the export buttons, which need the full filtered set, not just the current page. */
export async function listAllMembers(params: Pick<ListMembersParams, 'search' | 'groupId'>): Promise<Member[]> {
  const limit = 200;
  const all: Member[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await listMembers({ ...params, page, limit });
    all.push(...res.data);
    if (all.length >= res.meta.total || res.data.length === 0) break;
    page += 1;
  }
  return all;
}

export async function getMember(id: string): Promise<Member> {
  const res = await api.get(`/members/${id}`);
  return res.data.data;
}

export interface MemberInput {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  groupIds?: string[];
}

export async function createMember(data: MemberInput): Promise<Member> {
  const res = await api.post('/members', data);
  return res.data.data;
}

export async function updateMember(id: string, data: Partial<MemberInput> & { isSubscribed?: boolean }): Promise<Member> {
  const res = await api.patch(`/members/${id}`, data);
  return res.data.data;
}

export async function deleteMember(id: string): Promise<void> {
  await api.delete(`/members/${id}`);
}

/** Bulk member onboarding from a .csv or .xlsx file - see backend modules/members/csv-import.ts. */
export async function importMembersFile(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post('/members/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data.data;
}
