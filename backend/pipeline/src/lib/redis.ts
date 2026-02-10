import Redis from 'ioredis';
import { Logger } from './logger.js';

class RedisManager {
  private client: Redis | null = null;
  private isConnected = false;

  getClient(): Redis {
    if (!this.client) {
      const redisHost = process.env.REDIS_HOST;
      const redisPort = process.env.REDIS_PORT;
      const redisPassword = process.env.REDIS_PASSWORD;

      if (!redisHost || !redisPort) {
        throw new Error('REDIS_HOST and REDIS_PORT environment variables are required');
      }

      this.client = new Redis({
        host: redisHost,
        port: Number(redisPort),
        password: redisPassword === '-' ? undefined : redisPassword,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          Logger.log({
            module: 'Redis',
            context: 'getClient',
            message: `Redis connection retry attempt ${times}`,
            level: 'warn',
          });
          return delay;
        },
        reconnectOnError: (err: Error) => {
          Logger.log({
            module: 'Redis',
            context: 'getClient',
            message: `Redis reconnect on error: ${err.message}`,
            level: 'error',
          });
          return true;
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        Logger.log({
          module: 'Redis',
          context: 'getClient',
          message: 'Redis connected successfully',
          level: 'info',
        });
      });

      this.client.on('error', (err: Error) => {
        Logger.log({
          module: 'Redis',
          context: 'getClient',
          message: `Redis error: ${err.message}`,
          level: 'error',
        });
      });

      this.client.on('close', () => {
        this.isConnected = false;
        Logger.log({
          module: 'Redis',
          context: 'getClient',
          message: 'Redis connection closed',
          level: 'warn',
        });
      });
    }

    return this.client;
  }

  isReady(): boolean {
    return this.isConnected && this.client?.status === 'ready';
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      Logger.log({
        module: 'Redis',
        context: 'disconnect',
        message: 'Redis disconnected',
        level: 'info',
      });
    }
  }

  async healthCheck(): Promise<{ status: string; latency?: number }> {
    if (!this.client || !this.isConnected) {
      return { status: 'disconnected' };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      return { status: 'healthy', latency: Date.now() - start };
    } catch {
      return { status: 'unhealthy' };
    }
  }
}

export const redis = new RedisManager();
