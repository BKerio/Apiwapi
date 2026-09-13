import { AppContext } from '../../context.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ReportsOverview {
  range: { from: string; to: string };
  totals: {
    members: number;
    subscribedMembers: number;
    groups: number;
    campaigns: number;
    messagesSent: number;
    messagesFailed: number;
  };
  campaignsOverTime: { date: string; sent: number; failed: number; campaigns: number }[];
  audienceBreakdown: { audience: string; count: number }[];
  deliveryBreakdown: { status: string; count: number }[];
  membersByGroup: { group: string; count: number }[];
  recentCampaigns: {
    id: string; name: string; status: string; audience: string;
    totalRecipients: number; sentCount: number; failedCount: number; createdAt: string;
  }[];
}

/**
 * Aggregates data already collected by the members/groups/campaigns modules
 * into a single dashboard-ready shape for the Reports page - charts, pies,
 * and the PDF/Excel exports all read from this one payload rather than
 * re-deriving totals client-side from paginated list endpoints.
 */
export class ReportsService {
  constructor(private app: AppContext) {}

  async overview(input: { from?: string; to?: string }): Promise<ReportsOverview> {
    const to = input.to ? new Date(`${input.to}T23:59:59.999`) : new Date();
    const from = input.from ? new Date(`${input.from}T00:00:00`) : new Date(to.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new BadRequestError('Invalid date range');
    if (from > to) throw new BadRequestError('"from" must be before "to"');
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      throw new BadRequestError(`Date range too large - please select ${MAX_RANGE_DAYS} days or fewer`);
    }

    const [members, subscribedMembers, groupCounts, campaignsInRange, recentCampaigns, allTimeTotals] = await Promise.all([
      this.app.prisma.member.count(),
      this.app.prisma.member.count({ where: { isSubscribed: true } }),
      this.app.prisma.group.findMany({ select: { name: true, _count: { select: { memberships: true } } }, orderBy: { name: 'asc' } }),
      this.app.prisma.campaign.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, sentCount: true, failedCount: true, audience: true },
      }),
      this.app.prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, status: true, audience: true, totalRecipients: true, sentCount: true, failedCount: true, createdAt: true },
      }),
      this.app.prisma.campaign.aggregate({ _sum: { sentCount: true, failedCount: true }, _count: true }),
    ]);

    // Bucket the range's campaigns by calendar day, and tally audience mix while we're at it.
    const byDate = new Map<string, { sent: number; failed: number; campaigns: number }>();
    const audienceCounts = new Map<string, number>();
    let sentInRange = 0;
    let failedInRange = 0;
    for (const c of campaignsInRange) {
      const key = toDateOnly(c.createdAt);
      const bucket = byDate.get(key) ?? { sent: 0, failed: 0, campaigns: 0 };
      bucket.sent += c.sentCount;
      bucket.failed += c.failedCount;
      bucket.campaigns += 1;
      byDate.set(key, bucket);
      audienceCounts.set(c.audience, (audienceCounts.get(c.audience) ?? 0) + 1);
      sentInRange += c.sentCount;
      failedInRange += c.failedCount;
    }

    // Fill every day in the range (even zero days) so the line chart doesn't skip gaps.
    const campaignsOverTime: ReportsOverview['campaignsOverTime'] = [];
    for (let t = new Date(toDateOnly(from)).getTime(); t <= to.getTime(); t += DAY_MS) {
      const key = toDateOnly(new Date(t));
      const bucket = byDate.get(key) ?? { sent: 0, failed: 0, campaigns: 0 };
      campaignsOverTime.push({ date: key, ...bucket });
    }

    return {
      range: { from: toDateOnly(from), to: toDateOnly(to) },
      totals: {
        members,
        subscribedMembers,
        groups: groupCounts.length,
        campaigns: allTimeTotals._count,
        messagesSent: allTimeTotals._sum.sentCount ?? 0,
        messagesFailed: allTimeTotals._sum.failedCount ?? 0,
      },
      campaignsOverTime,
      audienceBreakdown: [...audienceCounts.entries()].map(([audience, count]) => ({ audience, count })),
      deliveryBreakdown: [
        { status: 'SENT', count: sentInRange },
        { status: 'FAILED', count: failedInRange },
      ],
      membersByGroup: groupCounts.map((g) => ({ group: g.name, count: g._count.memberships })),
      recentCampaigns: recentCampaigns.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    };
  }
}
