import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { AppContext } from './context.js';
import { env } from './lib/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { memberRoutes } from './modules/members/member.routes.js';
import { deviceTokenRoutes } from './modules/members/device-token.routes.js';
import { groupRoutes } from './modules/groups/group.routes.js';
import { campaignRoutes } from './modules/campaigns/campaign.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

/**
 * Builds and returns the configured Express application instance.
 * Separating app creation from server startup allows for clean testing.
 */
export function buildApp(ctx: AppContext): Express {
  const app = express();

  // Structured request logging (Pino)
  app.use(pinoHttp({ logger: ctx.log }));

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production',
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(express.json({ limit: '2mb' }));

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.send({ ok: true, service: 'Push Notification Platform API', version: '1.0.0' });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/auth', authRoutes(ctx));
  app.use('/admin', adminRoutes(ctx));
  app.use('/members', memberRoutes(ctx));
  // Public/unauthenticated: called by the soko app itself, not the admin panel.
  app.use('/public/device-tokens', deviceTokenRoutes(ctx));
  app.use('/groups', groupRoutes(ctx));
  app.use('/campaigns', campaignRoutes(ctx));
  app.use('/settings', settingsRoutes(ctx));
  app.use('/reports', reportsRoutes(ctx));

  app.use(notFoundHandler);
  // Error handler MUST be registered last, and MUST take 4 args for Express
  // to recognize it as an error handler.
  app.use(errorHandler);

  return app;
}
