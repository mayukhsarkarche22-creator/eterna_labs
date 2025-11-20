import Redis from 'ioredis';

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null, // Required for BullMQ
};

// Shared Redis connection for general use
export const redis = new Redis(redisConfig);

// Publisher for Pub/Sub
export const redisPublisher = new Redis(redisConfig);

// Subscriber for Pub/Sub
export const redisSubscriber = new Redis(redisConfig);

export const getRedisConnection = () => new Redis(redisConfig);
