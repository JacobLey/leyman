import Path from 'node:path';
import { isCI } from 'ci-info';
import { stringToUint8Array } from 'uint8array-extras';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { normalizeFileParams, normalizeFilesParams } from '../../../lib/normalize.js';

const cwd = import.meta.dirname;

suite('normalize', () => {
    suite('normalizeFileParams', () => {
        test('success', async () => {
            expect(
                await normalizeFileParams(
                    {
                        filePath: 'file/path',
                        content: '<content>',
                    },
                    {
                        dryRun: true,
                        check: false,
                        cwd,
                    }
                )
            ).to.deep.equal({
                filePath: Path.join(cwd, 'file/path'),
                content: stringToUint8Array('<content>'),
                dryRun: true,
                check: false,
            });
        });

        test('Options are optional', async () => {
            expect(
                await normalizeFileParams({
                    filePath: '/file/path',
                    content: Promise.resolve({ foo: 'bar' }),
                })
            ).to.deep.equal({
                filePath: '/file/path',
                content: stringToUint8Array('{\n  "foo": "bar"\n}\n'),
                dryRun: false,
                check: isCI,
            });
        });
    });

    suite('normalizeFilesParams', () => {
        test('success', async () => {
            expect(
                await normalizeFilesParams(
                    [
                        {
                            filePath: 'file/path/1',
                            content: '<content>',
                        },
                        {
                            filePath: '/file/path/2',
                            content: new Uint8Array([1, 2, 3, 4]),
                        },
                    ],
                    {
                        dryRun: true,
                        check: false,
                        clean: true,
                        targetDir: 'target',
                        cwd,
                    }
                )
            ).to.deep.equal({
                files: [
                    {
                        filePath: Path.join(cwd, 'target/file/path/1'),
                        content: stringToUint8Array('<content>'),
                    },
                    {
                        filePath: '/file/path/2',
                        content: new Uint8Array([1, 2, 3, 4]),
                    },
                ],
                targetDir: Path.join(cwd, 'target'),
                check: false,
                dryRun: true,
                clean: true,
            });
        });

        test('Options are optional', async () => {
            expect(
                await normalizeFilesParams([
                    { filePath: 'file/path/1', content: { foo: 'bar' } },
                    { filePath: '/file/path/2', content: Promise.resolve('<data>') },
                ])
            ).to.deep.equal({
                files: [
                    {
                        filePath: Path.resolve('file/path/1'),
                        content: stringToUint8Array('{\n  "foo": "bar"\n}\n'),
                    },
                    {
                        filePath: '/file/path/2',
                        content: stringToUint8Array('<data>'),
                    },
                ],
                targetDir: Path.resolve(),
                check: isCI,
                dryRun: false,
                clean: false,
            });
        });
    });
});
