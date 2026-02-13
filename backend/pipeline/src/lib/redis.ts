import Redis from 'ioredis';
import { Logger } from './logger.js';

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
        Logger.log({
          module: 'Redis',
          context: 'connection',
          message: `Retry attempt ${times}`,
          level: 'warn',
        });
        return delay;
      },
    });

    client.on('connect', () => {
      Logger.log({
        module: 'Redis',
        context: 'connection',
        message: 'Connected successfully',
        level: 'info',
      });
    });

    client.on('error', (err: Error) => {
      Logger.log({
        module: 'Redis',
        context: 'connection',
        message: `Error: ${err.message}`,
        level: 'error',
      });
    });

    client.on('close', () => {
      Logger.log({
        module: 'Redis',
        context: 'connection',
        message: 'Connection closed',
        level: 'warn',
      });
    });
  }

  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    Logger.log({
      module: 'Redis',
      context: 'disconnect',
      message: 'Disconnected',
      level: 'info',
    });
  }
}
