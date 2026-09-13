import { AppContext } from '../../context.js';
import { Prisma } from '../../generated/prisma/index.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { hashPassword } from '../../shared/utils/hash.js';

const USER_SELECT = {
  id: true, name: true, email: true, phone: true, role: true,
  isActive: true, createdAt: true,
} as const;

export class AdminService {
  constructor(private app: AppContext) {}

  async listUsers(filters: { role?: Role; page: number; limit: number }) {
    const { role, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {};
    if (role) where.role = role;

    const [users, total] = await Promise.all([
      this.app.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { ...USER_SELECT, _count: { select: { membersOnboarded: true, campaignsCreated: true } } },
      }),
      this.app.prisma.user.count({ where }),
    ]);

    return { data: users, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getUserById(id: string) {
    const user = await this.app.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async createUser(
    data: { email: string; passwordRaw: string; name: string; role: Role; phone?: string },
    actorId: string
  ) {
    const existing = await this.app.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictError('A user with this email already exists');

    const passwordHash = await hashPassword(data.passwordRaw);
    const user = await this.app.prisma.user.create({
      data: { email: data.email, passwordHash, name: data.name, role: data.role, phone: data.phone },
      select: USER_SELECT,
    });

    await this.app.auditLog.record({
      actorId, action: 'CREATE', subjectType: 'USER', subjectId: user.id,
      summary: `Created ${data.role.toLowerCase()} account: ${user.email}`,
      newValues: user,
    });

    return user;
  }

  async updateUser(
    id: string,
    data: { name?: string; email?: string; password?: string; phone?: string; role?: Role; isActive?: boolean },
    actorId: string
  ) {
    const user = await this.app.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User');
    if (data.email && data.email !== user.email) {
      const existing = await this.app.prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw new ConflictError('A user with this email already exists');
    }

    const { password, ...rest } = data;
    const updated = await this.app.prisma.user.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
      select: USER_SELECT,
    });

    await this.app.auditLog.record({
      actorId, action: 'UPDATE', subjectType: 'USER', subjectId: id,
      summary: `Updated user${password ? ' (password reset)' : ''}: ${updated.email}`,
      oldValues: user,
      newValues: updated,
    });

    return updated;
  }

  async deleteUser(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestError('You cannot delete your own account');
    }
    const user = await this.app.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User');

    try {
      await this.app.prisma.user.delete({ where: { id } });
    } catch (err) {
      // P2003 = foreign key constraint failed: the user has onboarded members,
      // sent campaigns, or has audit history, and permanent deletion would
      // orphan that record, so we refuse it - deactivate the account instead.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictError(
          'This user has onboarded members, sent campaigns, or has audit history and cannot be permanently deleted. Deactivate the account instead.'
        );
      }
      throw err;
    }

    await this.app.auditLog.record({
      actorId: requesterId, action: 'DELETE', subjectType: 'USER', subjectId: id,
      summary: `Deleted user: ${user.email}`,
      oldValues: user,
    });
  }
}
