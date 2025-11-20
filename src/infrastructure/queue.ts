import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import { getRedisConnection } from './redis';

const QUEUE_NAME = 'order-execution-queue';

const queueConfig: QueueOptions = {
    connection: getRedisConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
};

export const orderQueue = new Queue(QUEUE_NAME, queueConfig);

export const createWorker = (processor: any) => {
    const workerConfig: WorkerOptions = {
        connection: getRedisConnection(),
        concurrency: 10,
        limiter: {
            max: 100,
            duration: 60000, // 1 minute
        },
    };

    return new Worker(QUEUE_NAME, processor, workerConfig);
};
