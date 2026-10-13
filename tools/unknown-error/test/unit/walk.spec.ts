import type { ErrorNode } from 'unknown-error';
import { runInNewContext } from 'node:vm';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { formatError, NonError, walkErrors } from 'unknown-error';
import { revokedArray, withStack } from './helpers.js';

/**
 * Walks a value, keeping only what each test asserts on.
 *
 * @param value - root of the walk
 * @returns one `relation:depth:message` string per node
 */
const summarize = (value: unknown): string[] =>
    [...walkErrors(value)].map(
        ({ depth, error, relation }) => `${relation}:${depth}:${error.message}`
    );

/**
 * Builds a chain of causes.
 *
 * @param length - how many errors wrap the leaf
 * @returns the outermost error
 */
const chain = (length: number): Error => {
    let error = new Error('leaf');
    for (let i = length - 1; i >= 0; i--) {
        error = new Error(`e${i}`, { cause: error });
    }
    return error;
};

suite('walk', () => {
    suite('walkErrors', () => {
        test('Yields ErrorNodes', () => {
            expectTypeOf(walkErrors).returns.toEqualTypeOf<Generator<ErrorNode, void, undefined>>();
        });

        test('Yields the root alone when it has no cause', () => {
            const error = new Error('root');
            expect([...walkErrors(error)]).to.deep.equal([
                { error, depth: 0, relation: 'root', truncated: false },
            ]);
        });

        test('Follows the cause chain', () => {
            expect(summarize(chain(2))).to.deep.equal(['root:0:e0', 'cause:1:e1', 'cause:2:leaf']);
        });

        test('Converts causes that are not Errors', () => {
            const [, cause] = walkErrors(new Error('top', { cause: 'inner' }));
            expect(cause?.error).to.be.instanceOf(NonError);
            expect(cause?.error.message).to.equal('inner');
        });

        test('Includes an undefined cause', () => {
            expect(summarize(new Error('top', { cause: undefined }))).to.deep.equal([
                'root:0:top',
                'cause:1:undefined',
            ]);
        });

        test('Follows causes from another realm', () => {
            const cause: unknown = runInNewContext('new TypeError("x")');
            expect(summarize(new Error('top', { cause }))).to.deep.equal([
                'root:0:top',
                'cause:1:x',
            ]);
        });

        test('Follows the cause of error-like objects', () => {
            expect(summarize({ message: 'outer', cause: { message: 'inner' } })).to.deep.equal([
                'root:0:outer',
                'cause:1:inner',
            ]);
        });

        test('Visits AggregateError entries after the cause, in order', () => {
            const error = new AggregateError(
                [new Error('a'), 'b', new AggregateError([new Error('c')], 'nested')],
                'all',
                { cause: new Error('why') }
            );
            expect(summarize(error)).to.deep.equal([
                'root:0:all',
                'cause:1:why',
                'aggregate:1:a',
                'aggregate:1:b',
                'aggregate:1:nested',
                'aggregate:2:c',
            ]);
        });

        test('Ignores an errors property that is not an array', () => {
            const error = Object.assign(new Error('top'), { errors: 'not an array' });
            expect(summarize(error)).to.deep.equal(['root:0:top']);
        });

        test('Survives an errors property that throws when inspected', () => {
            const error = Object.assign(new Error('top'), { errors: revokedArray() });
            expect(summarize(error)).to.deep.equal(['root:0:top']);
        });

        test('Ends circular cause chains', () => {
            const a = new Error('a');
            const b = new Error('b', { cause: a });
            Object.defineProperty(a, 'cause', { value: b });
            expect(summarize(a)).to.deep.equal(['root:0:a', 'cause:1:b']);
        });

        test('Visits the same primitive each time it appears', () => {
            expect(summarize(new AggregateError(['same', 'same'], 'all'))).to.deep.equal([
                'root:0:all',
                'aggregate:1:same',
                'aggregate:1:same',
            ]);
        });

        test('Stops at maxDepth and marks where it stopped', () => {
            const nodes = [...walkErrors(chain(5), { maxDepth: 2 })];
            expect(nodes.map(node => [node.depth, node.truncated])).to.deep.equal([
                [0, false],
                [1, false],
                [2, true],
            ]);
        });

        test('Does not mark a leaf at maxDepth as truncated', () => {
            const nodes = [...walkErrors(chain(2), { maxDepth: 2 })];
            expect(nodes.at(-1)?.truncated).to.equal(false);
        });

        test('Defaults maxDepth to 32', () => {
            const nodes = [...walkErrors(chain(100))];
            expect(nodes).to.have.length(33);
            expect(nodes.at(-1)?.truncated).to.equal(true);
        });

        test('Walks chains too deep to recurse through', () => {
            const nodes = [...walkErrors(chain(100_000), { maxDepth: Number.POSITIVE_INFINITY })];
            expect(nodes).to.have.length(100_001);
        });
    });

    suite('formatError', () => {
        /**
         * Builds an error whose stack is only its header, so tests don't depend on stack frames.
         *
         * @param message - error message
         * @param options - Error options
         * @returns the error
         */
        const frameless = (message: string, options?: ErrorOptions): Error =>
            withStack(new Error(message, options), `Error: ${message}`);

        test('Prints the stack of the root', () => {
            const error = new Error('root');
            expect(formatError(error)).to.equal(error.stack);
        });

        test('Indents causes under their parent', () => {
            const error = frameless('outer', { cause: frameless('middle', { cause: 'inner' }) });
            expect(formatError(error).split('\n').slice(0, 3)).to.deep.equal([
                'Error: outer',
                '    Caused by: Error: middle',
                '        Caused by: NonError: inner',
            ]);
        });

        test('Lists AggregateError entries', () => {
            const error = withStack(
                new AggregateError([frameless('a'), frameless('b')], 'all'),
                'AggregateError: all'
            );
            expect(formatError(error)).to.equal(
                ['AggregateError: all', '    - Error: a', '    - Error: b'].join('\n')
            );
        });

        test('Indents every line of a stack', () => {
            const cause = withStack(new Error('inner'), 'Error: inner\n    at frame (file.js:1:1)');
            expect(formatError(frameless('outer', { cause }))).to.equal(
                [
                    'Error: outer',
                    '    Caused by: Error: inner',
                    '        at frame (file.js:1:1)',
                ].join('\n')
            );
        });

        test('Adds the header to stacks without one, as in Firefox and Safari', () => {
            const error = withStack(new Error('m'), 'frame@file.js:1:1');
            expect(formatError(error)).to.equal('Error: m\nframe@file.js:1:1');
        });

        test('Prints just the header when there is no stack', () => {
            const error = withStack(new Error('m'), '');
            expect(formatError(error)).to.equal('Error: m');
        });

        test('Prints just the name when the message is empty', () => {
            const error = withStack(new Error('m'), undefined);
            Object.defineProperty(error, 'message', { value: '' });
            expect(formatError(error)).to.equal('Error');
        });

        test('Stringifies a name that is not a string', () => {
            const error = withStack(new Error('m'), '');
            Object.defineProperty(error, 'name', { value: 7 });
            expect(formatError(error)).to.equal('7: m');
        });

        test('Notes where maxDepth cut the chain', () => {
            const error = frameless('outer', { cause: frameless('inner', { cause: 'deeper' }) });
            expect(formatError(error, { maxDepth: 1 })).to.equal(
                [
                    'Error: outer',
                    '    Caused by: Error: inner',
                    '        … more causes omitted (maxDepth: 1)',
                ].join('\n')
            );
        });
    });
});
