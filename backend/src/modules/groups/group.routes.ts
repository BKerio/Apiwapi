import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context.js';
import { GroupService } from './group.service.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role, GroupPosition } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const operatorRoles = [Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN];

const createGroupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
});

const setPositionSchema = z.object({
  position: z.nativeEnum(GroupPosition).nullable(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues[0].message);
  return result.data;
}

export function groupRoutes(ctx: AppContext): Router {
  const router = Router();
  const groupService = new GroupService(ctx);

  router.use(authenticate);
  router.use(requireRole(operatorRoles));

  router.get('/', async (_req, res) => {
    const groups = await groupService.listGroups();
    res.send({ ok: true, data: groups });
  });

  router.get('/:id', async (req, res) => {
    const q = req.query as { page?: string; limit?: string };
    const group = await groupService.getGroupById(
      req.params.id,
      q.page ? parseInt(q.page, 10) : 1,
      q.limit ? parseInt(q.limit, 10) : 20
    );
    res.send({ ok: true, data: group });
  });

  router.post('/', async (req, res) => {
    const data = parse(createGroupSchema, req.body);
    const group = await groupService.createGroup(data, req.user.userId);
    res.status(201).send({ ok: true, data: group });
  });

  router.patch('/:id', async (req, res) => {
    const data = parse(updateGroupSchema, req.body);
    const group = await groupService.updateGroup(req.params.id, data, req.user.userId);
    res.send({ ok: true, data: group });
  });

  router.delete('/:id', async (req, res) => {
    await groupService.deleteGroup(req.params.id, req.user.userId);
    res.send({ ok: true });
  });

  router.patch('/:groupId/members/:memberId/position', async (req, res) => {
    const data = parse(setPositionSchema, req.body);
    const member = await groupService.setMemberPosition(req.params.groupId, req.params.memberId, data.position, req.user.userId);
    res.send({ ok: true, data: member });
  });

  return router;
}
