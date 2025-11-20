## Order Execution Engine

Fastify-based market-order executor that simulates Raydium vs. Meteora routing, pushes live status updates over WebSocket, and processes jobs via BullMQ. Market orders were chosen because they best demonstrate the full routing + settlement flow without additional condition handling; extending to limit or sniper orders would layer extra pre-routing guards (price triggers or launch detection) while reusing the same queue, worker, and status infrastructure.

### Setup

1. Copy `.env.example` (or follow instructions in `src/app.ts`) to `.env`, pointing `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, and `PORT` at your services.
2. Install dependencies and prepare Prisma:
   ```
   npm install
   npx prisma migrate deploy
   npx prisma generate
   ```
3. Start supporting services (Redis + Postgres) via `docker compose up -d` or your preferred stack.
4. Run the engine:
   - Development: `npm run dev`
   - Seed demo orders: `npm run seed`

### Postman / Insomnia Collection

Import `docs/order-execution.postman_collection.json`. It contains:
- `Health Check` – verify the Fastify server is up.
- `Execute Market Order` – `POST /api/orders/execute` validates input, enqueues the order, and returns the `orderId`.
- `Subscribe To Order Updates (WebSocket)` – connect to the *same endpoint* (`/api/orders/execute?orderId=<id>`) in WebSocket mode to stream `PENDING → ROUTING → …` updates on that order.

### Testing

`npm test` runs 10+ Jest specs that cover:
- Routing logic and slippage handling in `MockDexRouter`.
- Queue configuration (concurrency, rate limits, retry/backoff) via `src/infrastructure/queue`.
- WebSocket lifecycle (subscription, message filtering, cleanup) via `src/api/websocket`.

### Deployed link 
- https://eterna-labs-1.onrender.com
- curl -X POST "https://eterna-labs-1.onrender.com/api/orders/execute" \
       -H "Content-Type: application/json" \
       -d '{"inputToken":"SOL","outputToken":"USDC","amount":10}'

### Extending To Other Order Types

- **Limit orders**: introduce a price guard before logging `ROUTING`; defer queue processing until market data meets the limit condition.
- **Sniper orders**: gate processing on token launch/migration events, then reuse the same routing + settlement pipeline once the watch condition fires.

