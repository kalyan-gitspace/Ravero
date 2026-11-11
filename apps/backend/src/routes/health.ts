import { type Router, Router as createRouter } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';

export const healthRouter: Router = createRouter();

healthRouter.get('/', (_request, response) => {
  response.json({
    success: true,
    data: {
      status: 'ok',
      service: 'ravero-backend',
    },
  });
});

healthRouter.get('/db', async (_request, response) => {
  if (!env.isDatabaseConfigured) {
    response.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_NOT_CONFIGURED',
        message: 'Local database connection is not configured.',
      },
    });
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({
      success: true,
      data: {
        status: 'ok',
        database: 'reachable',
      },
    });
  } catch {
    console.error('Database health check failed.');
    response.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The configured local database is unavailable.',
      },
    });
  }
});
