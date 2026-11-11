import express, { type Express } from 'express';
import { adminRouter } from './routes/admin/index.js';
import { customerRouter } from './routes/customer/index.js';
import { driverRouter } from './routes/driver/index.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { env } from './config/env.js';

export const app: Express = express();

const developmentOrigins = new Set([
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8082',
  'http://localhost:8084',
  'http://127.0.0.1:8084',
  'http://localhost:19006',
  'http://127.0.0.1:19006',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.disable('x-powered-by');
app.use((request, response, next) => {
  const origin = request.header('origin');
  if (env.NODE_ENV === 'development' && origin && !developmentOrigins.has(origin)) {
    response.status(403).json({
      success: false,
      error: {
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'This origin is not allowed to access the development API.',
      },
    });
    return;
  }
  if (env.NODE_ENV === 'development' && origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/health', healthRouter);
app.use('/api/v1/auth/customer', authRouter);
app.use('/api/v1/customer', customerRouter);
app.use('/api/v1/driver', driverRouter);
app.use('/api/v1/admin', adminRouter);
app.use(notFound);
app.use(errorHandler);
