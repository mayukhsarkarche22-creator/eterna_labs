import { Job } from 'bullmq';
import { PrismaClient, OrderStatus } from '@prisma/client';
import { createWorker } from '../infrastructure/queue';
import { MockDexRouter, SlippageError } from '../domain/MockDexRouter';
import { redisPublisher } from '../infrastructure/redis';

const prisma = new PrismaClient();
const router = new MockDexRouter();

interface OrderJobData {
    orderId: string;
}

const processOrder = async (job: Job<OrderJobData>) => {
    const { orderId } = job.data;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
        throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.FAILED) {
        console.log(`Order ${orderId} already processed`);
        return;
    }

    const log = async (status: OrderStatus, message: string, updateStatus = true) => {
        const entry = { status, timestamp: new Date().toISOString(), message };
        await prisma.order.update({
            where: { id: orderId },
            data: {
                ...(updateStatus ? { status } : {}),
                execution_logs: {
                    push: entry,
                },
            },
        });

        // Publish event
        await redisPublisher.publish('order-updates', JSON.stringify({ orderId, ...entry }));
    };

    const needsWrapInput = order.input_token.toUpperCase() === 'SOL';
    const needsUnwrapOutput = order.output_token.toUpperCase() === 'SOL';

    try {
        if (needsWrapInput) {
            await log(order.status, 'Wrapping native SOL to wSOL for routing', false);
        }

        // 1. Routing
        await log(OrderStatus.ROUTING, 'Finding best route...');
        const quote = await router.getQuote(order.input_token, order.output_token, Number(order.amount));

        // 2. Building
        await log(
            OrderStatus.BUILDING,
            `Quote received: ${quote.provider} @ ${quote.price.toFixed(4)} (fee: ${(quote.feeBps * 100).toFixed(2)}bps)`
        );

        // Simulate building tx
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 3. Submitted
        await log(OrderStatus.SUBMITTED, 'Transaction submitted to network');

        // 4. Execute Swap
        const result = await router.executeSwap(quote);

        if (needsUnwrapOutput) {
            await log(OrderStatus.SUBMITTED, 'Unwrapping wSOL to SOL for settlement', false);
        }

        // 5. Confirmed
        const confirmedEntry = {
            status: OrderStatus.CONFIRMED,
            timestamp: new Date().toISOString(),
            message: `Swap confirmed. Final Price: ${result.finalPrice}`,
        };
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: OrderStatus.CONFIRMED,
                tx_hash: result.txHash,
                execution_logs: {
                    push: confirmedEntry,
                },
            },
        });
        await redisPublisher.publish(
            'order-updates',
            JSON.stringify({
                orderId,
                txHash: result.txHash,
                ...confirmedEntry,
            })
        );

    } catch (error: any) {
        if (error instanceof SlippageError) {
            await log(OrderStatus.FAILED, `Slippage error: ${error.message}`);
            // Do not rethrow, so BullMQ doesn't retry
        } else {
            // Network or other errors
            await log(OrderStatus.FAILED, `Network/System error: ${error.message}. Retrying...`);
            throw error; // Rethrow to trigger BullMQ retry
        }
    }
};

export const startWorker = () => {
    const worker = createWorker(processOrder);

    worker.on('completed', (job) => {
        console.log(`Job ${job.id} completed`);
    });

    worker.on('failed', async (job, err) => {
        console.log(`Job ${job?.id} failed: ${err.message}`);

        if (!job) {
            return;
        }

        const attemptsAllowed = job.opts.attempts ?? 1;
        if (job.attemptsMade >= attemptsAllowed) {
            const orderId = (job.data as OrderJobData).orderId;
            const message = `Final failure after ${attemptsAllowed} attempt${attemptsAllowed > 1 ? 's' : ''}: ${err.message}`;
            const entry = {
                status: OrderStatus.FAILED,
                timestamp: new Date().toISOString(),
                message,
            };

            await prisma.order.update({
                where: { id: orderId },
                data: {
                    status: OrderStatus.FAILED,
                    execution_logs: {
                        push: entry,
                    },
                },
            });

            await redisPublisher.publish(
                'order-updates',
                JSON.stringify({
                    orderId,
                    ...entry,
                })
            );
        }
    });

    console.log('Worker started');
};
