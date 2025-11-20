import { FastifyInstance, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { redisSubscriber } from '../infrastructure/redis';
import { WebSocket } from 'ws';

const prisma = new PrismaClient();

type OrderIdResolver = (req: any) => string | undefined;

const normalizeOrderId = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;

const buildWebSocketHandler = (resolveOrderId: OrderIdResolver) => {
    return (socket: WebSocket, req: any) => {
        const orderId = resolveOrderId(req);

        if (!orderId) {
            socket.close(1008, 'orderId is required to subscribe');
            return;
        }

        console.log(`Client connected for order ${orderId}`);

        const sendSnapshot = async () => {
            try {
                const order = await prisma.order.findUnique({ where: { id: orderId } });
                if (order) {
                    socket.send(
                        JSON.stringify({
                            orderId,
                            status: order.status,
                            executionLogs: order.execution_logs ?? [],
                            message: `Current status: ${order.status}`,
                        })
                    );
                }
            } catch (error) {
                console.error(`Snapshot send failed for order ${orderId}`, error);
            }
        };

        void sendSnapshot();

        const handler = (channel: string, message: string) => {
            if (channel !== 'order-updates') {
                return;
            }

            const data = JSON.parse(message);
            if (data.orderId === orderId) {
                socket.send(JSON.stringify(data));
            }
        };

        redisSubscriber.subscribe('order-updates');
        redisSubscriber.on('message', handler);

        socket.on('close', () => {
            console.log(`Client disconnected for order ${orderId}`);
            redisSubscriber.removeListener('message', handler);
        });
    };
};

export const websocketRoutes = async (fastify: FastifyInstance) => {
    fastify.route({
        method: 'GET',
        url: '/api/orders/execute',
        handler: async (_request, reply: FastifyReply) => {
            reply.code(400).send({
                error: 'WebSocket upgrade required',
                message: 'Connect with ?orderId=<id> using WebSocket to stream updates.',
            });
        },
        wsHandler: buildWebSocketHandler((req) => normalizeOrderId(req.query?.orderId)),
    });
};

