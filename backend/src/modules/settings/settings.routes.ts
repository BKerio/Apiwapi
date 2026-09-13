import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { PushGatewayService } from './push-gateway.service.js';

const pushGatewaySchema = z.object({ serviceAccountJson: z.string().min(1, 'Paste the Firebase service-account JSON') });

/**
 * SUPER_ADMIN-only: view/edit the Firebase push gateway credentials,
 * activate/deactivate sending, and test a saved config before flipping the
 * switch. Live API credentials - kept behind the top role tier, unlike the
 * rest of /admin (which ADMIN can also reach).
 */
export function settingsRoutes(ctx: AppContext): Router {
  const router = Router();
  const pushService = new PushGatewayService(ctx);

  router.use(authenticate);
  router.use(requireRole([Role.SUPER_ADMIN]));

  router.get('/push-gateway', async (_req, res) => {
    res.send({ ok: true, data: await pushService.get() });
  });

  router.put('/push-gateway', async (req, res) => {
    const parsed = pushGatewaySchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    const gateway = await pushService.upsert(parsed.data.serviceAccountJson, req.user.userId);
    res.send({ ok: true, data: gateway });
  });

  router.post('/push-gateway/activate', async (req, res) => {
    res.send({ ok: true, data: await pushService.setActive(true, req.user.userId) });
  });

  router.post('/push-gateway/deactivate', async (req, res) => {
    res.send({ ok: true, data: await pushService.setActive(false, req.user.userId) });
  });

  router.post('/push-gateway/test', async (_req, res) => {
    res.send({ ok: true, data: await pushService.testConnection() });
  });

  return router;
}
