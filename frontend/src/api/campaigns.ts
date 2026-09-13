import api from '@/api/client';
import type { Campaign, CampaignAudience, CampaignPreview, CampaignRecipient, PaginatedResponse } from '@/types/api';

export interface AudienceInput {
  audience: CampaignAudience;
  groupId?: string;
  memberIds?: string[];
}

export async function previewCampaign(data: AudienceInput & { message: string }): Promise<CampaignPreview> {
  const res = await api.post('/campaigns/preview', data);
  return res.data.data;
}

export async function createCampaign(
  data: AudienceInput & { name: string; title: string; message: string }
): Promise<Campaign> {
  const res = await api.post('/campaigns', data);
  return res.data.data;
}

export async function listCampaigns(params: { status?: string; page?: number; limit?: number }): Promise<PaginatedResponse<Campaign>> {
  const res = await api.get('/campaigns', { params });
  return res.data;
}

export async function getCampaign(id: string): Promise<Campaign> {
  const res = await api.get(`/campaigns/${id}`);
  return res.data.data;
}

export async function listCampaignRecipients(
  id: string,
  params: { status?: string; page?: number; limit?: number }
): Promise<PaginatedResponse<CampaignRecipient>> {
  const res = await api.get(`/campaigns/${id}/recipients`, { params });
  return res.data;
}

export async function retryFailedRecipients(id: string): Promise<{ retrying: number }> {
  const res = await api.post(`/campaigns/${id}/retry-failed`);
  return res.data.data;
}
