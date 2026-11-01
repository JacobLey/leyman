import type * as Vscode from 'vscode';
import { spawn } from 'node:child_process';

/**
 * The part of VS Code's API the extension uses. The real one only exists inside an extension host.
 */

class Collection {
    readonly #items = new Map<string, FakeItem>();
    readonly #owner: FakeItem | undefined;

    public constructor(owner?: FakeItem) {
        this.#owner = owner;
    }

    public get size(): number {
        return this.#items.size;
    }

    public add(item: FakeItem): void {
        item.parent = this.#owner;
        this.#items.set(item.id, item);
    }

    public delete(id: string): void {
        this.#items.delete(id);
    }

    public get(id: string): FakeItem | undefined {
        return this.#items.get(id);
    }

    public replace(items: readonly FakeItem[]): void {
        this.#items.clear();
        for (const item of items) {
            this.add(item);
        }
    }

    public forEach(visit: (item: FakeItem) => void): void {
        for (const item of this.#items.values()) {
            visit(item);
        }
    }
}

/**
 * Stands in for a `TestItem`.
 */
export class FakeItem {
    public readonly children: Collection = new Collection(this);
    public parent: FakeItem | undefined;
    public canResolveChildren = false;
    public range: unknown;
    public readonly id: string;
    public readonly label: string;
    public readonly uri: Vscode.Uri | undefined;

    public constructor(id: string, label: string, uri?: Vscode.Uri) {
        this.id = id;
        this.label = label;
        this.uri = uri;
    }

    /**
     * Lists every descendant, by its label joined with `/`.
     *
     * @param prefix - put before each path
     * @returns paths of the descendants
     */
    public tree(prefix = ''): string[] {
        const found: string[] = [];
        this.children.forEach(child => {
            const path = `${prefix}${child.label}`;
            found.push(path, ...child.tree(`${path}/`));
        });
        return found;
    }

    public find(labels: readonly string[]): FakeItem {
        const [label, ...rest] = labels;
        let match: FakeItem | undefined;
        this.children.forEach(child => {
            if (child.label === label) {
                match = child;
            }
        });
        if (!match) {
            throw new Error(`No ${String(label)} under ${this.label}`);
        }
        return rest.length > 0 ? match.find(rest) : match;
    }
}

class FakeUri {
    public readonly fsPath: string;
    public readonly scheme: string;

    public constructor(fsPath: string, scheme: string) {
        this.fsPath = fsPath;
        this.scheme = scheme;
    }
}

const file = (path: string): FakeUri => new FakeUri(path, 'file');

class FakeMessage {
    public expectedOutput: string | undefined;
    public actualOutput: string | undefined;
    public location: { uri: FakeUri; position: { line: number; character: number } } | undefined;
    public readonly message: string;

    public constructor(message: string) {
        this.message = message;
    }

    public static diff(message: string, expected: string, actual: string): FakeMessage {
        const diff = new FakeMessage(message);
        diff.expectedOutput = expected;
        diff.actualOutput = actual;
        return diff;
    }
}

export interface RunEvent {
    readonly event: string;
    readonly label: string;
    readonly message?: FakeMessage;
}

/**
 * Stands in for a `TestRun`, recording what happens to it.
 */
export class FakeRun {
    public readonly events: RunEvent[] = [];
    public output = '';
    public ended = false;
    public onOutput: ((text: string) => void) | undefined;

    public enqueued(item: FakeItem): void {
        this.events.push({ event: 'enqueued', label: item.label });
    }

    public started(item: FakeItem): void {
        this.events.push({ event: 'started', label: item.label });
    }

    public passed(item: FakeItem): void {
        this.events.push({ event: 'passed', label: item.label });
    }

    public skipped(item: FakeItem): void {
        this.events.push({ event: 'skipped', label: item.label });
    }

    public failed(item: FakeItem, message: FakeMessage): void {
        this.events.push({ event: 'failed', label: item.label, message });
    }

    public errored(item: FakeItem, message: FakeMessage): void {
        this.events.push({ event: 'errored', label: item.label, message });
    }

    public appendOutput(text: string): void {
        this.output += text;
        this.onOutput?.(text);
    }

    public end(): void {
        this.ended = true;
    }

    /**
     * The last result of each item that has one.
     *
     * @returns result by label
     */
    public results(): Record<string, string> {
        return Object.fromEntries(
            this.events
                .filter(({ event }) => event !== 'enqueued' && event !== 'started')
                .map(({ event, label }) => [label, event])
        );
    }

    public message(label: string): FakeMessage | undefined {
        return this.events.find(event => event.label === label && event.message !== undefined)
            ?.message;
    }
}

type Listener<T> = (value: T) => unknown;

class Emitter<T> {
    readonly #listeners = new Set<Listener<T>>();

