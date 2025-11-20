import { randomUUID } from 'crypto';

export interface Quote {
    provider: string;
    price: number;
    amountOut: number;
    feeBps: number;
}

export interface SwapResult {
    txHash: string;
    finalPrice: number;
    status: 'success' | 'failed';
}

export class SlippageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SlippageError';
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockDexRouter {
    private basePrice = 100; // Mock base price for SOL/USDC

    private getVariance(multiplier: number) {
        return 1 + (Math.random() * multiplier - multiplier / 2);
    }

    private withFee(amountOut: number, feeBps: number) {
        return amountOut * (1 - feeBps);
    }

    async getRaydiumQuote(tokenIn: string, tokenOut: string, amount: number): Promise<Quote> {
        await sleep(200);
        const price = this.basePrice * (0.98 + Math.random() * 0.04); // +/- 2% around base
        const feeBps = 0.003; // 30 bps
        return {
            provider: 'Raydium',
            price,
            amountOut: amount * price,
            feeBps,
        };
    }

    async getMeteoraQuote(tokenIn: string, tokenOut: string, amount: number): Promise<Quote> {
        await sleep(200);
        const price = this.basePrice * (0.97 + Math.random() * 0.05); // Slightly wider variance
        const feeBps = 0.002; // 20 bps
        return {
            provider: 'Meteora',
            price,
            amountOut: amount * price,
            feeBps,
        };
    }

    async getQuote(tokenIn: string, tokenOut: string, amount: number): Promise<Quote> {
        const [raydium, meteora] = await Promise.all([
            this.getRaydiumQuote(tokenIn, tokenOut, amount),
            this.getMeteoraQuote(tokenIn, tokenOut, amount),
        ]);

        const raydiumNet = this.withFee(raydium.amountOut, raydium.feeBps);
        const meteoraNet = this.withFee(meteora.amountOut, meteora.feeBps);

        return raydiumNet >= meteoraNet ? raydium : meteora;
    }

    async executeSwap(quote: Quote): Promise<SwapResult> {
        // Simulate execution taking 2-3 seconds
        await sleep(2000 + Math.random() * 1000);

        const variance = this.getVariance(0.04); // +/- 2% variance
        const finalPrice = quote.price * variance;

        const slippage = Math.abs((finalPrice - quote.price) / quote.price);

        if (slippage > 0.01) {
            throw new SlippageError(`Slippage exceeded: ${(slippage * 100).toFixed(2)}%`);
        }

        return {
            txHash: `0x${randomUUID().replace(/-/g, '')}`,
            finalPrice,
            status: 'success',
        };
    }
}
