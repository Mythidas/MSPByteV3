import { Logger } from '@workspace/shared/lib/utils/logger';
import Redis from 'ioredis';

let client: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!client) {
    const redisHost = process.env.REDIS_HOST;

    if (!redisHost) {
      throw new Error('REDIS_HOST environment variable is required');
    }

    client = new Redis(redisHost, {
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        Logger.warn({
          module: 'workflows',
          context: 'redis',
          message: `Retry attempt ${times}`,
        });
        return delay;
      },
    });

    client.on('connect', () => {
      Logger.info({
        module: 'workflows',
        context: 'redis',
        message: 'connected',
      });
    });

    client.on('error', (err: Error) => {
      Logger.error({
        module: 'workflows',
        context: 'redis',
        message: `error: ${err.message}`,
      });
    });

    client.on('close', () => {
      Logger.warn({
        module: 'workflows',
        context: 'redis',
        message: 'connection closed',
      });
    });
  }

  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    Logger.info({
      module: 'workflows',
      context: 'redis',
      message: 'disconnected',
    });
  }
}
