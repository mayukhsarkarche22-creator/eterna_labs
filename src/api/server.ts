import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { orderRoutes } from './routes/orderRoutes';
import { websocketRoutes } from './websocket';

export const buildServer = () => {
    const server = Fastify({
        logger: true,
    });

    server.register(websocket);
    server.register(orderRoutes, { prefix: '/api' });
    server.register(websocketRoutes);

    server.get('/health', async () => ({ status: 'ok' }));

    return server;
};

