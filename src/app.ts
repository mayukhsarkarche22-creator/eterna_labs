import dotenv from 'dotenv';
dotenv.config();

import { buildServer } from './api/server';
import { startWorker } from './workers/orderWorker';

const start = async () => {
    // Start Worker
    startWorker();

    // Start Server
    const server = buildServer();
    try {
        const port = Number(process.env.PORT) || 3000;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server running on port ${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