    public readonly event = (listener: Listener<T>): { dispose: () => void } => {
        this.#listeners.add(listener);
        return {
            dispose: () => {
                this.#listeners.delete(listener);
            },
        };
    };

    public async fire(value: T): Promise<void> {
        await Promise.all([...this.#listeners].map(async listener => listener(value)));
    }
}

/**
 * Stands in for a `CancellationToken`.
 */
export class FakeToken {
    readonly #emitter = new Emitter<undefined>();
    public readonly onCancellationRequested = this.#emitter.event;

    public cancel(): void {
        void this.#emitter.fire(undefined);
    }
}

export interface FakeDocument {
    readonly uri: FakeUri;
    readonly getText: () => string;
}

/**
 * Makes the API, which the real one only exists inside an extension host.
 *
 * @param root - workspace folder, if any
 * @param specs - paths `findFiles` finds
 * @returns the API to pass the extension, and what tests drive it with
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Only tests read this, and they want all of it
export const fakeVscode = (root: string | undefined, specs: readonly string[] = []) => {
    const items = new Collection();
    const runs: FakeRun[] = [];
    const profiles = new Map<string, (request: unknown, token: FakeToken) => Promise<void>>();
    const onCreate = new Emitter<FakeUri>();
    const onChange = new Emitter<FakeUri>();
    const onDelete = new Emitter<FakeUri>();
    const onOpen = new Emitter<FakeDocument>();
    const onChangeDocument = new Emitter<{ document: FakeDocument }>();
    const onTerminate = new Emitter<{ name: string }>();
    const textDocuments: FakeDocument[] = [];
    const nextRun: { hook: (run: FakeRun) => void } = { hook: () => {} };
    const debugState = { start: true, stopped: 0, onStart: (): void => undefined };
    const controller = {
        items,
        resolveHandler: undefined as ((item?: FakeItem) => Promise<void>) | undefined,
        createTestItem: (id: string, label: string, uri?: Vscode.Uri) =>
            new FakeItem(id, label, uri),
        createTestRun: () => {
            const run = new FakeRun();
            nextRun.hook(run);
            runs.push(run);
            return run;
        },
        createRunProfile: (
            label: string,
            _kind: number,
            handler: (request: unknown, token: FakeToken) => Promise<void>
        ) => {
            profiles.set(label, handler);
            return { dispose: () => {} };
        },
        dispose: () => {},
    };

    const vscode = {
        Uri: { file },
        Range: class {
            public readonly start: { line: number; character: number };
            public readonly end: { line: number; character: number };
            public constructor(a: number, b: number, c: number, d: number) {
                this.start = { line: a, character: b };
                this.end = { line: c, character: d };
            }
        },
        Position: class {
            public readonly line: number;
            public readonly character: number;
            public constructor(line: number, character: number) {
                this.line = line;
                this.character = character;
            }
        },
        Location: class {
            public readonly uri: FakeUri;
            public readonly position: { line: number; character: number };
            public constructor(uri: FakeUri, position: { line: number; character: number }) {
                this.uri = uri;
                this.position = position;
            }
        },
        TestMessage: FakeMessage,
        TestRunProfileKind: { Run: 1, Debug: 2 },
        tests: { createTestController: () => controller },
        debug: {
            onDidTerminateDebugSession: onTerminate.event,
            stopDebugging: async () => {
                debugState.stopped++;
            },
            startDebugging: async (
                _folder: unknown,
                config: { name: string; program: string; args: string[]; cwd: string }
            ) => {
                if (!debugState.start) {
                    return false;
                }
                debugState.onStart();
                const child = spawn(process.execPath, [config.program, ...config.args], {
                    cwd: config.cwd,
                    stdio: 'ignore',
                });
                child.on('close', () => {
                    void onTerminate.fire({ name: `Other ${config.name}` });
                    void onTerminate.fire({ name: config.name });
                });
                return true;
            },
        },
        workspace: {
            textDocuments,
            workspaceFolders: root === undefined ? undefined : [{ uri: file(root) }],
            findFiles: async () => specs.map(path => file(path)),
            createFileSystemWatcher: () => ({
                onDidCreate: onCreate.event,
                onDidChange: onChange.event,
                onDidDelete: onDelete.event,
                dispose: () => {},
            }),
            onDidOpenTextDocument: onOpen.event,
            onDidChangeTextDocument: onChangeDocument.event,
        },
    };

    return {
        controller,
        items,
        runs,
        profiles,
        onCreate,
        onChange,
        onDelete,
        onOpen,
        onChangeDocument,
        textDocuments,
        nextRun,
        debugState,
        file,
        vscode: vscode as unknown as typeof Vscode,
        document: (path: string, text: string, scheme = 'file'): FakeDocument => ({
            uri: new FakeUri(path, scheme),
            getText: () => text,
        }),
    };
};
