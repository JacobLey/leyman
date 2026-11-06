import type * as Vscode from 'vscode';
import type { SpecNode } from './parse-spec.js';
import type { Project } from './project.js';
import type { Outcome, RunCommand, Selection } from './runner.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { parseSpec } from './parse-spec.js';
import { findProject, specLabel } from './project.js';
import { buildCommand, failureLocation, readReport, runProcess } from './runner.js';

const SPEC_GLOB = '**/test/**/*.spec.{ts,tsx,mts,cts}';
const SPEC_EXCLUDE = '**/{node_modules,dist,dist-test,data}/**';

type Entry =
    | { readonly kind: 'file'; readonly project: Project; readonly path: string }
    | { readonly kind: 'project'; readonly project: Project }
    | (Selection & { readonly project: Project; readonly path: string });

interface SpecRun {
    readonly project: Project;
    readonly path: string;
    readonly file: Vscode.TestItem;
    readonly selections: Selection[];
    readonly items: Vscode.TestItem[];
    whole: boolean;
}

const isSpec = (path: string): boolean =>
    /\/test\/.*\.spec\.[cm]?tsx?$/v.test(path) &&
    !/\/(?:data|dist|dist-test|node_modules)\//v.test(path);

const toCrlf = (text: string): string => text.replaceAll(/\r?\n/gv, '\r\n');

const skipAll = (run: Vscode.TestRun, { items }: Pick<SpecRun, 'items'>): void => {
    for (const item of items) {
        run.skipped(item);
    }
};

const toItems = (collection: Vscode.TestItemCollection): Vscode.TestItem[] => {
    const found: Vscode.TestItem[] = [];
    collection.forEach(item => {
        found.push(item);
    });
    return found;
};

/**
 * Tests of a spec as items of VS Code's test UI, which gives each one its play button. Builds what is selected
 * with the project's `test:compile` target, as the runners read compiled output, then calls the runner directly:
 * the results of `test` are of the whole project, and cached.
 */
class SpecTests {
    readonly #vscode: typeof Vscode;
    readonly #workspace: string;
    readonly #controller: Vscode.TestController;
    readonly #entries = new WeakMap<Vscode.TestItem, Entry>();
    readonly #titles = new Map<string, Map<string, Vscode.TestItem>>();
    #queue: Promise<unknown> = Promise.resolve();

    public constructor(
        vscode: typeof Vscode,
        workspace: string,
        controller: Vscode.TestController
    ) {
        this.#vscode = vscode;
        this.#workspace = workspace;
        this.#controller = controller;
    }

