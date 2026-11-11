import 'dotenv/config';
import { env } from './config/env.js';
import { prisma } from './db/client.js';
import { app } from './app.js';

const server = app.listen(env.PORT, env.HOST, () => {
  console.info(`RAVERO backend listening at http://${env.HOST}:${env.PORT}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error('RAVERO backend failed to start.', {
    code: error.code ?? 'SERVER_START_FAILED',
  });
  process.exitCode = 1;
});

const shutdown = async (signal: string) => {
  console.info(`Received ${signal}; shutting down RAVERO backend.`);
  server.close(async (error) => {
    if (error) {
      console.error('HTTP server shutdown failed.');
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  });
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
