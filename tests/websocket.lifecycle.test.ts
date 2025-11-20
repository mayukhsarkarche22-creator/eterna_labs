type MessageHandler = (channel: string, message: string) => void;

const handlers: Record<string, MessageHandler[]> = {};

const redisSubscriberMock = {
    subscribe: jest.fn(),
    on: jest.fn((event: string, handler: MessageHandler) => {
        handlers[event] = handlers[event] || [];
        handlers[event].push(handler);
    }),
    removeListener: jest.fn((event: string, handler: MessageHandler) => {
        handlers[event] = (handlers[event] || []).filter((h) => h !== handler);
    }),
};

const prismaMock = {
    order: {
        findUnique: jest.fn(),
    },
};

jest.mock('../src/infrastructure/redis', () => ({
    redisSubscriber: redisSubscriberMock,
}));

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn(() => prismaMock),
}));

const registerRoutes = async () => {
    jest.resetModules();
    const { websocketRoutes } = await import('../src/api/websocket');
    const routes: any[] = [];
    const fastify = {
        route: (config: any) => {
            routes.push({ type: 'route', ...config });
        },
    } as any;

    await websocketRoutes(fastify);
    return routes;
};

describe('WebSocket lifecycle', () => {
    beforeEach(() => {
        redisSubscriberMock.subscribe.mockClear();
        redisSubscriberMock.on.mockClear();
        redisSubscriberMock.removeListener.mockClear();
        handlers.message = [];
        prismaMock.order.findUnique.mockReset();
    });

    test('execute endpoint registers HTTP fallback', async () => {
        const routes = await registerRoutes();
        const httpRoute = routes.find((r) => r.url === '/api/orders/execute');
        expect(httpRoute).toBeDefined();

        const reply = {
            code: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };

        await httpRoute!.handler({}, reply);
        expect(reply.code).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'WebSocket upgrade required',
            })
        );
    });

    test('wsHandler streams updates for matching orderId', async () => {
        prismaMock.order.findUnique.mockResolvedValue({
            id: 'abc',
            status: 'PENDING',
            execution_logs: [],
        });
        const routes = await registerRoutes();
        const route = routes.find((r) => r.url === '/api/orders/execute');
        expect(route).toBeDefined();

        const send = jest.fn();
        const close = jest.fn();
        let closeHandler: (() => void) | undefined;
        const socket = {
            send,
            close,
            on: jest.fn((event: string, handler: () => void) => {
                if (event === 'close') {
                    closeHandler = handler;
                }
            }),
        };

        route!.wsHandler(socket, { query: { orderId: 'abc' } });
        await Promise.resolve();

        expect(redisSubscriberMock.subscribe).toHaveBeenCalledWith('order-updates');
        expect(redisSubscriberMock.on).toHaveBeenCalledWith('message', expect.any(Function));
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toContain('"status":"PENDING"');

        handlers.message.forEach((handler) => handler('order-updates', JSON.stringify({ orderId: 'abc', status: 'ROUTING' })));
        expect(send).toHaveBeenCalledTimes(2);

        handlers.message.forEach((handler) => handler('order-updates', JSON.stringify({ orderId: 'xyz', status: 'ROUTING' })));
        expect(send).toHaveBeenCalledTimes(2);

        closeHandler?.();
        expect(redisSubscriberMock.removeListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    test('execute endpoint wsHandler requires query orderId', async () => {
        const routes = await registerRoutes();
        const route = routes.find((r) => r.url === '/api/orders/execute');
        expect(route).toBeDefined();

        const send = jest.fn();
        const close = jest.fn();
        const socket = {
            send,
            close,
            on: jest.fn(),
        };

        prismaMock.order.findUnique.mockResolvedValue({
            id: 'abc',
            status: 'PENDING',
            execution_logs: [],
        });

        route!.wsHandler(socket, { query: {} });
        expect(close).toHaveBeenCalledWith(1008, expect.stringContaining('orderId'));

        close.mockClear();
        route!.wsHandler(socket, { query: { orderId: 'abc' } });
        await Promise.resolve();
        expect(send).toHaveBeenCalledTimes(1);
        send.mockClear();
        handlers.message.forEach((handler) => handler('order-updates', JSON.stringify({ orderId: 'abc', status: 'ROUTING' })));
        expect(send).toHaveBeenCalledTimes(1);
    });
});

