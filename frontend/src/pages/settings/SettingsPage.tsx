import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZap, CheckCircle2, CircleSlash, FlaskConical, Save } from 'lucide-react';
import DotLoader from '@/components/shared/DotLoader';
import { useNotificationStore } from '@/stores/notificationStore';
import { activatePushGateway, deactivatePushGateway, getPushGateway, testPushGateway, updatePushGateway } from '@/api/settings';
import type { PushGatewaySummary } from '@/types/api';

function SettingsPage() {
  const { data: pushGateway, isLoading } = useQuery({ queryKey: ['push-gateway'], queryFn: getPushGateway });

  return (
    <div className="col" style={{ gap: 20, maxWidth: 720 }}>
      <div>
        <p className="eyebrow">Administration</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Settings</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Configure the Firebase credentials campaigns send push notifications through.</p>
      </div>

      {isLoading ? (
        <div className="card card-pad"><div className="skel" style={{ height: 160 }} /></div>
      ) : pushGateway ? (
        <PushGatewayCard gateway={pushGateway} />
      ) : null}
    </div>
  );
}

/** Firebase's service-account JSON is one blob, so this card is a single textarea + activate/deactivate/test. */
function PushGatewayCard({ gateway }: { gateway: PushGatewaySummary }) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['push-gateway'] });

  const saveMutation = useMutation({
    mutationFn: () => updatePushGateway(serviceAccountJson),
    onSuccess: () => {
      invalidate();
      setServiceAccountJson('');
      setTestResult(null);
      addNotification({ type: 'success', title: 'Settings saved', message: 'Firebase push credentials were updated.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Save failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const testMutation = useMutation({
    mutationFn: () => testPushGateway(),
    onSuccess: (result) => setTestResult(result),
    onError: (err: any) => setTestResult({ ok: false, message: err?.response?.data?.message || 'Test failed. Please try again.' }),
  });

  const activateMutation = useMutation({
    mutationFn: () => activatePushGateway(),
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Push activated', message: 'Campaigns will now send through Firebase.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not activate', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivatePushGateway(),
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Push deactivated', message: 'Firebase will no longer be used for sending push campaigns.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not deactivate', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const busy = saveMutation.isPending || testMutation.isPending || activateMutation.isPending || deactivateMutation.isPending;

  return (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <span className="card-title">Push notifications (Firebase)</span>
          {gateway.isActive && <span className="pill pill-green"><CheckCircle2 size={12} /> Active</span>}
          {!gateway.isActive && gateway.configured && <span className="pill pill-gray">Configured</span>}
        </div>
        {gateway.updatedAt && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Updated {new Date(gateway.updatedAt).toLocaleString()}</span>
        )}
      </div>

      <form
        className="card-pad col"
        style={{ gap: 14 }}
        onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
      >
        <div className="field">
          <label className="label" htmlFor="push-service-account">Firebase service-account JSON</label>
          <textarea
            id="push-service-account"
            className="eoc-textarea"
            style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
            value={serviceAccountJson}
            onChange={(e) => setServiceAccountJson(e.target.value)}
            placeholder={gateway.configured ? `Currently set (project "${gateway.projectId ?? 'unknown'}") - paste a new key file to replace it` : 'Paste the full JSON from Firebase Console → Project settings → Service accounts → Generate new private key'}
            autoComplete="off"
          />
          {gateway.configured && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Current: project "{gateway.projectId ?? 'unknown'}" - leave blank to keep it.</span>
          )}
        </div>

        {testResult && (
          <div
            className="text-sm"
            style={{
              padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              background: testResult.ok ? 'var(--green-light)' : 'var(--red-soft)',
              color: testResult.ok ? 'var(--green)' : 'var(--red)',
              fontWeight: 600,
            }}
          >
            {testResult.message}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginTop: 4 }}>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !serviceAccountJson.trim()}>
              {saveMutation.isPending ? <DotLoader size={14} /> : <Save size={14} />} Save
            </button>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={busy || !gateway.configured}
              onClick={() => testMutation.mutate()}
              title={!gateway.configured ? 'Save credentials first' : undefined}
            >
              {testMutation.isPending ? <DotLoader size={14} /> : <FlaskConical size={14} />} Test connection
            </button>
          </div>
          {gateway.isActive ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => deactivateMutation.mutate()}>
              <CircleSlash size={14} /> Deactivate
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={busy || !gateway.configured}
              title={!gateway.configured ? 'Save credentials first' : undefined}
              onClick={() => activateMutation.mutate()}
            >
              {activateMutation.isPending ? <DotLoader size={14} /> : <PlugZap size={14} />} Set as active
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default SettingsPage;
