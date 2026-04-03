import { Logger } from '@workspace/shared/lib/utils/logger';
import Redis, { type RedisOptions } from 'ioredis';

let client: Redis | null = null;

/**
 * Returns a plain ioredis options object suitable for passing to BullMQ
 * Worker constructors. BullMQ workers need their own independent connections
 * (they use blocking commands like BLPOP), so passing options — rather than
 * a shared Redis instance — lets BullMQ manage its own connection lifecycle.
 */
export function getRedisOptions(): RedisOptions {
  const redisHost = process.env.REDIS_HOST;
  const redisPort = process.env.REDIS_PORT;
  const redisPassword = process.env.REDIS_PASSWORD;

  if (!redisHost || !redisPort) {
    throw new Error('REDIS_HOST and REDIS_PORT environment variables are required');
  }

  return {
    host: redisHost,
    port: Number(redisPort),
    password: redisPassword === '-' ? undefined : redisPassword,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
  };
}

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
