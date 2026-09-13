import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context.js';
import { AuthService } from './auth.service.js';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { authenticate } from '../../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  passwordRaw: z.string().min(1, 'Password is required'),
});

const updateMeSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    phone: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
  })
  .refine((data) => !data.newPassword || !!data.currentPassword, {
    message: 'Current password is required to set a new password',
    path: ['currentPassword'],
  });

export function authRoutes(ctx: AppContext): Router {
  const router = Router();
  const authService = new AuthService(ctx);

  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.login(parsed.data);
    res.send({ ok: true, data: result });
  });

  router.get('/me', authenticate, async (req, res) => {
    const profile = await authService.getProfile(req.user.userId);
    res.send({ ok: true, data: profile });
  });

  router.patch('/me', authenticate, async (req, res) => {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const user = await authService.updateProfile(req.user.userId, parsed.data);
    res.send({ ok: true, data: user });
  });

  return router;
}
