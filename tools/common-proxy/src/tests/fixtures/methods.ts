import { setTimeout } from 'node:timers/promises';

export const addAllNums = (...nums: number[]): number => {
    let sum = 0;
    for (const num of nums) {
        sum += num;
    }
    return sum;
};

export const delayForLongestTime = async (
    ...delays: number[]
): Promise<void> => {
    await Promise.all(delays.map(async delay => setTimeout(delay)));
};

export const slowReverse = async (str: string): Promise<string> => {
    let reversed = '';
    for (let char of str) {
        await setTimeout(1);
        reversed = char + reversed;
    }
    return reversed;
};
