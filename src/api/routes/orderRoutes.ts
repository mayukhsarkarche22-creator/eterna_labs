import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { orderQueue } from '../../infrastructure/queue';
import { redisPublisher } from '../../infrastructure/redis';

const prisma = new PrismaClient();

const createOrderSchema = z.object({
    inputToken: z.string().min(1),
    outputToken: z.string().min(1),
    amount: z.number().positive(),
});

type CreateOrderInput = z.infer<typeof createOrderSchema>;

const publishPending = async (orderId: string) => {
    await redisPublisher.publish(
        'order-updates',
        JSON.stringify({
            orderId,
            status: 'PENDING',
            timestamp: new Date().toISOString(),
            message: 'Order queued for processing',
        })
    );
};

const enqueueOrder = async ({ inputToken, outputToken, amount }: CreateOrderInput) => {
    const order = await prisma.order.create({
        data: {
            input_token: inputToken,
            output_token: outputToken,
            amount,
            status: 'PENDING',
            execution_logs: [],
        },
    });

    await orderQueue.add('process-order', { orderId: order.id });
    await publishPending(order.id);

    return order;
};

const websocketPath = (orderId: string) => `/api/orders/execute?orderId=${orderId}`;

type ValidationErrorResponse = {
    error: string;
    details: Record<string, unknown>;
};

const isValidationError = (value: any): value is ValidationErrorResponse =>
    value && typeof value === 'object' && typeof value.error === 'string' && 'details' in value;

export const orderRoutes = async (fastify: FastifyInstance) => {
    const createMarketOrder = async (request: FastifyRequest, reply: FastifyReply) => {
        const result = createOrderSchema.safeParse(request.body);

        if (!result.success) {
            reply.code(400);
            return { error: 'Invalid payload', details: result.error.flatten() };
        }

        return enqueueOrder(result.data);
    };

    fastify.post('/orders/execute', async (request, reply) => {
        const order = await createMarketOrder(request, reply);
        if (isValidationError(order)) {
            return order;
        }

        return {
            orderId: order.id,
            status: order.status,
            websocket: websocketPath(order.id),
            message: 'Connect via WebSocket on this endpoint to stream updates.',
        };
    });
};

