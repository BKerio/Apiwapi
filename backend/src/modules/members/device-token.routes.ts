import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context.js';
import { normalizePhone } from './phone.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';

const registerSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  token: z.string().min(1, 'Device token is required'),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
});

/**
 * Public, unauthenticated: the mobile app calls this itself on first launch
 * (a Member has no login of their own) to pair its FCM token with the Member
 * record staff already created via the admin panel (Members page/CSV
 * import). Requires an exact phone match - deliberately does NOT create a
 * new Member on a miss, so onboarding stays staff-only.
 */
export function deviceTokenRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    const { phone, token, platform } = parsed.data;

    const normalized = normalizePhone(phone);
    if (!normalized) throw new BadRequestError('That does not look like a valid phone number');

    const member = await ctx.prisma.member.findUnique({ where: { phone: normalized } });
    if (!member) {
      throw new NotFoundError('No member is registered with that phone number yet - ask an admin to add you first');
    }

    // A token belongs to exactly one member at a time (e.g. it moved to a
    // different member's phone on reinstall) - upserting by the token's own
    // unique constraint handles both first registration and reassignment.
    await ctx.prisma.deviceToken.upsert({
      where: { token },
      update: { memberId: member.id, platform },
      create: { token, platform, memberId: member.id },
    });

    res.send({ ok: true });
  });

  return router;
}
