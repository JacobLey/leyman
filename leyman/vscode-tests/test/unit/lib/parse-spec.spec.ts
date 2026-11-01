import type { SpecNode } from '#parse-spec';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parseSpec } from '#parse-spec';

const names = (nodes: readonly SpecNode[]): unknown[] =>
    nodes.map(({ kind, name, children }) => [kind, name, ...names(children)]);

suite('parseSpec', () => {
    test('Finds suites and tests of each style', () => {
        expect(
            names(
                parseSpec(
                    'a.spec.ts',
                    `suite('a', () => {
                        test('b', () => {});
                        it('c', () => {});
                        describe('d', () => {
                            withValue.test('e', () => {});
                            mocha.test.only('f', () => {});
                            test.skip("g", () => {});
                            withValue.suite(\`h\`, () => {
                                it('i', helper);
                            });
                        });
                    });`
                )
            )
        ).to.deep.equal([
            [
                'suite',
                'a',
                ['test', 'b'],
                ['test', 'c'],
                [
                    'suite',
                    'd',
                    ['test', 'e'],
                    ['test', 'f'],
                    ['test', 'g'],
                    ['suite', 'h', ['test', 'i']],
                ],
            ],
        ]);
    });

    test('Finds tests inside loops and helpers', () => {
        expect(
            names(
                parseSpec(
                    'a.spec.ts',
                    `for (const a of b) { test('in loop', () => {}); }
                    const helper = () => { test('in helper', () => {}); };`
                )
            )
        ).to.deep.equal([
            ['test', 'in loop'],
            ['test', 'in helper'],
        ]);
    });

    test('Leaves out what is not a test', () => {
        expect(
            parseSpec(
                'a.spec.ts',
                `/regex/.test('text');
                pattern.test(text);
                other('a', () => {});
                object.other('a', () => {});
                makeTest()('a', () => {});
                test();
                withValue.beforeEach(() => {});`
            )
        ).to.deep.equal([]);
    });

    test('Leaves out titles only known at runtime, and what is inside them', () => {
        expect(
            parseSpec(
                'a.spec.ts',
                `test(\`made \${a}\`, () => {});
                test(name, () => {});
                suite(name, () => { test('inside', () => {}); });`
            )
        ).to.deep.equal([]);
    });

    test('Positions are zero-based', () => {
        const [node] = parseSpec('a.spec.ts', `\n  test('a', () => {\n  });\n`);
        expect(node?.start).to.deep.equal({ line: 1, character: 2 });
        expect(node?.end).to.deep.equal({ line: 2, character: 4 });
    });
});
