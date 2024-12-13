import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir, file } from 'tmp-promise';
import { stringToUint8Array } from 'uint8array-extras';
import { beforeEach, suite } from 'mocha-chain';
import { populateFile, populateFiles } from 'populate-files';
import { expect } from '../chai-hooks.js';

const prettyJson = (json: object) => `${JSON.stringify(json, null, 2)}\n`;

suite('Integration test', () => {
    const withTmpFiles = beforeEach(async () => {
        const [tmpDir, tmpJsonFile, tmpTxtFile] = await Promise.all([
            dir({
                prefix: 'populate-file-dir',
                unsafeCleanup: true,
            }),
            file({
                prefix: 'populate-file-json',
                postfix: '.json',
            }),
            file({
                prefix: 'populate-file-txt',
                postfix: '.txt',
            }),
        ]);

        return { tmpDir, tmpJsonFile, tmpTxtFile };
    });

    withTmpFiles.afterEach(async ctx => {
        await Promise.all([
            ctx.tmpDir.cleanup(),
            ctx.tmpJsonFile.cleanup(),
            ctx.tmpTxtFile.cleanup(),
        ]);
    });

    suite('populateFile', () => {
        withTmpFiles.test('Writes new file', async ctx => {
            const filePath = Path.join(ctx.tmpDir.path, 'new-file');
            const content = { foo: '<bar>' };

            expect(
                await populateFile(
                    {
                        filePath,
                        content: Promise.resolve(content),
                    },
                    { check: false }
                )
            ).to.deep.equal({
                updated: true,
                reason: 'file-not-exist',
                filePath,
            });

            const data = await readFile(filePath, 'utf8');
            expect(data).to.equal(prettyJson(content));
        });

        withTmpFiles.test('Updates file out of sync, then skips future updates', async ctx => {
            const content = new Uint8Array([12, 34, 56, 78, 90]);

            expect(
                await populateFile(
                    {
                        filePath: ctx.tmpJsonFile.path,
                        content,
                    },
                    { check: false }
                )
            ).to.deep.equal({
                updated: true,
                reason: 'content-changed',
                filePath: ctx.tmpJsonFile.path,
            });

            const data = await readFile(ctx.tmpJsonFile.path);
            expect(new Uint8Array(data)).to.deep.equal(content);

            expect(
                await populateFile(
                    {
                        filePath: ctx.tmpJsonFile.path,
                        content,
                    },
                    { check: false }
                )
            ).to.deep.equal({
                updated: false,
                filePath: ctx.tmpJsonFile.path,
            });
        });

        withTmpFiles.test('Does not update file during dry run', async ctx => {
            const content = { getsWritten: false };

            expect(
                await populateFile(
                    {
                        filePath: ctx.tmpJsonFile.path,
                        content: Promise.resolve(stringToUint8Array(JSON.stringify(content))),
                    },
                    { check: false, dryRun: true }
                )
            ).to.deep.equal({
                updated: true,
                reason: 'content-changed',
                filePath: ctx.tmpJsonFile.path,
            });

            const data = await readFile(ctx.tmpJsonFile.path, 'utf8');
            expect(data).to.not.deep.equal(content);
        });

        withTmpFiles.test('Errors when file is changed during check', async ctx => {
            const content = { getsWritten: false, throwsError: true };

            await expect(
                populateFile(
                    {
                        filePath: ctx.tmpJsonFile.path,
                        content,
                    },
                    { check: true, dryRun: true }
                )
            ).to.eventually.be.rejectedWith(
                Error,
                `File ${ctx.tmpJsonFile.path} not up to date. Reason: content-changed`
            );

            const data = await readFile(ctx.tmpJsonFile.path, 'utf8');
            expect(data).to.not.deep.equal(content);
        });

        withTmpFiles.test('Errors when file is created during check', async ctx => {
            const content = 'File will not exist';
            const txtPath = Path.join(ctx.tmpDir.path, 'new-txt-file.txt');

            await expect(
                populateFile(
                    {
                        filePath: txtPath,
                        content: Promise.resolve(content),
                    },
                    { check: true, dryRun: true }
                )
            ).to.eventually.be.rejectedWith(
                Error,
                `File ${txtPath} not up to date. Reason: file-not-exist`
            );

            await expect(readFile(txtPath, 'utf8')).to.eventually.be.rejectedWith(
                Error,
                'ENOENT: no such file or director'
            );
        });
    });

    suite('populateFiles', () => {
        withTmpFiles.test('Writes new files', async ctx => {
            const jsonFilePath = Path.join(ctx.tmpDir.path, 'new-json-file');
            const txtFilePath = Path.join(ctx.tmpDir.path, 'new-txt-file');
            const content = { foo: '<bar>' };

            expect(
                await populateFiles(
                    [
                        {
                            filePath: jsonFilePath,
                            content: Promise.resolve(content),
                        },
                        {
                            filePath: txtFilePath,
                            content: Promise.resolve(content.foo),
                        },
                    ],
                    { check: false }
                )
            ).to.deep.equal([
                {
                    updated: true,
                    reason: 'file-not-exist',
                    filePath: jsonFilePath,
                },
                {
                    updated: true,
                    reason: 'file-not-exist',
                    filePath: txtFilePath,
                },
            ]);

            const [jsonData, txtData] = await Promise.all([
                readFile(jsonFilePath, 'utf8'),
                readFile(txtFilePath, 'utf8'),
            ]);
            expect(jsonData).to.equal(prettyJson(content));
            expect(txtData).to.equal(content.foo);

            expect(
                await populateFiles(
                    [
                        {
                            filePath: jsonFilePath,
                            content,
                        },
                        {
                            filePath: txtFilePath,
                            content: content.foo,
                        },
                    ],
                    { check: false }
                )
            ).to.deep.equal([
                {
                    updated: false,
                    filePath: jsonFilePath,
                },
                {
                    updated: false,
                    filePath: txtFilePath,
                },
            ]);
        });

        withTmpFiles.test('Updates file out of sync', async ctx => {
            const jsonContent = { fiddle: ['dee', 'dum'] };
            const rawData = new Uint8Array([12, 3, 45, 6, 78, 9]);

            expect(
                await populateFiles(
                    [
                        {
                            filePath: ctx.tmpJsonFile.path,
                            content: JSON.stringify(jsonContent, null, 4),
                        },
                        {
                            filePath: ctx.tmpTxtFile.path,
                            content: rawData,
                        },
                    ],
                    { check: false }
                )
            ).to.deep.equal([
                {
                    updated: true,
                    reason: 'content-changed',
                    filePath: ctx.tmpJsonFile.path,
                },
                {
                    updated: true,
                    reason: 'content-changed',
                    filePath: ctx.tmpTxtFile.path,
                },
            ]);

            const [jsonData, txtData] = await Promise.all([
                readFile(ctx.tmpJsonFile.path, 'utf8'),
                readFile(ctx.tmpTxtFile.path),
            ]);
            expect(jsonData).to.equal(JSON.stringify(jsonContent, null, 4));
            expect(new Uint8Array(txtData)).to.deep.equal(rawData);
        });

        withTmpFiles.test('Does not update file during dry run', async ctx => {
            const jsonContent = { getsWritten: false };
            const txtContent = 'abc123\n';

            expect(
                await populateFiles(
                    [
                        {
                            filePath: ctx.tmpJsonFile.path,
                            content: JSON.stringify(jsonContent),
                        },
                        {
                            filePath: ctx.tmpTxtFile.path,
                            content: Promise.resolve(stringToUint8Array(txtContent)),
                        },
                    ],
                    { check: false, dryRun: true }
                )
            ).to.deep.equal([
                {
                    updated: true,
                    reason: 'content-changed',
                    filePath: ctx.tmpJsonFile.path,
                },
                {
                    updated: true,
                    reason: 'content-changed',
                    filePath: ctx.tmpTxtFile.path,
                },
            ]);

            const [jsonData, txtData] = await Promise.all([
                readFile(ctx.tmpJsonFile.path, 'utf8'),
                readFile(ctx.tmpTxtFile.path, 'utf8'),
            ]);
            expect(jsonData).to.not.equal(JSON.stringify(jsonContent));
            expect(txtData).to.not.equal(txtContent);
        });

        withTmpFiles.test('Errors when file is changed during check', async ctx => {
            const jsonContent = { getsWritten: false, throwsError: true };
            const txtContent = '\nout of sync!\n';

            const txtPath = Path.join(ctx.tmpDir.path, 'new-txt-file.txt');

            await expect(
                populateFiles(
                    [
                        {
                            filePath: ctx.tmpJsonFile.path,
                            content: jsonContent,
                        },
                        {
                            filePath: txtPath,
                            content: Promise.resolve(txtContent),
                        },
                    ],
                    { check: true, dryRun: true }
                )
            ).to.eventually.be.rejectedWith(
                Error,
                [
                    `File ${ctx.tmpJsonFile.path} not up to date. Reason: content-changed`,
                    `File ${txtPath} not up to date. Reason: file-not-exist`,
                ].join(', ')
            );

            const jsonData = await readFile(ctx.tmpJsonFile.path, 'utf8');
            expect(jsonData).to.not.equal(prettyJson(jsonContent));

            await expect(readFile(txtPath, 'utf8')).to.eventually.be.rejectedWith(
                Error,
                'ENOENT: no such file or director'
            );
        });
    });
});
