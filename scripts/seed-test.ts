import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { orderQueue } from '../src/infrastructure/queue';

dotenv.config();

const prisma = new PrismaClient();
const WS_BASE_URL = process.env.WS_BASE_URL || 'ws://localhost:3000';

const seed = async () => {
    console.log('Seeding 5 concurrent orders...');

    const orders = Array.from({ length: 5 }).map((_, i) => ({
        input_token: 'SOL',
        output_token: 'USDC',
        amount: 10 + i, // Different amounts
        status: 'PENDING',
    }));

    // Create orders in DB
    const createdOrders = await Promise.all(
        orders.map((data) =>
            prisma.order.create({
                data: {
                    ...data,
                    status: 'PENDING', // Explicitly cast string to enum if needed, but Prisma handles it
                },
            })
        )
    );

    // Add to Queue
    await Promise.all(
        createdOrders.map((order) =>
            orderQueue.add('process-order', { orderId: order.id })
        )
    );

    console.log(`Submitted ${createdOrders.length} orders. Listening for updates...`);

    const WebSocket = require('ws');

    await Promise.all(createdOrders.map(order => {
        return new Promise<void>((resolve) => {
            const ws = new WebSocket(`${WS_BASE_URL}/api/orders/execute?orderId=${order.id}`);

            ws.on('open', () => {
                console.log(`🔌 Connected to WS for order ${order.id}`);
            });

            ws.on('message', (data: string) => {
                const update = JSON.parse(data.toString());
                console.log(`[Order ${order.id}] Status: ${update.status} ${update.message ? '- ' + update.message : ''}`);

                if (update.status === 'CONFIRMED' || update.status === 'FAILED') {
                    ws.close();
                    resolve();
                }
            });

            ws.on('error', (err: Error) => {
                console.error(`WS Error for order ${order.id}:`, err);
                resolve(); // Resolve anyway to not hang
            });
        });
    }));

    console.log('All orders processed.');
    await prisma.$disconnect();
};

seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
