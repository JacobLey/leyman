export default function appendExtras(
    handler: (...args: unknown[]) => unknown[],
    ...extras: unknown[]
): (...args: unknown[]) => unknown[] {
    return (...args) => {
        const original = handler(...args);
        return [...original, ...extras];
    };
}

export const asyncDecorator =
    (
        handler: (a: number, b: string) => Promise<{ a: number; b: string }>,
        extra: boolean
    ): ((a: number, b: string) => Promise<{ a: number; b: string; c: boolean }>) =>
    async (a: number, b: string) => {
        const original = await handler(a, b);
        return { ...original, c: extra };
    };
