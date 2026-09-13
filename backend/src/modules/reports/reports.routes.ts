import { Router } from 'express';
import { AppContext } from '../../context.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { ReportsService } from './reports.service.js';

const operatorRoles = [Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN];

export function reportsRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new ReportsService(ctx);

  router.use(authenticate);
  router.use(requireRole(operatorRoles));

  /** GET /reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD - defaults to the last 30 days. */
  router.get('/overview', async (req, res) => {
    const q = req.query as { from?: string; to?: string };
    const data = await service.overview({ from: q.from, to: q.to });
    res.send({ ok: true, data });
  });

  return router;
}
