import { AppContext } from '../../context.js';
import { Prisma, CampaignAudience } from '../../generated/prisma/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';
import { CampaignDispatchService } from './dispatch.service.js';

export interface AudienceInput {
  audience: CampaignAudience;
  groupId?: string;
  memberIds?: string[];
}

const CAMPAIGN_SELECT = {
  id: true, name: true, title: true, message: true, audience: true, groupId: true, groupNameSnapshot: true,
  status: true, totalRecipients: true, sentCount: true, failedCount: true,
  createdAt: true, updatedAt: true, completedAt: true,
  createdById: true, createdBy: { select: { id: true, name: true } },
} as const;

export class CampaignService {
  private dispatch: CampaignDispatchService;

  constructor(private app: AppContext) {
    this.dispatch = new CampaignDispatchService(app);
  }

  /** Resolves an audience selector into the actual list of members that would receive the send. */
  async resolveRecipients(input: AudienceInput) {
    const select = { id: true, name: true, phone: true } as const;

    if (input.audience === 'ALL_MEMBERS') {
      return this.app.prisma.member.findMany({ where: { isSubscribed: true }, select });
    }
    if (input.audience === 'GROUP') {
      if (!input.groupId) throw new BadRequestError('A group is required for a GROUP audience');
      return this.app.prisma.member.findMany({
        where: { isSubscribed: true, groupMemberships: { some: { groupId: input.groupId } } }, select,
      });
    }
    if (input.audience === 'SELECTED') {
      if (!input.memberIds?.length) throw new BadRequestError('Select at least one member');
      return this.app.prisma.member.findMany({
        where: { isSubscribed: true, id: { in: input.memberIds } }, select,
      });
    }
    throw new BadRequestError('Invalid audience');
  }

  async preview(input: AudienceInput & { message: string }) {
    const recipients = await this.resolveRecipients(input);
    const memberIds = recipients.map((m) => m.id);

    // "Recipients" means members actually reachable (have ≥1 registered
    // device) - deviceCount is the raw fan-out (one send per device), which
    // can run ahead of that for a multi-device member.
    const [reachableMembers, deviceCount] = memberIds.length
      ? await Promise.all([
          this.app.prisma.member.count({ where: { id: { in: memberIds }, deviceTokens: { some: {} } } }),
          this.app.prisma.deviceToken.count({ where: { memberId: { in: memberIds } } }),
        ])
      : [0, 0];

    return { recipientCount: reachableMembers, deviceCount, sample: input.message };
  }

  async createCampaign(
    input: AudienceInput & { name: string; title: string; message: string },
    actorId: string
  ) {
    if (!input.title.trim()) throw new BadRequestError('Title cannot be empty');
    if (!input.message.trim()) throw new BadRequestError('Message cannot be empty');
    if (!(await this.app.pushGateways.isEnabled())) {
      throw new BadRequestError('Push notifications are not configured. Ask a super admin to set up Firebase under Settings.');
    }

    const members = await this.resolveRecipients(input);
    if (members.length === 0) throw new BadRequestError('No recipients match this audience');

    const memberIds = members.map((m) => m.id);
    const tokens = await this.app.prisma.deviceToken.findMany({ where: { memberId: { in: memberIds } } });
    if (tokens.length === 0) throw new BadRequestError('None of the matched members have the app installed yet');

    const nameById = new Map(members.map((m) => [m.id, m.name]));
    const phoneById = new Map(members.map((m) => [m.id, m.phone]));

    let groupNameSnapshot: string | undefined;
    if (input.audience === 'GROUP' && input.groupId) {
      const group = await this.app.prisma.group.findUnique({ where: { id: input.groupId }, select: { name: true } });
      if (!group) throw new NotFoundError('Group');
      groupNameSnapshot = group.name;
    }

    const campaign = await this.app.prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          name: input.name,
          title: input.title,
          message: input.message,
          audience: input.audience,
          groupId: input.audience === 'GROUP' ? input.groupId : undefined,
          groupNameSnapshot,
          totalRecipients: tokens.length,
          createdById: actorId,
        },
        select: CAMPAIGN_SELECT,
      });

      await tx.campaignRecipient.createMany({
        data: tokens.map((t) => ({
          campaignId: created.id,
          memberId: t.memberId,
          nameSnapshot: nameById.get(t.memberId) ?? '',
          phoneSnapshot: phoneById.get(t.memberId) ?? '',
          deviceTokenId: t.id,
          deviceTokenSnapshot: t.token,
        })),
      });

      return created;
    });

    await this.app.auditLog.record({
      actorId, action: 'CREATE', subjectType: 'CAMPAIGN', subjectId: campaign.id,
      summary: `Sent campaign "${campaign.name}" to ${tokens.length} device(s)`,
      newValues: campaign,
    });

    // Fire-and-forget: don't make the caller wait for every push to go out.
    void this.dispatch.dispatch(campaign.id).catch((err) => {
      this.app.log.error({ err, campaignId: campaign.id }, 'Campaign dispatch failed');
    });

    return campaign;
  }

  async listCampaigns(filters: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.CampaignWhereInput = {};
    if (status) where.status = status as Prisma.CampaignWhereInput['status'];

    const [data, total] = await Promise.all([
      this.app.prisma.campaign.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, select: CAMPAIGN_SELECT }),
      this.app.prisma.campaign.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getCampaignById(id: string) {
    const campaign = await this.app.prisma.campaign.findUnique({ where: { id }, select: CAMPAIGN_SELECT });
    if (!campaign) throw new NotFoundError('Campaign');
    return campaign;
  }

  async listRecipients(campaignId: string, filters: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.CampaignRecipientWhereInput = { campaignId };
    if (status) where.status = status as Prisma.CampaignRecipientWhereInput['status'];

    const [data, total] = await Promise.all([
      this.app.prisma.campaignRecipient.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, error: true, sentAt: true, phoneSnapshot: true, nameSnapshot: true, memberId: true },
      }),
      this.app.prisma.campaignRecipient.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async retryFailed(campaignId: string, actorId: string) {
    const campaign = await this.app.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundError('Campaign');

    const { count } = await this.app.prisma.campaignRecipient.updateMany({
      where: { campaignId, status: 'FAILED' },
      data: { status: 'PENDING', error: null },
    });
    if (count === 0) throw new BadRequestError('There are no failed recipients to retry');

    await this.app.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } });

    await this.app.auditLog.record({
      actorId, action: 'UPDATE', subjectType: 'CAMPAIGN', subjectId: campaignId,
      summary: `Retried ${count} failed recipient(s) for campaign "${campaign.name}"`,
    });

    void this.dispatch.dispatch(campaignId).catch((err) => {
      this.app.log.error({ err, campaignId }, 'Campaign retry dispatch failed');
    });

    return { retrying: count };
  }
}
