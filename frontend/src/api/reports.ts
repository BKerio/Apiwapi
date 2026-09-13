import api from '@/api/client';
import type { ReportsOverview } from '@/types/api';

export interface ReportsRange {
  from?: string;
  to?: string;
}

export async function getReportsOverview(range: ReportsRange): Promise<ReportsOverview> {
  const res = await api.get('/reports/overview', { params: range });
  return res.data.data;
}