    public async addFile(uri: Vscode.Uri): Promise<Vscode.TestItem | undefined> {
        const existing = this.#findFile(uri.fsPath);
        if (existing) {
            return existing;
        }
        const project = await findProject(uri.fsPath);
        if (!project) {
            return undefined;
        }
        const parent = this.#projectItem(project);
        const item = this.#controller.createTestItem(
            uri.fsPath,
            specLabel(project, uri.fsPath),
            uri
        );
        item.canResolveChildren = true;
        this.#entries.set(item, { project, kind: 'file', path: uri.fsPath });
        parent.children.add(item);
        return item;
    }

    public async syncFile(uri: Vscode.Uri, text?: string): Promise<void> {
        const file = await this.addFile(uri);
        if (!file) {
            return;
        }
        const source = text ?? (await readFile(uri.fsPath, 'utf8'));
        const entry = this.#entries.get(file) as Entry & { kind: 'file' };
        const titles = new Map<string, Vscode.TestItem>();
        this.#titles.set(uri.fsPath, titles);
        file.children.replace(
            parseSpec(uri.fsPath, source).map(node => this.#nodeItem(node, entry, [], titles))
        );
        file.canResolveChildren = false;
    }

    public removeFile(uri: Vscode.Uri): void {
        const file = this.#findFile(uri.fsPath);
        const project = file?.parent;
        if (!project) {
            return;
        }

        project.children.delete(file.id);
        this.#titles.delete(uri.fsPath);
        if (project.children.size === 0) {
            this.#controller.items.delete(project.id);
        }
    }

    /**
     * One at a time, as compiling a project replaces the output another run would be reading.
     *
     * @param request - what VS Code asks to run
     * @param token - cancels the run
     * @param isDebug - run under the debugger
     * @returns once it is done
     */
    public async run(
        request: Vscode.TestRunRequest,
        token: Vscode.CancellationToken,
        isDebug: boolean
    ): Promise<void> {
        const previous = this.#queue;
        const result = (async () => {
            await previous;
            await this.#run(request, token, isDebug);
        })();
        this.#queue = Promise.allSettled([result]);
        return result;
    }

    #findFile(path: string): Vscode.TestItem | undefined {
        return toItems(this.#controller.items)
            .map(project => project.children.get(path))
            .find(Boolean);
    }

    #projectItem(project: Project): Vscode.TestItem {
        const existing = this.#controller.items.get(project.root);
        if (existing) {
            return existing;
        }
        const item = this.#controller.createTestItem(project.root, project.name);
        this.#entries.set(item, { project, kind: 'project' });
        this.#controller.items.add(item);
        return item;
    }

    #nodeItem(
        node: SpecNode,
        file: Entry & { kind: 'file' },
        parents: readonly string[],
        titles: Map<string, Vscode.TestItem>
    ): Vscode.TestItem {
        const path = [...parents, node.name];
        const item = this.#selectionItem(file, { kind: node.kind, titles: path }, node.name);
        const vscode = this.#vscode;
        item.range = new vscode.Range(
            node.start.line,
            node.start.character,
            node.end.line,
            node.end.character
        );
        titles.set(path.join(' '), item);
        item.children.replace(
            node.children.map(child => this.#nodeItem(child, file, path, titles))
        );
        return item;
    }

    #selectionItem(
        { project, path }: { project: Project; path: string },
        selection: Selection,
        label: string
    ): Vscode.TestItem {
        const item = this.#controller.createTestItem(
            `${path}#${selection.titles.join(' ')}`,
            label,
            this.#vscode.Uri.file(path)
        );
        this.#entries.set(item, { project, path, ...selection });
        return item;
    }

    async #plan(request: Vscode.TestRunRequest): Promise<SpecRun[]> {
        const excluded = new Set(request.exclude);
        const runs = new Map<string, SpecRun>();

        const add = async (item: Vscode.TestItem): Promise<void> => {
            const entry = this.#entries.get(item)!;
            if (excluded.has(item)) {
                return;
            }
            if (entry.kind === 'project') {
                await Promise.all(toItems(item.children).map(async child => add(child)));
                return;
            }
            if (item.canResolveChildren) {
                await this.syncFile(item.uri!);
            }
            const specRun = runs.get(entry.path) ?? {
                project: entry.project,
                path: entry.path,
                file: this.#findFile(entry.path)!,
                selections: [],
                items: [],
                whole: false,
            };
            runs.set(entry.path, specRun);
            specRun.items.push(...this.#tests(item));
            if (entry.kind === 'file') {
                specRun.whole = true;
            } else {
                specRun.selections.push(entry);
            }
        };
        await Promise.all(
            (request.include ?? toItems(this.#controller.items)).map(async item => add(item))
        );
        return runs.values().toArray();
    }

    #tests(item: Vscode.TestItem): Vscode.TestItem[] {
        return this.#entries.get(item)?.kind === 'test'
            ? [item]
            : toItems(item.children).flatMap(child => this.#tests(child));
    }

    async #run(
        request: Vscode.TestRunRequest,
        token: Vscode.CancellationToken,
        isDebug: boolean
    ): Promise<void> {
        const run = this.#controller.createTestRun(request);
        const abort = new AbortController();
        const cancellation = token.onCancellationRequested(() => {
            abort.abort();
        });
        try {
            const specRuns = await this.#plan(request);
            for (const { items } of specRuns) {
                for (const item of items) {
                    run.enqueued(item);
                }
            }
            const projects = new Map(specRuns.map(({ project }) => [project.root, project]));
            const failedToCompile = new Set<string>();
            for (const project of projects.values()) {
                if (!abort.signal.aborted && !(await this.#compile(project, run, abort.signal))) {
                    failedToCompile.add(project.root);
                }
            }
            for (const specRun of specRuns) {
                if (abort.signal.aborted) {
                    skipAll(run, specRun);
                } else if (failedToCompile.has(specRun.project.root)) {
                    this.#errorAll(
                        run,
                        specRun,
                        `${specRun.project.name} failed to compile. See the output.`
                    );
                } else {
                    await this.#runSpec(specRun, run, abort.signal, isDebug);
                }
            }
        } finally {
            cancellation.dispose();
            run.end();
        }
    }

    #env(): Record<string, string | undefined> {
        return {
            // eslint-disable-next-line n/no-process-env -- Everything else as the editor runs with
            ...process.env,
            FORCE_COLOR: '1',
            NODE_OPTIONS: '--enable-source-maps',
            NX_WORKSPACE_ROOT: this.#workspace,
            // The container's `PATH` names the worktree it was opened on
            PATH: [
                Path.join(this.#workspace, 'leyman', 'main', 'node_modules', '.bin'),
                Path.join(this.#workspace, 'scripts', 'commands'),
                // eslint-disable-next-line n/no-process-env -- Everything else as the editor runs with
                process.env.PATH,
            ].join(Path.delimiter),
        };
    }

    async #compile(project: Project, run: Vscode.TestRun, signal: AbortSignal): Promise<boolean> {
        run.appendOutput(toCrlf(`Building ${project.name}\n`));
        const code = await runProcess({
            signal,
            command: 'nx',
            args: ['run', `${project.name}:test:compile`, '--outputStyle=static'],
            cwd: this.#workspace,
            env: this.#env(),
            onOutput: text => {
                run.appendOutput(toCrlf(text));
            },
        });
        return code === 0;
    }

    #errorAll(run: Vscode.TestRun, { file, items }: SpecRun, message: string): void {
        const vscode = this.#vscode;
        const testMessage = new vscode.TestMessage(message);
        if (items.length === 0) {
            run.errored(file, testMessage);
        }
        for (const item of items) {
            run.errored(item, testMessage);
        }
    }

    async #runSpec(
        specRun: SpecRun,
        run: Vscode.TestRun,
        signal: AbortSignal,
        isDebug: boolean
    ): Promise<void> {
        const { path, project, selections, whole, items } = specRun;
        const directory = await mkdtemp(Path.join(tmpdir(), 'vscode-tests-'));
        try {
            const command = buildCommand({
                project,
                isDebug,
                spec: path,
                selections: whole ? [] : selections,
                report: Path.join(directory, 'report.json'),
            });
            for (const item of items) {
                run.started(item);
            }
            await (isDebug
                ? this.#debugCommand(command, run, signal)
                : runProcess({
                      signal,
                      command: 'node',
                      args: [command.program, ...command.args],
                      cwd: command.cwd,
                      env: this.#env(),
                      onOutput: text => {
                          run.appendOutput(toCrlf(text));
                      },
                  }));
            if (signal.aborted) {
                skipAll(run, specRun);
                return;
            }
            const report = await readReport(project, command.report);
            const unreported = new Set(items);
            for (const outcome of report.outcomes) {
                const item = this.#itemFor(specRun, outcome);
                unreported.delete(item);
                this.#applyOutcome(run, item, outcome);
            }
            if (report.failure === undefined) {
                skipAll(run, { items: [...unreported] });
            } else {
                this.#errorAll(run, { ...specRun, items: [...unreported] }, report.failure);
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }

    async #debugCommand(
        { program, args, cwd }: RunCommand,
        run: Vscode.TestRun,
        signal: AbortSignal
    ): Promise<void> {
        const { debug, workspace } = this.#vscode;
        const name = `Test ${randomUUID()}`;
        const { promise: terminated, resolve } = Promise.withResolvers<void>();
        const subscription = debug.onDidTerminateDebugSession(session => {
            if (session.name === name) {
                resolve();
            }
        });
        const stop = (): void => {
            void debug.stopDebugging();
        };
        signal.addEventListener('abort', stop);
        try {
            const isStarted = await debug.startDebugging(
                workspace.workspaceFolders?.[0],
                {
                    name,
                    program,
                    cwd,
                    type: 'node',
                    request: 'launch',
                    args: [...args],
                    env: this.#env(),
                    console: 'internalConsole',
                    outputCapture: 'std',
                    skipFiles: ['<node_internals>/**'],
                },
                { testRun: run }
            );
            if (isStarted) {
                await terminated;
            }
        } finally {
            signal.removeEventListener('abort', stop);
            subscription.dispose();
        }
    }

    /**
     * A result no parsed test owns (a title made at runtime, a failing hook) goes under the longest suite whose
     * title it starts with.
     *
     * @param specRun - spec that ran
     * @param outcome - result to find the item of
     * @returns the item of that result
     */
    #itemFor({ project, path, file }: SpecRun, { fullTitle }: Outcome): Vscode.TestItem {
        const titles = this.#titles.get(path)!;
        const known = titles.get(fullTitle);
        if (known) {
            return known;
        }
        let parent = file;
        let prefix: readonly string[] = [];
        for (const [title, item] of titles) {
            const entry = this.#entries.get(item) as Selection;
            if (
                !(
                    entry.kind === 'suite' &&
                    fullTitle.startsWith(`${title} `) &&
                    entry.titles.length > prefix.length
                )
            ) {
                continue;
            }

            parent = item;
            prefix = entry.titles;
        }
        const label = fullTitle.slice(prefix.join(' ').length).trimStart();
        const item = this.#selectionItem(
            { project, path },
            { kind: 'test', titles: [...prefix, label] },
            label
        );
        parent.children.add(item);
        titles.set(fullTitle, item);
        return item;
    }

    #applyOutcome(
        run: Vscode.TestRun,
        item: Vscode.TestItem,
        { state, duration, failure }: Outcome
    ): void {
        if (state === 'passed') {
            run.passed(item, duration);
        } else if (state === 'skipped') {
            run.skipped(item);
        } else {
            run.failed(item, this.#message(failure), duration);
        }
    }

    #message(failure: Outcome['failure']): Vscode.TestMessage {
        const vscode = this.#vscode;
        const { message, expected, actual, stack } = failure!;
        const testMessage =
            typeof expected === 'string' && typeof actual === 'string'
                ? vscode.TestMessage.diff(message, expected, actual)
                : new vscode.TestMessage(message);
        const location = failureLocation(stack);
        if (location) {
            testMessage.location = new vscode.Location(
                vscode.Uri.file(location.path),
                new vscode.Position(location.line, location.character)
            );
        }
        return testMessage;
    }
}

