import Redis from "ioredis";

if (!process.env.REDIS_HOST || !process.env.REDIS_PORT)
  throw new Error("REDIS_HOST and REDIS_PORT are required");

export const redis = new Redis(
  process.env.REDIS_HOST + ":" + process.env.REDIS_PORT,
  {
    maxRetriesPerRequest: null,
  },
);
