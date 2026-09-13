import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context.js';
import { MemberService } from './member.service.js';
import { MemberImportService } from './csv-import.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { memberImportUpload } from '../../middleware/upload.js';

const operatorRoles = [Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN];

const createMemberSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(6, 'Enter a valid phone number'),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
});

const updateMemberSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(6).optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  isSubscribed: z.boolean().optional(),
  groupIds: z.array(z.string()).optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues[0].message);
  return result.data;
}

export function memberRoutes(ctx: AppContext): Router {
  const router = Router();
  const memberService = new MemberService(ctx);
  const memberImport = new MemberImportService(ctx);

  router.use(authenticate);
  router.use(requireRole(operatorRoles));

  router.get('/', async (req, res) => {
    const q = req.query as { search?: string; groupId?: string; page?: string; limit?: string };
    const result = await memberService.listMembers({
      search: q.search, groupId: q.groupId,
      page: parseInt(q.page ?? '1', 10),
      limit: parseInt(q.limit ?? '20', 10),
    });
    res.send({ ok: true, ...result });
  });

  router.get('/:id', async (req, res) => {
    const member = await memberService.getMemberById(req.params.id);
    res.send({ ok: true, data: member });
  });

  router.post('/', async (req, res) => {
    const data = parse(createMemberSchema, req.body);
    const member = await memberService.createMember(
      { ...data, email: data.email || undefined },
      req.user.userId
    );
    res.status(201).send({ ok: true, data: member });
  });

  router.patch('/:id', async (req, res) => {
    const data = parse(updateMemberSchema, req.body);
    const member = await memberService.updateMember(
      req.params.id,
      { ...data, email: data.email === '' ? undefined : data.email },
      req.user.userId
    );
    res.send({ ok: true, data: member });
  });

  router.delete('/:id', async (req, res) => {
    await memberService.deleteMember(req.params.id, req.user.userId);
    res.send({ ok: true });
  });

  router.post('/import', memberImportUpload, async (req, res) => {
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) throw new BadRequestError('No file was uploaded');
    const result = await memberImport.importFile(file.buffer, file.originalname, req.user.userId);
    res.send({ ok: true, data: result });
  });

  return router;
}
