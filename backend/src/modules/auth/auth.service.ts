import { AppContext } from '../../context.js';
import { signToken } from '../../lib/jwt.js';
import { hashPassword, comparePassword } from '../../shared/utils/hash.js';
import { UnauthorizedError, NotFoundError } from '../../shared/errors/AppError.js';

const PROFILE_SELECT = {
  id: true, name: true, email: true, phone: true, role: true,
  isActive: true, createdAt: true, updatedAt: true,
} as const;

export class AuthService {
  constructor(private app: AppContext) {}

  /**
   * Logs in an operator and returns a JWT token. There is no public
   * self-registration - operator accounts are onboarded by a SUPER_ADMIN/ADMIN
   * via AdminService.createUser.
   */
  async login(data: { email: string; passwordRaw: string }) {
    const user = await this.app.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.isActive) {
      // No FK-able userId when the email doesn't match a real account, so
      // there's nothing to audit-log against in that case.
      if (user) {
        await this.app.auditLog.record({
          actorId: user.id, action: 'LOGIN_FAILED', subjectType: 'USER', subjectId: user.id,
          summary: `Failed login attempt (account inactive): ${user.email}`,
        });
      }
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await comparePassword(data.passwordRaw, user.passwordHash);
    if (!isPasswordValid) {
      await this.app.auditLog.record({
        actorId: user.id, action: 'LOGIN_FAILED', subjectType: 'USER', subjectId: user.id,
        summary: `Failed login attempt (wrong password): ${user.email}`,
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
    });

    await this.app.auditLog.record({
      actorId: user.id, action: 'LOGIN', subjectType: 'USER', subjectId: user.id,
      summary: `Signed in: ${user.email}`,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  /** Returns the signed-in user's own profile. */
  async getProfile(userId: string) {
    const user = await this.app.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  /**
   * Lets the signed-in user update their own name/phone, and optionally
   * change their password (requires the current password). Deliberately
   * excludes email/role/isActive - those stay admin-only (see AdminService.updateUser).
   */
  async updateProfile(
    userId: string,
    data: { name?: string; phone?: string; currentPassword?: string; newPassword?: string }
  ) {
    const user = await this.app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    let passwordHash: string | undefined;
    if (data.newPassword) {
      const isCurrentValid = await comparePassword(data.currentPassword ?? '', user.passwordHash);
      if (!isCurrentValid) throw new UnauthorizedError('Current password is incorrect');
      passwordHash = await hashPassword(data.newPassword);
    }

    const updated = await this.app.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: PROFILE_SELECT,
    });

    await this.app.auditLog.record({
      actorId: userId,
      action: 'UPDATE',
      subjectType: 'USER',
      subjectId: userId,
      summary: `Updated own profile${passwordHash ? ' (password changed)' : ''}: ${updated.email}`,
      oldValues: user,
      newValues: updated,
    });

    return updated;
  }
}
