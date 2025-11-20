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

### System Flow & Demo Expectations

1. **Order submission & design decisions**  
   - Fastify handles `POST /api/orders/execute`, validates with Zod, persists the order as `PENDING`, and enqueues it in BullMQ before responding with `{ orderId, websocket }`.  
   - A single BullMQ worker (`src/workers/orderWorker.ts`) advances each order through `ROUTING → BUILDING → SUBMITTED → CONFIRMED/FAILED`, logging wrap/unwrap SOL steps, chosen DEX, tx hashes, and publishing every update via Redis Pub/Sub so WebSockets stay current.

2. **Submitting 3–5 orders simultaneously**  
   - `npm run seed` (or firing multiple POST calls) creates five orders at once. BullMQ accepts all jobs immediately; the worker’s `concurrency: 10` setting allows them to process in parallel while the rate limiter enforces ≤100 orders/minute.

3. **WebSocket lifecycle (`PENDING → ROUTING → … → CONFIRMED`)**  
   - Connect any WS client (Postman/Insomnia/`wscat`) to `wss://<host>/api/orders/execute?orderId=<id>`. The handler sends a `PENDING` snapshot as soon as the socket opens, then streams every state change until the order finishes.

4. **DEX routing visibility**  
   - `BUILDING` logs include the winning venue and price/fee (e.g., “Quote received: Raydium @ 100.21 (fee: 0.30bps)”), so both console output and WS messages prove the router compared Raydium vs. Meteora and picked the best net execution. Wrap/unwrap messages highlight native SOL handling.

5. **Queue + retry behavior**  
   - `src/infrastructure/queue.ts` sets `concurrency: 10`, `limiter: { max: 100, duration: 60000 }`, and `defaultJobOptions: { attempts: 3, backoff: exponential }`. Slippage errors log `FAILED` immediately; other errors retry up to three times and emit a final failure entry when exhausted.

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