/**
 * Starts the extension. The bootstrap in `.vscode/extensions/leyman-tests` calls this with VS Code's API.
 *
 * @param context - context of the extension
 * @param vscode - VS Code's API, which only exists inside its extension host
 * @returns the controller of the tests
 */
export const activate = async (
    context: Pick<Vscode.ExtensionContext, 'subscriptions'>,
    vscode: typeof Vscode
): Promise<Vscode.TestController | undefined> => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        return undefined;
    }
    const controller = vscode.tests.createTestController('leyman-tests', 'Leyman tests');
    const tests = new SpecTests(vscode, folder.uri.fsPath, controller);
    const syncDocument = async (document: Vscode.TextDocument): Promise<void> => {
        if (document.uri.scheme === 'file' && isSpec(document.uri.fsPath)) {
            await tests.syncFile(document.uri, document.getText());
        }
    };

    controller.resolveHandler = async item => {
        if (item?.uri) {
            await tests.syncFile(item.uri);
        }
    };
    const watcher = vscode.workspace.createFileSystemWatcher(SPEC_GLOB);
    const onDisk = async (uri: Vscode.Uri): Promise<void> => {
        if (isSpec(uri.fsPath)) {
            await tests.syncFile(uri);
        }
    };
    context.subscriptions.push(
        controller,
        controller.createRunProfile(
            'Run',
            vscode.TestRunProfileKind.Run,
            async (request, token) => tests.run(request, token, false),
            true
        ),
        controller.createRunProfile(
            'Debug',
            vscode.TestRunProfileKind.Debug,
            async (request, token) => tests.run(request, token, true),
            true
        ),
        watcher,
        watcher.onDidCreate(onDisk),
        watcher.onDidChange(onDisk),
        watcher.onDidDelete(uri => {
            tests.removeFile(uri);
        }),
        vscode.workspace.onDidOpenTextDocument(syncDocument),
        vscode.workspace.onDidChangeTextDocument(async ({ document }) => syncDocument(document))
    );

    const uris = await vscode.workspace.findFiles(SPEC_GLOB, SPEC_EXCLUDE);
    await Promise.all(uris.map(async uri => tests.addFile(uri)));
    await Promise.all(vscode.workspace.textDocuments.map(async document => syncDocument(document)));
    return controller;
};
