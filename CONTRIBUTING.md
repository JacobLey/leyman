# Contributing to Leyman

Thanks for taking the time to contribute! Bug reports, fixes, docs improvements and new features are all welcome.

By participating in this project you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting bugs and requesting features

Open an [issue](https://github.com/JacobLey/leyman/issues/new/choose) and pick the matching template. Please search existing issues first.

A good bug report gives the package and version, includes a minimal reproduction, and says what you expected to happen.

**Security vulnerabilities should not be reported in public issues.** See the [security policy](./SECURITY.md).

For anything larger than a small fix (a new feature, a new package, or a breaking change), open an issue to discuss it before writing the code. That way no one's time is wasted on a change that won't be merged.

## Development setup

Development happens in the [DevContainer](./.devcontainer/), which installs the expected versions of Node.js, PNPM, Dagger and every other tool:

1. Fork the repository and clone your fork.
2. Open it in VS Code (or any editor that supports Dev Containers) and choose **Reopen in Container**.
3. Install dependencies:

   ```bash
   pnpm i
   ```

Day-to-day work happens in git worktrees, each with its own devcontainer. See the [worktrees skill](./.claude/skills/worktrees/SKILL.md) for how to create and open them.

> **Nx is not globally installed.** It ships with `@leyman/main` and is on `PATH` inside the devcontainer. Use `nx` directly, not `npx nx` or `pnpm exec nx`.

## Making changes

The repo is an [Nx](https://nx.dev) monorepo. Published packages live in [`apps/`](./apps) and [`tools/`](./tools), and private shared configs live in [`leyman/`](./leyman). The [README](./README.md#packages) lists each package and where it lives.

Conventions are documented as skills in [`.claude/skills/`](./.claude/skills), indexed in [`AGENTS.md`](./AGENTS.md). They are written for coding agents but are just as useful to people. The most relevant ones are:

- [Coding patterns](./.claude/skills/coding-patterns/SKILL.md): package design, types, dependency injection and docs
- [Testing](./.claude/skills/testing/SKILL.md): Mocha, Sinon and 100% coverage with C8
- [Linting and formatting](./.claude/skills/linting-formatting/SKILL.md): ESLint and Biome
- [Writing READMEs](./.claude/skills/writing-readmes/SKILL.md) and [docs site pages](./.claude/skills/docs-site/SKILL.md)

Some things to keep in mind:

- Every published package requires **100% test coverage**.
- Update the package's README, and its [docs site](./docs) pages if it has them, when you change its behaviour or API.
- Prefer non-breaking changes. When a breaking change is necessary, keep it in its own commit and explain why it is needed.

## Verifying your changes

Run the full suite (build, lint, type-check, test and coverage) across the workspace:

```bash
test-ci
```

`test-and-fix` runs the same checks but auto-fixes lint and formatting problems where it can. Nx caches results, so later runs only redo what changed.

CI runs the same pipeline in [Dagger](https://dagger.io). To run it locally before pushing:

```bash
dagger-test
```

See the [Nx tasks skill](./.claude/skills/nx-run-tasks/SKILL.md) for running tasks on a single package.

## Changesets

Releases are managed with [Changesets](https://github.com/changesets/changesets). Any change to a published package's behaviour, API or runtime dependencies needs a changeset:

```bash
changeset
```

Follow the prompts to pick the affected packages and the semver bump, then write a short description for the changelog. Commit the generated file in `.changeset/` along with your change.

Changes that only touch tests, dev tooling, configs, CI, devDependencies or the private `leyman/` packages don't need a changeset. See the [versioning skill](./.claude/skills/versioning/SKILL.md) for details.

## Submitting a pull request

1. Create a branch from `main`.
2. Keep each commit focused on one thing, with a message that explains what changed and why.
3. Make sure `test-ci` passes and you've added a changeset if one is needed.
4. Open a pull request against `main` and fill out the template.

CI must pass before a pull request is merged. After merge, CI opens a "Version Packages" pull request. Merging that publishes the new versions to npm.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
