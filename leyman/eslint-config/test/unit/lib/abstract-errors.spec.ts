import type { ESLint } from 'eslint';
import typescriptParser from '@typescript-eslint/parser';
import { expect } from 'chai';
import { Linter } from 'eslint';
import rawUnicornPlugin from 'eslint-plugin-unicorn';
import { suite, test } from 'mocha';
import { withAbstractErrors } from '#internal/lib/abstract-errors.js';

const unicorn = rawUnicornPlugin as ESLint.Plugin;
const linter = new Linter();
const lint = (plugin: ESLint.Plugin, code: string): string[] =>
    linter
        .verify(
            code,
            {
                files: ['**/*.ts'],
                languageOptions: { parser: typescriptParser },
                plugins: { unicorn: plugin },
                rules: { 'unicorn/custom-error-definition': 'error' },
            },
            'file.ts'
        )
        .map(({ ruleId }) => ruleId ?? 'fatal');

const abstractError = 'export abstract class BaseError extends Error {}';
const concreteError = 'export class BadError extends Error {}';
/**
 * @param declaration - Start of the class declaration
 * @returns An error class whose constructor sets the wrong `name`
 */
const wrongName = (declaration: string): string =>
    `export ${declaration} extends Error { constructor(message: string) { super(message); this.name = 'Other'; } }`;

suite('withAbstractErrors', () => {
    const plugin = withAbstractErrors(unicorn);

    test('unicorn reports an abstract error', () => {
        expect(lint(unicorn, abstractError)).to.deep.equal(['unicorn/custom-error-definition']);
    });

    test('Ignores an abstract error', () => {
        expect(lint(plugin, abstractError)).to.deep.equal([]);
    });

    test('Still reports a concrete error', () => {
        expect(lint(plugin, concreteError)).to.deep.equal(['unicorn/custom-error-definition']);
    });

    test('Ignores what is inside an abstract error', () => {
        expect(lint(plugin, wrongName('abstract class BaseError'))).to.deep.equal([]);
    });

    test('Still reports what is inside a concrete error', () => {
        expect(lint(plugin, wrongName('class BadError'))).to.deep.equal([
            'unicorn/custom-error-definition',
        ]);
    });

    test('Leaves the other rules as they are', () => {
        expect(plugin.rules!['no-null']).to.equal(unicorn.rules!['no-null']);
    });
});
