import { MockDexRouter, SlippageError } from '../src/domain/MockDexRouter';

const withRandomSequence = (values: number[], fn: () => Promise<void>) => {
    const iterator = values[Symbol.iterator]();
    const originalRandom = Math.random;
    Math.random = () => {
        const next = iterator.next();
        return next.done ? originalRandom() : next.value;
    };

    return fn().finally(() => {
        Math.random = originalRandom;
    });
};

describe('MockDexRouter', () => {
    let router: MockDexRouter;

    beforeEach(() => {
        router = new MockDexRouter();
    });

    test('getQuote returns a valid quote', async () => {
        const amount = 10;
        const quote = await router.getQuote('SOL', 'USDC', amount);

        expect(quote).toHaveProperty('provider');
        expect(quote).toHaveProperty('price');
        expect(quote).toHaveProperty('amountOut');
        expect(quote.amountOut).toBeCloseTo(amount * quote.price);
    });

    test('getQuote selects the better priced DEX', async () => {
        await withRandomSequence([0.9, 0.1], async () => {
            const quote = await router.getQuote('SOL', 'USDC', 5);
            expect(quote.provider).toBe('Raydium');
        });

        await withRandomSequence([0.1, 0.9], async () => {
            const quote = await router.getQuote('SOL', 'USDC', 5);
            expect(quote.provider).toBe('Meteora');
        });
    });

    test('executeSwap returns success on low slippage', async () => {
        const amount = 10;
        const quote = await router.getQuote('SOL', 'USDC', amount);

        await withRandomSequence([0.5, 0.5], async () => {
            const result = await router.executeSwap(quote);
            expect(result.status).toBe('success');
            expect(result).toHaveProperty('txHash');
        });
    });

    test('executeSwap exposes a tx hash with 0x prefix', async () => {
        const quote = await router.getQuote('SOL', 'USDC', 1);
        await withRandomSequence([0.5, 0.5], async () => {
            const result = await router.executeSwap(quote);
            expect(result.txHash).toMatch(/^0x[a-f0-9]{32}$/i);
        });
    });

    test('executeSwap throws SlippageError on high slippage', async () => {
        const amount = 10;
        const quote = await router.getQuote('SOL', 'USDC', amount);

        await withRandomSequence([0.5, 0.99], async () => {
            await expect(router.executeSwap(quote)).rejects.toThrow(SlippageError);
        });
    });

    test('slippage error includes percentage context', async () => {
        const quote = await router.getQuote('SOL', 'USDC', 2);
        await withRandomSequence([0.5, 0.99], async () => {
            await expect(router.executeSwap(quote)).rejects.toThrow(/%/);
        });
    });
});
