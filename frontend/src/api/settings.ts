import api from '@/api/client';
import type { PushGatewaySummary, PushTestResult } from '@/types/api';

export async function getPushGateway(): Promise<PushGatewaySummary> {
  const res = await api.get('/settings/push-gateway');
  return res.data.data;
}

export async function updatePushGateway(serviceAccountJson: string): Promise<PushGatewaySummary> {
  const res = await api.put('/settings/push-gateway', { serviceAccountJson });
  return res.data.data;
}

export async function activatePushGateway(): Promise<PushGatewaySummary> {
  const res = await api.post('/settings/push-gateway/activate');
  return res.data.data;
}

export async function deactivatePushGateway(): Promise<PushGatewaySummary> {
  const res = await api.post('/settings/push-gateway/deactivate');
  return res.data.data;
}

export async function testPushGateway(): Promise<PushTestResult> {
  const res = await api.post('/settings/push-gateway/test');
  return res.data.data;
}
