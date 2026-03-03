import { Logger } from '@workspace/shared/lib/utils/logger';
import Redis from 'ioredis';

let client: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!client) {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT;
    const redisPassword = process.env.REDIS_PASSWORD;

    if (!redisHost || !redisPort) {
      throw new Error('REDIS_HOST and REDIS_PORT environment variables are required');
    }

    client = new Redis({
      host: redisHost,
      port: Number(redisPort),
      password: redisPassword === '-' ? undefined : redisPassword,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        Logger.warn({
          module: 'Redis',
          context: 'connection',
          message: `Retry attempt ${times}`,
        });
        return delay;
      },
    });

    client.on('connect', () => {
      Logger.info({
        module: 'Redis',
        context: 'connection',
        message: 'Connected successfully',
      });
    });

    client.on('error', (err: Error) => {
      Logger.error({
        module: 'Redis',
        context: 'connection',
        message: `Error: ${err.message}`,
      });
    });

    client.on('close', () => {
      Logger.warn({
        module: 'Redis',
        context: 'connection',
        message: 'Connection closed',
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
      module: 'Redis',
      context: 'disconnect',
      message: 'Disconnected',
    });
  }
}
