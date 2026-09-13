import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context.js';
import { CampaignService } from './campaign.service.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const operatorRoles = [Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN];

const audienceSchema = z.object({
  audience: z.enum(['ALL_MEMBERS', 'GROUP', 'SELECTED']),
  groupId: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
});

const previewSchema = audienceSchema.extend({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
});

const createCampaignSchema = audienceSchema.extend({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  title: z.string().min(1, 'Title cannot be empty').max(200, 'Title is too long'),
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues[0].message);
  return result.data;
}

export function campaignRoutes(ctx: AppContext): Router {
  const router = Router();
  const campaignService = new CampaignService(ctx);

  router.use(authenticate);
  router.use(requireRole(operatorRoles));

  router.post('/preview', async (req, res) => {
    const data = parse(previewSchema, req.body);
    const result = await campaignService.preview(data);
    res.send({ ok: true, data: result });
  });

  router.get('/', async (req, res) => {
    const q = req.query as { status?: string; page?: string; limit?: string };
    const result = await campaignService.listCampaigns({
      status: q.status,
      page: q.page ? parseInt(q.page, 10) : 1,
      limit: q.limit ? parseInt(q.limit, 10) : 20,
    });
    res.send({ ok: true, ...result });
  });

  router.get('/:id', async (req, res) => {
    const campaign = await campaignService.getCampaignById(req.params.id);
    res.send({ ok: true, data: campaign });
  });

  router.get('/:id/recipients', async (req, res) => {
    const q = req.query as { status?: string; page?: string; limit?: string };
    const result = await campaignService.listRecipients(req.params.id, {
      status: q.status,
      page: q.page ? parseInt(q.page, 10) : 1,
      limit: q.limit ? parseInt(q.limit, 10) : 20,
    });
    res.send({ ok: true, ...result });
  });

  router.post('/', async (req, res) => {
    const data = parse(createCampaignSchema, req.body);
    const campaign = await campaignService.createCampaign(data, req.user.userId);
    res.status(201).send({ ok: true, data: campaign });
  });

  router.post('/:id/retry-failed', async (req, res) => {
    const result = await campaignService.retryFailed(req.params.id, req.user.userId);
    res.send({ ok: true, data: result });
  });

  return router;
}
