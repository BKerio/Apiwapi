import { AppContext } from '../../context.js';

// FCM's sendEachForMulticast caps at 500 tokens per call.
const BATCH_SIZE = 500;

/**
 * Sends a campaign's PENDING recipients out through Firebase, updating each
 * CampaignRecipient and the running Campaign counts as it goes, and pushing
 * a `campaign:progress` Socket.io event after every batch so the frontend
 * can show a live progress bar instead of polling. Used both for a
 * campaign's initial send and for "retry failed" (which just resets some
 * rows back to PENDING first).
 */
export class CampaignDispatchService {
  constructor(private app: AppContext) {}

  async dispatch(campaignId: string): Promise<void> {
    const campaign = await this.app.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return;

    const client = await this.app.pushGateways.getActiveClient();
    if (!client) {
      await this.app.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      this.app.io.emit('campaign:progress', {
        campaignId, status: 'FAILED', sentCount: campaign.sentCount, failedCount: campaign.failedCount, totalRecipients: campaign.totalRecipients,
      });
      return;
    }

    try {
      const pending = await this.app.prisma.campaignRecipient.findMany({
        where: { campaignId, status: 'PENDING' },
        select: { id: true, deviceTokenSnapshot: true },
      });

      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        const tokens = batch.map((r) => r.deviceTokenSnapshot);
        const results = await client.sendMulticast(tokens, campaign.title, campaign.message);
        const byToken = new Map(results.map((r) => [r.token, r]));

        await Promise.all(
          batch.map((recipient) => {
            const result = byToken.get(recipient.deviceTokenSnapshot);
            return this.app.prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: result?.success
                ? { status: 'SENT', sentAt: new Date(), error: null }
                : { status: 'FAILED', error: result?.error ?? 'The push gateway rejected this message' },
            });
          })
        );

        await this.emitProgress(campaignId, 'SENDING', campaign.totalRecipients);
      }
    } finally {
      await client.close();
    }

    await this.finish(campaignId);
  }

  private async emitProgress(campaignId: string, status: string, totalRecipients: number): Promise<void> {
    const [sentCount, failedCount] = await Promise.all([
      this.app.prisma.campaignRecipient.count({ where: { campaignId, status: 'SENT' } }),
      this.app.prisma.campaignRecipient.count({ where: { campaignId, status: 'FAILED' } }),
    ]);
    await this.app.prisma.campaign.update({ where: { id: campaignId }, data: { sentCount, failedCount } });
    this.app.io.emit('campaign:progress', { campaignId, status, sentCount, failedCount, totalRecipients });
  }

  private async finish(campaignId: string): Promise<void> {
    const finalSentCount = await this.app.prisma.campaignRecipient.count({ where: { campaignId, status: 'SENT' } });
    const finalStatus = finalSentCount > 0 ? 'COMPLETED' : 'FAILED';
    const updated = await this.app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: finalStatus, completedAt: new Date() },
    });
    this.app.io.emit('campaign:progress', {
      campaignId, status: updated.status, sentCount: updated.sentCount, failedCount: updated.failedCount, totalRecipients: updated.totalRecipients,
    });
  }
}
