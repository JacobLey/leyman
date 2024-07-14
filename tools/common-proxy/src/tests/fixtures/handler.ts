/**
 * @param value
 */
export default function wrapNum(value: [number]): { num: number } {
    const [num] = value;
    return { num };
}
