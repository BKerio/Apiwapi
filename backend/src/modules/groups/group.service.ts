import { AppContext } from '../../context.js';
import { GroupPosition } from '../../shared/types/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';

// Keeps the API's long-standing `_count: { members }` shape even though the
// underlying relation is now named `memberships` (it's a join table since it
// carries each member's position).
function toGroupDto<T extends { _count: { memberships: number } }>(group: T) {
  const { _count, ...rest } = group;
  return { ...rest, _count: { members: _count.memberships } };
}

export class GroupService {
  constructor(private app: AppContext) {}

  async listGroups() {
    const groups = await this.app.prisma.group.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, createdAt: true, updatedAt: true, _count: { select: { memberships: true } } },
    });
    return groups.map(toGroupDto);
  }

  async getGroupById(id: string, membersPage: number, membersLimit: number) {
    const group = await this.app.prisma.group.findUnique({
      where: { id },
      select: { id: true, name: true, description: true, createdAt: true, updatedAt: true, _count: { select: { memberships: true } } },
    });
    if (!group) throw new NotFoundError('Group');

    const skip = (membersPage - 1) * membersLimit;
    const [memberships, total] = await Promise.all([
      this.app.prisma.groupMembership.findMany({
        where: { groupId: id },
        skip, take: membersLimit, orderBy: { createdAt: 'desc' },
        select: { position: true, member: { select: { id: true, name: true, phone: true, email: true, isSubscribed: true } } },
      }),
      this.app.prisma.groupMembership.count({ where: { groupId: id } }),
    ]);
    const members = memberships.map((m) => ({ ...m.member, position: m.position }));

    return {
      ...toGroupDto(group),
      members: { data: members, meta: { total, page: membersPage, limit: membersLimit, totalPages: Math.ceil(total / membersLimit) } },
    };
  }

  /** Sets (or clears, with position: null) a member's leadership position within one group. */
  async setMemberPosition(groupId: string, memberId: string, position: GroupPosition | null, actorId: string) {
    const membership = await this.app.prisma.groupMembership.findUnique({
      where: { memberId_groupId: { memberId, groupId } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundError('Group membership');

    const updated = await this.app.prisma.groupMembership.update({
      where: { id: membership.id },
      data: { position },
      select: {
        position: true,
        member: { select: { id: true, name: true, phone: true, email: true, isSubscribed: true } },
        group: { select: { id: true, name: true } },
      },
    });

    await this.app.auditLog.record({
      actorId, action: 'UPDATE', subjectType: 'GROUP', subjectId: groupId,
      summary: `Set ${updated.member.name}'s position in ${updated.group.name} to ${position ?? 'none'}`,
    });

    return { ...updated.member, position: updated.position };
  }

  async createGroup(data: { name: string; description?: string }, actorId: string) {
    const existing = await this.app.prisma.group.findUnique({ where: { name: data.name } });
    if (existing) throw new ConflictError('A group with this name already exists');

    const group = await this.app.prisma.group.create({ data });

    await this.app.auditLog.record({
      actorId, action: 'CREATE', subjectType: 'GROUP', subjectId: group.id,
      summary: `Created group: ${group.name}`,
      newValues: group,
    });

    return group;
  }

  async updateGroup(id: string, data: { name?: string; description?: string }, actorId: string) {
    const group = await this.app.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundError('Group');

    if (data.name && data.name !== group.name) {
      const existing = await this.app.prisma.group.findUnique({ where: { name: data.name } });
      if (existing) throw new ConflictError('A group with this name already exists');
    }

    const updated = await this.app.prisma.group.update({ where: { id }, data });

    await this.app.auditLog.record({
      actorId, action: 'UPDATE', subjectType: 'GROUP', subjectId: id,
      summary: `Updated group: ${updated.name}`,
      oldValues: group,
      newValues: updated,
    });

    return updated;
  }

  async deleteGroup(id: string, actorId: string) {
    const group = await this.app.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundError('Group');

    await this.app.prisma.group.delete({ where: { id } });

    await this.app.auditLog.record({
      actorId, action: 'DELETE', subjectType: 'GROUP', subjectId: id,
      summary: `Deleted group: ${group.name}`,
      oldValues: group,
    });
  }
}
