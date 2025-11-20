const connectionStub = { id: 'redis-connection' };

jest.mock('../src/infrastructure/redis', () => ({
    getRedisConnection: jest.fn(() => connectionStub),
}));

const queueCtor = jest.fn().mockImplementation((name, opts) => ({ name, opts }));
const workerCtor = jest.fn().mockImplementation((_name, _processor, opts) => ({
    opts,
    on: jest.fn(),
}));

jest.mock('bullmq', () => ({
    Queue: queueCtor,
    Worker: workerCtor,
}));

describe('Queue configuration', () => {
    beforeEach(() => {
        jest.resetModules();
        queueCtor.mockClear();
        workerCtor.mockClear();
    });

    test('orderQueue applies limiter and retry defaults', async () => {
        await import('../src/infrastructure/queue');
        const [, options] = queueCtor.mock.calls[0];

        expect(queueCtor).toHaveBeenCalledWith(
            'order-execution-queue',
            expect.objectContaining({
                connection: connectionStub,
                defaultJobOptions: expect.objectContaining({
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 1000 },
                    removeOnComplete: true,
                    removeOnFail: false,
                }),
            })
        );

        expect(options.defaultJobOptions.attempts).toBe(3);
    });

    test('createWorker enforces concurrency of 10', async () => {
        const { createWorker } = await import('../src/infrastructure/queue');
        const processor = jest.fn();

        const worker = createWorker(processor);

        expect(workerCtor).toHaveBeenCalledWith(
            'order-execution-queue',
            processor,
            expect.objectContaining({
                concurrency: 10,
            })
        );
        expect(worker.opts.concurrency).toBe(10);
    });

    test('createWorker shares rate limiter config', async () => {
        const { createWorker } = await import('../src/infrastructure/queue');
        const worker = createWorker(jest.fn());

        expect(workerCtor).toHaveBeenCalledWith(
            'order-execution-queue',
            expect.any(Function),
            expect.objectContaining({
                limiter: { max: 100, duration: 60000 },
            })
        );
        expect(worker.opts.limiter).toEqual({ max: 100, duration: 60000 });
    });
});

