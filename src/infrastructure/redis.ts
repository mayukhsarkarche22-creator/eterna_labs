import Redis from 'ioredis';

export const redisConfig = {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: null,
  };
  console.log(redisConfig);

// Shared Redis connection for general use
export const redis = new Redis(redisConfig);

// Publisher for Pub/Sub
export const redisPublisher = new Redis(redisConfig);

// Subscriber for Pub/Sub
export const redisSubscriber = new Redis(redisConfig);

export const getRedisConnection = () => new Redis(redisConfig);
