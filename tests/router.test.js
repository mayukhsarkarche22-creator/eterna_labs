"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MockDexRouter_1 = require("../src/domain/MockDexRouter");
describe('MockDexRouter', () => {
    let router;
    beforeEach(() => {
        router = new MockDexRouter_1.MockDexRouter();
    });
    test('getQuote returns a valid quote', async () => {
        const amount = 10;
        const quote = await router.getQuote('SOL', 'USDC', amount);
        expect(quote).toHaveProperty('provider');
        expect(quote).toHaveProperty('price');
        expect(quote).toHaveProperty('amountOut');
        expect(quote.amountOut).toBeCloseTo(amount * quote.price);
    });
    test('executeSwap returns success on low slippage', async () => {
        const amount = 10;
        const quote = await router.getQuote('SOL', 'USDC', amount);
        // Mock Math.random to ensure low slippage
        const originalRandom = Math.random;
        Math.random = () => 0.5; // No variance in variance calculation logic if carefully crafted, or just low enough
        try {
            const result = await router.executeSwap(quote);
            expect(result.status).toBe('success');
            expect(result).toHaveProperty('txHash');
        }
        finally {
            Math.random = originalRandom;
        }
    });
    test('executeSwap throws SlippageError on high slippage', async () => {
        const amount = 10;
        const quote = await router.getQuote('SOL', 'USDC', amount);
        // Mock Math.random to force high variance
        // variance = 1 + (random * 0.04 - 0.02)
        // We want variance > 1.01 or < 0.99
        // If random = 0.99 -> 1 + (0.0396 - 0.02) = 1.0196 -> > 1% slippage
        const originalRandom = Math.random;
        Math.random = () => 0.99;
        await expect(router.executeSwap(quote)).rejects.toThrow(MockDexRouter_1.SlippageError);
        Math.random = originalRandom;
    });
});
