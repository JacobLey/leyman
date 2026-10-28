---
name: cli
description: Structure of a package's command line interface (yargs commands collected by a haywire list, launched with haywire-launcher)
---

# CLIs

Every package with a `bin` builds its CLI the same way. [`apps/nx-lifecycle`](../../../apps/nx-lifecycle/) is the reference, as it has more than one command. [`apps/barrelify`](../../../apps/barrelify/) and [`apps/populate-files/load-populate-files`](../../../apps/populate-files/load-populate-files/) follow the same shape with a single command.

The CLI never lists its commands. Each command adds itself to a [haywire list](../../../tools/haywire/README.md#lists), and the CLI receives the whole list. Adding a command touches the command's file and the container, never `cli.ts`.

## Files

| File | Contents |
|------|----------|
| `bin.mjs` | `#!/usr/bin/env node`, re-exporting `default` from `./dist/bin.js`. Listed in `package.json` `bin` and `files` |
| `src/bin.ts` | `export default launch(cliContainer, MyCli)`, from `haywire-launcher`. The container is only resolved once the script runs as the entry point |
| `src/cli.ts` | The `MyCli` class (`implements Main`) and its binding |
| `src/container.ts` | `cliModule`, adding the CLI and every command binding, and `cliContainer` |
| `src/commands/lib/types.ts` | The input shared by every command, the `Command` type, `RegisterCommand` and `commandId` |
| `src/commands/<name>-command.ts` | One command and its binding |

## Commands

A command is a plain yargs command module, typed as `Command<ExtendedInput>`, where `ExtendedInput` extends the shared input with the command's own options.

Commands can't be collected directly, as each handler takes a different input. The list holds a function that registers the command on the CLI, so every command stays type-checked against its own input:

```ts
// src/commands/lib/types.ts
export type RegisterCommand = (cli: Argv<MyCommandInput>) => Argv<MyCommandInput>;
export const commandId = identifier<RegisterCommand>().list();

// src/commands/foo-command.ts
export const fooCommand: Command<FooCommandExtendedInput> = { command: 'foo', /* ... */ };
export const fooCommandBinding = bind(commandId).withInstance(cli => cli.command(fooCommand));
```

The CLI class sets the options shared by every command, then applies each command in turn:

```ts
// src/cli.ts
export class MyCli implements Main {
    readonly #commands: readonly RegisterCommand[];

    public constructor(commands: readonly RegisterCommand[]) {
        this.#commands = commands;
    }

    public async main(argv: string[]): Promise<void> {
        let cli: Argv<MyCommandInput> = yargs().scriptName('my-cli') /* shared options, .strict().help()... */;
        for (const register of this.#commands) {
            cli = register(cli);
        }
        await cli.parseAsync(argv, {}, MyCli.#yargsOutput);
    }
}

export const myCliBinding = bind(MyCli).withDependencies([commandId]).withConstructorProvider();
```

haywire does not guarantee the order of list elements from separate bindings, so don't depend on command order (it only affects the order of `--help`).

Don't validate options with `.check()`: while [yargs#1975](https://github.com/yargs/yargs/issues/1975) is open, a failing check still runs the handler whenever `parseAsync` is given a callback, as above. Validate in the handler instead: print the problem with `console.error`, set `process.exitCode = 1` and return. Validation yargs does itself (`demandOption`, `choices`, `.strict()`) is unaffected.

Commands themselves only take dependencies from haywire when they meet the [DI bar](../coding-patterns/SKILL.md#dependency-injection-when-to-use-it-when-not-to). Otherwise they import directly.

## Tests

- `test/unit/container.spec.ts` runs `cliContainer.check()`, which catches wiring a type check can't.
- `test/integration/cli.spec.ts` runs `./bin.mjs` as a subprocess. With more than one command, assert that `--help` lists every command, so a command missing from the container fails.
