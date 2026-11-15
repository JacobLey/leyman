import type { AwsEmulator } from 'aws-emulator-launch';
import type { FakeEmulators } from '#test/helpers/fake-emulator.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import {
    AwsEmulatorError,
    AwsEmulatorExitError,
    AwsEmulatorFileError,
    AwsEmulatorNotRunError,
    AwsEmulatorStartTimeoutError,
    launchAwsEmulator,
} from 'aws-emulator-launch';
import { before, suite } from 'mocha-chain';
import { ca, credentials, fakeEmulators, shellQuote } from '#test/helpers/fake-emulator.js';

/**
 * Whether a process is still running.
 *
 * @param pid - Its id
 * @returns `true` while it runs
 */
const isRunning = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

suite('launchAwsEmulator with a fake emulator', () => {
    const withFakes = before(async () => ({ fakes: await fakeEmulators() }));
    withFakes.after(async ({ fakes }) => {
        await fakes.remove();
    });

    /**
     * A fake emulator that writes its arguments and process id, prints the lines given, then runs until stopped.
     *
     * @param fakes - Where to write it
     * @param name - Its name
     * @param lines - What it prints, one line each
     * @returns Its path, and where it writes its arguments and process id
     */
    const serving = async (
        fakes: FakeEmulators,
        name: string,
        lines: readonly string[]
    ): Promise<{ binary: string; argsFile: string; pidFile: string }> => {
        const argsFile = path.join(fakes.dir, `${name}.args`);
        const pidFile = path.join(fakes.dir, `${name}.pid`);
        const binary = await fakes.write(
            name,
            [
                `echo "$@" > ${shellQuote(argsFile)}`,
                `echo $$ > ${shellQuote(pidFile)}`,
                ...lines.map(line => `echo ${shellQuote(line)}`),
                'exec sleep 30',
            ].join('\n')
        );
        return { binary, argsFile, pidFile };
    };

    withFakes.test('Reads the startup line, and the files it names', async ({ fakes }) => {
        const { binary } = await serving(fakes, 'reads', [await fakes.writeFiles('reads')]);

        const emulator = await launchAwsEmulator({ binary });
        await emulator.stop();

        expectTypeOf(emulator).toEqualTypeOf<AwsEmulator>();
        expect({ ...emulator, [Symbol.asyncDispose]: null, stop: null }).to.deep.equal({
            ca,
            endpoint: 'https://127.0.0.1:1234',
            region: 'eu-west-3',
            credentials: { accessKeyId: 'EMULATORKEY', secretAccessKey: 'EMULATORSECRET' },
            caFile: path.join(fakes.dir, 'reads-files', 'ca.pem'),
            [Symbol.asyncDispose]: null,
            stop: null,
        });
    });

    withFakes.test(
        'Ignores every other line, JSON or not, until the startup line',
        async ({ fakes }) => {
            const { binary } = await serving(fakes, 'ignores', [
                'This emulator collects usage and error telemetry',
                '',
                'null',
                '42',
                '{"fields":null}',
                '{"fields":"emulator server information"}',
                '{"fields":{"message":"aws-emulator emulator starting"}}',
                '{"fields":{"message":"emulator server information"}}',
                '{"fields":{"message":"emulator server information","endpoint_url":"https://127.0.0.1:1"}}',
                '{"fields":{"message":"emulator server information","endpoint_url":"https://127.0.0.1:1","config_file":"/c"}}',
                await fakes.writeFiles('ignores'),
            ]);

            const emulator = await launchAwsEmulator({ binary });
            await emulator.stop();

            expect(emulator.endpoint).to.equal('https://127.0.0.1:1234');
        }
    );

    withFakes.test('Reads a startup line written in pieces', async ({ fakes }) => {
        const line = await fakes.writeFiles('pieces');
        const binary = await fakes.write(
            'pieces',
            [
                `printf '%s' ${shellQuote(line.slice(0, 20))}`,
                'sleep 0.1',
                `echo ${shellQuote(line.slice(20))}`,
                'exec sleep 30',
            ].join('\n')
        );

        const emulator = await launchAwsEmulator({ binary });
        await emulator.stop();

        expect(emulator.region).to.equal('eu-west-3');
    });

    withFakes.test(
        'Runs on a free port with authentication on, telemetry off, and an idle timeout',
        async ({ fakes }) => {
            const { binary, argsFile } = await serving(fakes, 'defaults', [
                await fakes.writeFiles('defaults'),
            ]);

            const emulator = await launchAwsEmulator({ binary });
            await emulator.stop();

            expect(await readFile(argsFile, 'utf8')).to.equal(
                '-p 0 -a on --idle-timeout 600 -t off\n'
            );
        }
    );

    withFakes.test(
        'Leaves telemetry to the emulator, and rounds the idle timeout up to whole seconds',
        async ({ fakes }) => {
            const { binary, argsFile } = await serving(fakes, 'options', [
                await fakes.writeFiles('options'),
            ]);

            const emulator = await launchAwsEmulator({
                binary,
                idleTimeoutMs: 1500,
                telemetry: true,
            });
            await emulator.stop();

            expect(await readFile(argsFile, 'utf8')).to.equal('-p 0 -a on --idle-timeout 2\n');
        }
    );

    withFakes.test('Stops it, and waits until it has exited', async ({ fakes }) => {
        const { binary, pidFile } = await serving(fakes, 'stops', [
            await fakes.writeFiles('stops'),
        ]);
        const emulator = await launchAwsEmulator({ binary });
        const pid = Number(await readFile(pidFile, 'utf8'));

        await emulator.stop();

        expect(isRunning(pid)).to.equal(false);
    });

    withFakes.test('Stops it at the end of an await using block', async ({ fakes }) => {
        const { binary, pidFile } = await serving(fakes, 'disposes', [
            await fakes.writeFiles('disposes'),
        ]);

        {
            await using emulator = await launchAwsEmulator({ binary });
            expect(emulator.region).to.equal('eu-west-3');
        }

        expect(isRunning(Number(await readFile(pidFile, 'utf8')))).to.equal(false);
    });

    withFakes.test(
        'Stops again, or after it exited on its own, without error',
        async ({ fakes }) => {
            const binary = await fakes.write(
                'exits',
                `echo ${shellQuote(await fakes.writeFiles('exits'))}`
            );
            const emulator = await launchAwsEmulator({ binary });

            await emulator.stop();
            await emulator.stop();
        }
    );

    withFakes.test(
        'Fails when the binary is missing, linking the install page',
        async ({ fakes }) => {
            const binary = path.join(fakes.dir, 'missing');

            await expect(launchAwsEmulator({ binary }))
                .to.be.rejectedWith(AwsEmulatorNotRunError, 'getting-started')
                .and.eventually.be.instanceOf(AwsEmulatorError)
                .and.include({ name: 'AwsEmulatorNotRunError', binary });
        }
    );

    withFakes.test(
        'Fails when it exits before the startup line, with its output',
        async ({ fakes }) => {
            const binary = await fakes.write('crashes', 'echo "unknown option" >&2\nexit 3');

            await expect(launchAwsEmulator({ binary }))
                .to.be.rejectedWith(AwsEmulatorExitError, 'exited with code 3')
                .and.eventually.include({
                    name: 'AwsEmulatorExitError',
                    code: 3,
                    signal: null,
                    output: 'unknown option\n',
                });
        }
    );

    withFakes.test(
        'Fails when it is killed before the startup line, naming the signal',
        async ({ fakes }) => {
            const binary = await fakes.write('killed', 'kill -9 $$');

            await expect(launchAwsEmulator({ binary }))
                .to.be.rejectedWith(AwsEmulatorExitError, 'SIGKILL')
                .and.eventually.include({ code: null, signal: 'SIGKILL' });
        }
    );

    withFakes.test(
        'Kills it when the startup line never comes, naming the minimum version',
        async ({ fakes }) => {
            const { binary, pidFile } = await serving(fakes, 'silent', [
                '{"fields":{"message":"listening on 9297"}}',
            ]);

            await expect(launchAwsEmulator({ binary, startTimeoutMs: 200 }))
                .to.be.rejectedWith(AwsEmulatorStartTimeoutError, '1.0.290')
                .and.eventually.include({
                    name: 'AwsEmulatorStartTimeoutError',
                    timeoutMs: 200,
                    output: '{"fields":{"message":"listening on 9297"}}\n',
                });
            expect(isRunning(Number(await readFile(pidFile, 'utf8')))).to.equal(false);
        }
    );

    withFakes.test('Stops it when a file the startup line names is missing', async ({ fakes }) => {
        const line = await fakes.writeFiles('unreadable');
        const { binary, pidFile } = await serving(fakes, 'unreadable', [
            line.replace('ca.pem', 'missing.pem'),
        ]);

        await expect(launchAwsEmulator({ binary }))
            .to.be.rejectedWith(AwsEmulatorFileError)
            .and.eventually.include({
                name: 'AwsEmulatorFileError',
                file: path.join(fakes.dir, 'unreadable-files', 'missing.pem'),
            });
        expect(isRunning(Number(await readFile(pidFile, 'utf8')))).to.equal(false);
    });

    withFakes.test('Fails when its keys are missing one', async ({ fakes }) => {
        const line = await fakes.writeFiles('keyless', {
            emulator_credentials: credentials.replace(/^aws_secret_access_key.*$/mv, ''),
        });
        const { binary } = await serving(fakes, 'keyless', [line]);

        await expect(launchAwsEmulator({ binary }))
            .to.be.rejectedWith(AwsEmulatorFileError, 'aws_secret_access_key')
            .and.eventually.include({
                file: path.join(fakes.dir, 'keyless-files', 'emulator_credentials'),
            });
    });
});
