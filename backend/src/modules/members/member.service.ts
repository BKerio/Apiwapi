import { AppContext } from '../../context.js';
import { Prisma } from '../../generated/prisma/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { normalizePhone } from './phone.js';

const MEMBER_SELECT = {
  id: true, name: true, phone: true, email: true, notes: true, isSubscribed: true,
  createdAt: true, updatedAt: true, createdById: true,
  groupMemberships: { select: { position: true, group: { select: { id: true, name: true } } } },
} as const;

// Flattens the groupMemberships select above into the `groups` shape the API
// (and frontend) actually consumes: one entry per group, carrying that
// member's position within it.
function toMemberDto<T extends { groupMemberships: { position: string | null; group: { id: string; name: string } }[] }>(
  member: T
) {
  const { groupMemberships, ...rest } = member;
  return { ...rest, groups: groupMemberships.map((gm) => ({ id: gm.group.id, name: gm.group.name, position: gm.position })) };
}

export class MemberService {
  constructor(private app: AppContext) {}

  async listMembers(filters: { search?: string; groupId?: string; page: number; limit: number }) {
    const { search, groupId, page, limit } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.MemberWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (groupId) where.groupMemberships = { some: { groupId } };

    const [data, total] = await Promise.all([
      this.app.prisma.member.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' }, select: MEMBER_SELECT,
      }),
      this.app.prisma.member.count({ where }),
    ]);

    return { data: data.map(toMemberDto), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getMemberById(id: string) {
    const member = await this.app.prisma.member.findUnique({ where: { id }, select: MEMBER_SELECT });
    if (!member) throw new NotFoundError('Member');
    return toMemberDto(member);
  }

  async createMember(
    data: { name: string; phone: string; email?: string; notes?: string; groupIds?: string[] },
    actorId: string
  ) {
    const phone = normalizePhone(data.phone);
    if (!phone) throw new BadRequestError('That does not look like a valid phone number');

    const existing = await this.app.prisma.member.findUnique({ where: { phone } });
    if (existing) throw new ConflictError('A member with this phone number already exists');

    const created = await this.app.prisma.member.create({
      data: {
        name: data.name, phone, email: data.email, notes: data.notes,
        createdById: actorId,
        groupMemberships: data.groupIds?.length ? { create: data.groupIds.map((groupId) => ({ groupId })) } : undefined,
      },
      select: MEMBER_SELECT,
    });
    const member = toMemberDto(created);

    await this.app.auditLog.record({
      actorId, action: 'CREATE', subjectType: 'MEMBER', subjectId: member.id,
      summary: `Onboarded member: ${member.name} (${member.phone})`,
      newValues: member,
    });

    return member;
  }

  async updateMember(
    id: string,
    data: { name?: string; phone?: string; email?: string; notes?: string; isSubscribed?: boolean; groupIds?: string[] },
    actorId: string
  ) {
    const member = await this.app.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundError('Member');

    let phone: string | undefined;
    if (data.phone !== undefined) {
      const normalized = normalizePhone(data.phone);
      if (!normalized) throw new BadRequestError('That does not look like a valid phone number');
      if (normalized !== member.phone) {
        const existing = await this.app.prisma.member.findUnique({ where: { phone: normalized } });
        if (existing) throw new ConflictError('A member with this phone number already exists');
      }
      phone = normalized;
    }

    // Group membership is now a join table carrying `position`, so it can't be
    // reassigned with a nested `set` the way an implicit m2m relation could -
    // drop memberships no longer wanted, upsert the rest (upsert rather than
    // create so a group already held keeps whatever position it has).
    if (data.groupIds !== undefined) {
      await this.app.prisma.$transaction([
        this.app.prisma.groupMembership.deleteMany({ where: { memberId: id, groupId: { notIn: data.groupIds } } }),
        ...data.groupIds.map((groupId) =>
          this.app.prisma.groupMembership.upsert({
            where: { memberId_groupId: { memberId: id, groupId } },
            update: {},
            create: { memberId: id, groupId },
          })
        ),
      ]);
    }

    const raw = await this.app.prisma.member.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isSubscribed !== undefined ? { isSubscribed: data.isSubscribed } : {}),
      },
      select: MEMBER_SELECT,
    });
    const updated = toMemberDto(raw);

    await this.app.auditLog.record({
      actorId, action: 'UPDATE', subjectType: 'MEMBER', subjectId: id,
      summary: `Updated member: ${updated.name} (${updated.phone})`,
      oldValues: member,
      newValues: updated,
    });

    return updated;
  }

  async deleteMember(id: string, actorId: string) {
    const member = await this.app.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundError('Member');

    await this.app.prisma.member.delete({ where: { id } });

    await this.app.auditLog.record({
      actorId, action: 'DELETE', subjectType: 'MEMBER', subjectId: id,
      summary: `Removed member: ${member.name} (${member.phone})`,
      oldValues: member,
    });
  }
}
