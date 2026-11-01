// CI pipeline for the leyman monorepo.
//
// Nx decides what to build and test; this module only provides a clean, pinned environment to run it in.
package main

import (
	"context"
	"dagger/ci/internal/dagger"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"slices"
	"sort"
	"strings"

	"golang.org/x/sync/errgroup"
)

// Keep in sync with `.devcontainer/Dockerfile` (see the devcontainer skill).
const (
	// debian:trixie-slim, the Debian release the Node and Go images are built on. The CI image starts from it and copies
	// in Node, pnpm and Go last, so bumping one doesn't rerun the apt installs.
	debianImage = "debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad"
	// node:24.22.1-trixie-slim.
	nodeImage = "node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea"
	// Outside the lockfile, so `minimumReleaseAge` can't check it: only bump to a release at least 7 days old.
	pnpmVersion = "12.15.0"
	// Keep in sync with `playwright` in `pnpm-workspace.yaml`: a client connects only to a server of its own version.
	playwrightVersion = "1.64.1"
	// mcr.microsoft.com/playwright:v1.64.1-noble, with every browser and its system libraries, for tests to connect to.
	// Keep its version in sync with `playwrightVersion`.
	playwrightImage = "mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea"
	// golang:1.27.3-trixie.
	// Only its Go toolchain is copied into the Node image, for projects written in Go.
	// The same Go minor as the Dagger engine (`GolangVersion` in its `engine/distconsts/consts.go`), which builds this
	// module. Keep in sync with `GO_IMAGE` in `.devcontainer/Dockerfile`.
	goImage = "golang:1.27.3-trixie@sha256:fbb7ae40b62ff8afe31662df570d39b4f5052ac32b90dae8e60d7657a20a74f4"
	// Downloaded with the Go toolchain, at a release at least 7 days old. Checksums are of each release's
	// `linux-*.tar.gz`: amd64 for CI, arm64 for `dagger-test` on a Mac.
	golangciLintVersion     = "2.15.0"
	golangciLintAmd64Sha256 = "9b7fe6a6bf6334b98decf8d86b11415ea7889afdabdd1959fdce23af2a9ebcea"
	golangciLintArm64Sha256 = "b4d8f17068b35ee6060cc2f69a16fb48740d706fbba81661c318649c114a6998"
	// rust:1.99.1-trixie.
	// Only its toolchain is copied into the Node image, for projects written in Rust.
	rustImage = "rust:1.99.1-trixie@sha256:09027f873d45b8ecd1dc86f1fa13b7a62b875c961f017a0e331267b350430137"
	// Downloaded with the toolchain, at a release at least 7 days old. Compiling these two takes over 2 minutes of every CI
	// job. Checksums are of each release's `*-unknown-linux-musl.tar.gz`: amd64 for CI, arm64 for `dagger-test` on a Mac.
	cargoLlvmCovVersion     = "0.9.1"
	cargoLlvmCovAmd64Sha256 = "3fca950394a3c49457657c158b1619cec8dfd2647ae5b48746734c0ab969a522"
	cargoLlvmCovArm64Sha256 = "49c0085628392a8d727c4464d91ec417c613c5015f5197cd16d5c05aa3fb5ad1"
	// Must match the `wasm-bindgen` crate in `Cargo.lock`.
	wasmBindgenVersion     = "0.2.129"
	wasmBindgenAmd64Sha256 = "82d12bb940e2d4e72e0d5605387fc1b8ca179044e012b620f0ce4e7440e8320e"
	wasmBindgenArm64Sha256 = "2ed4351c35dd9440308bbb02767d47ea278efe851a52465300f3c94f5b6c2a87"
	// ghcr.io/opentofu/opentofu:1.13.2-minimal, for `infra/`. Keep in sync with `TOFU_IMAGE` in `.devcontainer/Dockerfile`.
	tofuImage = "ghcr.io/opentofu/opentofu:1.13.2-minimal@sha256:622dc6bb98b105c18f53cf419ab64a4f3b88bd9f8c16cc978cf89e4202f4613f"
	// valkey/valkey:9.1.2-trixie. Keep in sync with the `valkey` service in `.devcontainer/docker-compose.yml`.
	valkeyImage = "valkey/valkey:9.1.2-trixie@sha256:418652cfb58ef879d4978c33553735d7147016032d5aefaa14c828e611eb9dfd"
	// postgres:18.6-trixie. Keep in sync with the `postgres` service in `.devcontainer/docker-compose.yml`.
	postgresImage = "postgres:18.6-trixie@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336"
	// Client tools (`psql`, `pg_dump`) from the PostgreSQL apt repository: `pg_dump` must be at least the server's
	// major version. Keep in sync with `POSTGRES_MAJOR` in `.devcontainer/Dockerfile`.
	postgresMajor = "18"
)

const (
	workdir     = "/workspace"
	storeDir    = "/pnpm-store"
	cacheDir    = "/pnpm-cache"
	tarballDir  = "/tarballs"
	goRoot      = "/usr/local/go"
	rustupHome  = "/usr/local/rustup"
	cargoHome   = "/usr/local/cargo"
	pnpmDir     = "/usr/local/pnpm"
	npmRegistry = "https://registry.npmjs.org"
	// Same as the devcontainer's. A fixed password: the service only lives as long as the test run.
	//nolint:gosec // Not a secret, as above
	databaseURL = "postgres://postgres:postgres@postgres:5432/postgres"
)

type Ci struct {
	// Repository source, filtered by .gitignore
	Source *dagger.Directory
}

func New(
	// Repository root
	// +defaultPath="/"
	// Skip uploading the largest ignored paths; .gitignore is applied in full below
	// +ignore=["/.git", "/.claude-config", "**/node_modules", "/.pnpm-store", "/.nx/*", "!/.nx/installation", "/.coverage", "**/dist", "**/dist-test", "**/coverage"]
	source *dagger.Directory,
) *Ci {
	return &Ci{
		Source: source.Filter(dagger.DirectoryFilterOpts{
			Gitignore: true,
			// Version controlled, but irrelevant to CI. Excluding them keeps unrelated edits from invalidating the cache.
			// The docs build skips its existence check for registry paths in these directories (`ciExcluded` in
			// `docs/.vitepress/config.ts`), so keep the two lists in step.
			Exclude: []string{
				".git",
				".claude",
				".devcontainer",
				".github",
				".vscode",
				"dagger",
				// Root files only: patterns are relative to the root, and a leading slash never matches
				"AGENTS.md",
				"CLAUDE.md",
				"README.md",
			},
		}),
	}
}

// Run the full CI pipeline: install, build, test, and verify generated lifecycle config is up to date.
func (m *Ci) Test(
	ctx context.Context,
	// Nx remote cache server to share task results with (e.g. `tcp://localhost:3000`, see `.devcontainer/nx-cache-server.mjs`).
	// Omitted, every task runs.
	// +optional
	nxCache *dagger.Service,
) error {
	// Pending changesets don't affect tests, so keep them from invalidating the cache
	ctr := withNxCache(m.installed(m.Source.WithoutDirectory(".changeset")), nxCache)
	// Some targets run against real services, at the same hostnames as the devcontainer's sidecars
	built := withPostgres(ctr).WithExec([]string{"nx", "run-many", "-t", "build"})

	group, ctx := errgroup.WithContext(ctx)
	group.Go(func() error {
		_, err := built.
			WithServiceBinding("valkey", valkeyService()).
			// Browser tests connect to it rather than launching their own, so `playwright-install` downloads none
			WithServiceBinding("playwright", playwrightService()).
			WithEnvVariable("PW_TEST_CONNECT_WS_ENDPOINT", "ws://playwright:3000/").
			WithExec([]string{"test-ci"}).
			Sync(ctx)

		return err
	})
	group.Go(func() error {
		_, err := built.WithExec([]string{"nx", "run", "@leyman/main:lifecycle"}).Sync(ctx)

		return err
	})

	return group.Wait()
}

// Build the documentation site (`docs/`), type-checking every example, ready to deploy as static files.
//
// Export it (`docs export --path ./site`) to upload to GitHub Pages.
func (m *Ci) Docs(
	// Nx remote cache server to share task results with, as for `test`. Omitted, every task runs.
	// +optional
	nxCache *dagger.Service,
) *dagger.Directory {
	return withPostgres(withNxCache(m.installed(m.Source.WithoutDirectory(".changeset")), nxCache)).
		WithExec([]string{"nx", "run", "@leyman/docs:build"}).
		Directory(workdir + "/docs/dist")
}

// Deploy the hosted Nx cache's Worker (`infra/nx-cache/worker`) to Cloudflare, with wrangler.
//
// The token may only deploy Workers (OpenTofu creates it, see `infra/nx-cache/tofu`).
func (m *Ci) DeployNxCache(
	ctx context.Context,
	// Cloudflare API token that may deploy Workers
	apiToken *dagger.Secret,
	// Cloudflare account to deploy to
	accountID string,
) (string, error) {
	return m.installed(m.Source.WithoutDirectory(".changeset")).
		WithExec([]string{"nx", "run", "@leyman/nx-cache-worker:build"}).
		WithWorkdir(workdir+"/infra/nx-cache/worker").
		WithSecretVariable("CLOUDFLARE_API_TOKEN", apiToken).
		WithEnvVariable("CLOUDFLARE_ACCOUNT_ID", accountID).
		WithEnvVariable("WRANGLER_SEND_METRICS", "false").
		WithExec([]string{"node_modules/.bin/wrangler", "deploy"}).
		Stdout(ctx)
}

// Apply the committed changesets at HEAD: bump package versions and write changelogs.
//
// Export the result over a checkout of HEAD (`version export --path .`) to open a version PR.
func (m *Ci) Version(
	// Repository with full history; changelogs reference the commit that added each changeset
	// +defaultPath="/"
	repo *dagger.GitRepository,
) *dagger.Changeset {
	tree := repo.Head().Tree(dagger.GitRefTreeOpts{Depth: -1})
	source := tree.WithoutDirectory(".git")

	versioned := m.installed(source).
		WithExec([]string{"sh", "-c", "apt-get update && apt-get install --yes --no-install-recommends git"}).
		WithExec([]string{"git", "config", "--global", "--add", "safe.directory", workdir}).
		WithDirectory(workdir+"/.git", tree.Directory(".git")).
		// `changeset version` fails without pending changesets, which leaves nothing to change (and no version PR)
		WithExec([]string{"sh", "-c", "if ls .changeset/*.md >/dev/null 2>&1; then changeset version; fi"}).
		Directory(workdir).
		Filter(dagger.DirectoryFilterOpts{
			Gitignore: true,
			Exclude:   []string{".git", "**/node_modules"},
		})

	return versioned.Changes(source)
}

// GitHub rejects PR bodies over 65536 characters.
const maxNotesLength = 65000

// Describe what `version` would release, as the body of a version PR: each public package's version bump,
// then the changelog section added for it.
func (m *Ci) VersionNotes(
	ctx context.Context,
	// Repository with full history, as for `version`
	// +defaultPath="/"
	repo *dagger.GitRepository,
) (string, error) {
	changes := m.Version(repo)

	paths, err := changes.ModifiedPaths(ctx)
	if err != nil {
		return "", err
	}

	releases := []release{}

	for _, file := range paths {
		if path.Base(file) != "package.json" {
			continue
		}

		found, err := releaseIn(ctx, changes, file)
		if err != nil {
			return "", err
		}

		if found != nil {
			releases = append(releases, *found)
		}
	}

	return releaseNotes(releases), nil
}

// One package's version bump in a version PR.
type release struct {
	name, from, to, bump, changelog string
}

// What the change to a package.json releases, if anything.
func releaseIn(ctx context.Context, changes *dagger.Changeset, file string) (*release, error) {
	var before, after workspacePackage
	if err := readJSON(ctx, changes.Before().File(file), &before); err != nil {
		return nil, err
	}

	if err := readJSON(ctx, changes.After().File(file), &after); err != nil {
		return nil, err
	}
	// Private packages are only bumped for their internal dependencies, and never published
	if after.Private || before.Version == after.Version {
		return nil, nil //nolint:nilnil // Having nothing to release isn't a failure
	}

	changelog, err := changelogSection(ctx, changes.After(), path.Dir(file), after.Version)
	if err != nil {
		return nil, err
	}

	return &release{after.Name, before.Version, after.Version, bumpType(before.Version, after.Version), changelog}, nil
}

// The summary table, then each package's changelog while they fit in a PR body.
func releaseNotes(releases []release) string {
	bumpRank := func(bump string) int { return slices.Index([]string{"major", "minor", "patch"}, bump) }
	// Biggest bumps first, as they need the most review
	sort.Slice(releases, func(i, j int) bool {
		if rank, other := bumpRank(releases[i].bump), bumpRank(releases[j].bump); rank != other {
			return rank < other
		}

		return releases[i].name < releases[j].name
	})

	summary := make([]string, 0, len(releases)+1)
	summary = append(summary, "Merging this PR publishes the packages below to npm.\n\n| Package | Bump | Version |\n| --- | --- | --- |")
	notes := make([]string, 0, len(releases))

	for _, r := range releases {
		summary = append(summary, fmt.Sprintf("| `%s` | %s | %s → **%s** |", r.name, r.bump, r.from, r.to))
		notes = append(notes, strings.TrimSpace(fmt.Sprintf("## %s@%s\n\n%s", r.name, r.to, r.changelog)))
	}

	body := strings.Join(append([]string{strings.Join(summary, "\n")}, notes...), "\n\n")
	if len(body) > maxNotesLength {
		return strings.Join(summary, "\n") +
			"\n\nThe changelogs are too long to include here; see each package's CHANGELOG.md in this PR."
	}

	return body
}

// The most significant part of a release version that changed: `major`, `minor` or `patch`.
func bumpType(from string, to string) string {
	before, after := strings.Split(from, "."), strings.Split(to, ".")
	for i, bump := range []string{"major", "minor"} {
		if i >= len(before) || i >= len(after) || before[i] != after[i] {
			return bump
		}
	}

	return "patch"
}

func readJSON(ctx context.Context, file *dagger.File, target any) error {
	contents, err := file.Contents(ctx)
	if err != nil {
		return err
	}

	if err := json.Unmarshal([]byte(contents), target); err != nil {
		return fmt.Errorf("parsing %w", err)
	}

	return nil
}

// The body of the `## <version>` section of a package's CHANGELOG.md, if it has one.
func changelogSection(ctx context.Context, dir *dagger.Directory, pkg string, version string) (string, error) {
	file := path.Join(pkg, "CHANGELOG.md")
	if exists, err := dir.Exists(ctx, file); err != nil || !exists {
		return "", err
	}

	changelog, err := dir.File(file).Contents(ctx)
	if err != nil {
		return "", err
	}

	_, section, found := strings.Cut(changelog, "\n## "+version+"\n")
	if !found {
		return "", nil
	}

	if next := strings.Index(section, "\n## "); next != -1 {
		section = section[:next]
	}

	return strings.TrimSpace(section), nil
}

// Publish every public package whose current version is not yet on npm, from a fresh (uncached) build.
//
// Returns a line per package: `published <name>@<version>`, or `failed <name>@<version>: <error>` for the first one
// npm rejects, after which nothing more is published. A failure is in the output, not an error, so the packages
// published before it are still listed (to be tagged); the caller must fail on a `failed` line.
//
// A version below the package's `latest` (a patch to an older major) is published under a `release-<major>` dist-tag,
// so `latest` stays where it is.
//
// Never cached: what needs publishing depends on the registry, not just the inputs.
// +cache="never"
func (m *Ci) Publish(
	ctx context.Context,
	// Pack and validate with `npm publish --dry-run`, without publishing
	// +optional
	dryRun bool,
	// GitHub Actions environment (GITHUB_*, RUNNER_*, ACTIONS_ID_TOKEN_REQUEST_*) as a file bash can source.
	// Lets npm authenticate with trusted publishing (OIDC) and attach provenance.
	// +optional
	githubEnv *dagger.Secret,
) (string, error) {
	if githubEnv == nil && !dryRun {
		return "", errors.New("publishing requires --github-env for npm trusted publishing (or use --dry-run)")
	}

	// Check the registry before building, so pushes with nothing to publish skip the uncached build
	installed := m.installed(m.Source)

	unpublished, err := m.unpublishedPackages(ctx, installed)
	if err != nil {
		return "", err
	}

	if len(unpublished) == 0 {
		return "", nil
	}

	built := withPostgres(installed).WithExec([]string{"nx", "run-many", "-t", "build", "--skip-nx-cache"})

	// pnpm resolves `workspace:` and `catalog:` specifiers while packing. Each package gets its own directory, so
	// its tarball is known by package rather than by file name.
	packer := built
	for i, pkg := range unpublished {
		packer = packer.
			WithWorkdir(pkg.Path).
			WithExec([]string{"pnpm", "pack", "--pack-destination", tarballPath(i)})
	}

	return publishTarballs(ctx, unpublished, packer.Directory(tarballDir), dryRun, githubEnv), nil
}

// Publishes the tarballs with npm, which handles trusted publishing (OIDC) with provenance, up to the first failure.
func publishTarballs(
	ctx context.Context,
	pkgs []workspacePackage,
	tarballs *dagger.Directory,
	dryRun bool,
	githubEnv *dagger.Secret,
) string {
	publisher := dag.Container().
		From(nodeImage).
		WithDirectory(tarballDir, tarballs)

	publishCmd := `npm publish "$1"/*.tgz --access public ${2:+--tag "$2"}`
	if dryRun {
		publishCmd += " --dry-run"
	}

	if githubEnv != nil {
		publisher = publisher.WithMountedSecret("/run/secrets/github-env", githubEnv)
		publishCmd = "set -a && . /run/secrets/github-env && set +a && " + publishCmd + " --provenance"
	}

	results := []string{}

	for i, pkg := range pkgs {
		distTag, err := publishDistTag(ctx, pkg)
		if err == nil {
			_, err = publisher.WithExec([]string{"bash", "-c", publishCmd, "bash", tarballPath(i), distTag}).Sync(ctx)
		}

		if err != nil {
			// On one line, so it can't be mistaken for another package's result
			results = append(results, fmt.Sprintf("failed %s@%s: %s", pkg.Name, pkg.Version, strings.Join(strings.Fields(err.Error()), " ")))

			break
		}

		results = append(results, fmt.Sprintf("published %s@%s", pkg.Name, pkg.Version))
	}

	return strings.Join(results, "\n")
}

// Where `Publish` packs the i-th package.
func tarballPath(i int) string {
	return fmt.Sprintf("%s/%d", tarballDir, i)
}

type workspacePackage struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Path    string `json:"path"`
	Private bool   `json:"private"`
}

// Public workspace packages whose current version is not on the registry.
func (m *Ci) unpublishedPackages(ctx context.Context, ctr *dagger.Container) ([]workspacePackage, error) {
	out, err := ctr.WithExec([]string{"pnpm", "ls", "--recursive", "--depth", "-1", "--json"}).Stdout(ctx)
	if err != nil {
		return nil, err
	}

	var pkgs []workspacePackage
	if err := json.Unmarshal([]byte(out), &pkgs); err != nil {
		return nil, fmt.Errorf("parsing workspace packages: %w", err)
	}

	unpublished := []workspacePackage{}

	for _, pkg := range pkgs {
		if pkg.Private {
			continue
		}

		exists, err := versionExists(ctx, pkg)
		if err != nil {
			return nil, err
		}

		if !exists {
			unpublished = append(unpublished, pkg)
		}
	}

	return inDependencyOrder(ctx, ctr, unpublished)
}

// The dependencies a package needs once installed from npm: all but `devDependencies`.
type publishedDependencies struct {
	Dependencies         map[string]string `json:"dependencies"`
	PeerDependencies     map[string]string `json:"peerDependencies"`
	OptionalDependencies map[string]string `json:"optionalDependencies"`
}

// Sorts packages so each comes after the packages it depends on, and otherwise by name. `Publish` stops at the
// first failure, so a package is never published while a dependency it needs isn't.
func inDependencyOrder(ctx context.Context, ctr *dagger.Container, pkgs []workspacePackage) ([]workspacePackage, error) {
	byName := map[string]workspacePackage{}
	for _, pkg := range pkgs {
		byName[pkg.Name] = pkg
	}

	needs, err := dependenciesWithin(ctx, ctr, pkgs, byName)
	if err != nil {
		return nil, err
	}

	sorted := []workspacePackage{}

	done := map[string]bool{}
	for len(sorted) < len(pkgs) {
		ready := readyPackages(byName, needs, done)
		if len(ready) == 0 {
			return nil, fmt.Errorf("workspace packages depend on each other in a cycle: %v", needs)
		}

		for _, name := range ready {
			done[name] = true
			sorted = append(sorted, byName[name])
		}
	}

	return sorted, nil
}

// Each package's dependencies being published with it, as only those can be out of order.
func dependenciesWithin(
	ctx context.Context,
	ctr *dagger.Container,
	pkgs []workspacePackage,
	byName map[string]workspacePackage,
) (map[string][]string, error) {
	needs := map[string][]string{}

	for _, pkg := range pkgs {
		var deps publishedDependencies
		if err := readJSON(ctx, ctr.File(pkg.Path+"/package.json"), &deps); err != nil {
			return nil, err
		}

		for _, group := range []map[string]string{deps.Dependencies, deps.PeerDependencies, deps.OptionalDependencies} {
			for name := range group {
				if _, ok := byName[name]; ok && name != pkg.Name {
					needs[pkg.Name] = append(needs[pkg.Name], name)
				}
			}
		}
	}

	return needs, nil
}

// The packages not yet done whose dependencies all are, by name.
func readyPackages(byName map[string]workspacePackage, needs map[string][]string, done map[string]bool) []string {
	ready := []string{}

	for name := range byName {
		if !done[name] && !slices.ContainsFunc(needs[name], func(dep string) bool { return !done[dep] }) {
			ready = append(ready, name)
		}
	}

	sort.Strings(ready)

	return ready
}

// Fetches a package document from the registry. The caller closes the body.
func npmGet(ctx context.Context, name string, document string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, npmRegistry+"/"+url.PathEscape(name)+"/"+document, nil)
	if err != nil {
		return nil, fmt.Errorf("requesting %s@%s from npm: %w", name, document, err)
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("requesting %s@%s from npm: %w", name, document, err)
	}

	return res, nil
}

func versionExists(ctx context.Context, pkg workspacePackage) (bool, error) {
	res, err := npmGet(ctx, pkg.Name, pkg.Version)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusNotFound:
		return false, nil
	default:
		return false, fmt.Errorf("checking %s@%s on npm: %s", pkg.Name, pkg.Version, res.Status)
	}
}

// The dist-tag to publish a package's version under. Empty means npm's default, `latest`.
func publishDistTag(ctx context.Context, pkg workspacePackage) (string, error) {
	res, err := npmGet(ctx, pkg.Name, "latest")
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusOK:
		var latest struct {
			Version string `json:"version"`
		}
		if err := json.NewDecoder(res.Body).Decode(&latest); err != nil {
			return "", fmt.Errorf("parsing latest %s on npm: %w", pkg.Name, err)
		}

		return distTagFor(pkg.Version, latest.Version)
	case http.StatusNotFound:
		// Never published, so nothing to keep `latest` on
		return "", nil
	default:
		return "", fmt.Errorf("checking latest %s on npm: %s", pkg.Name, res.Status)
	}
}

// Empty for a version at or above `latest`, otherwise the dist-tag of its release line: `release-<major>`, or
// `release-0.<minor>` below 1.0, where each minor is its own line. Prerelease suffixes are not compared.
func distTagFor(version string, latest string) (string, error) {
	var current, newest [3]int
	if _, err := fmt.Sscanf(version, "%d.%d.%d", &current[0], &current[1], &current[2]); err != nil {
		return "", fmt.Errorf("parsing version %q: %w", version, err)
	}

	if _, err := fmt.Sscanf(latest, "%d.%d.%d", &newest[0], &newest[1], &newest[2]); err != nil {
		return "", fmt.Errorf("parsing version %q: %w", latest, err)
	}

	if slices.Compare(current[:], newest[:]) >= 0 {
		return "", nil
	}

	if current[0] == 0 {
		return fmt.Sprintf("release-0.%d", current[1]), nil
	}

	return fmt.Sprintf("release-%d", current[0]), nil
}

// Binds Postgres at the devcontainer's hostname, with `DATABASE_URL` pointing at it. Every build needs it, not only
// tests: `prepare` (which the build runs) snapshots schemas from migrations.
func withPostgres(ctr *dagger.Container) *dagger.Container {
	return ctr.
		WithServiceBinding("postgres", postgresService()).
		WithEnvVariable("DATABASE_URL", databaseURL)
}

// Valkey for tests, with nothing persisted, matching the devcontainer's `valkey` sidecar.
func valkeyService() *dagger.Service {
	return dag.Container().
		From(valkeyImage).
		WithExposedPort(6379).
		AsService(dagger.ContainerAsServiceOpts{
			Args: []string{"valkey-server", "--save", "", "--appendonly", "no"},
		})
}

// A Playwright server, which launches whichever browser a test connects for (chromium, firefox or webkit). The image
// has every browser and the system libraries they need, so the tests' container needs neither.
func playwrightService() *dagger.Service {
	return dag.Container().
		From(playwrightImage).
		WithUser("pwuser").
		WithWorkdir("/home/pwuser").
		WithExposedPort(3000).
		AsService(dagger.ContainerAsServiceOpts{
			Args: []string{"npx", "--yes", "playwright@" + playwrightVersion, "run-server", "--port", "3000", "--host", "0.0.0.0"},
		})
}

// Postgres for tests, with nothing persisted and durability off, matching the devcontainer's `postgres` sidecar.
func postgresService() *dagger.Service {
	return dag.Container().
		From(postgresImage).
		WithEnvVariable("POSTGRES_PASSWORD", "postgres").
		WithMountedTemp("/var/lib/postgresql").
		WithExposedPort(5432).
		AsService(dagger.ContainerAsServiceOpts{
			// The image's entrypoint creates the cluster before starting the server
			UseEntrypoint: true,
			Args: []string{
				"postgres",
				"-c", "fsync=off",
				"-c", "synchronous_commit=off",
				"-c", "full_page_writes=off",
				"-c", "max_connections=500",
			},
		})
}

// Points Nx at a remote cache server, if there is one.
func withNxCache(ctr *dagger.Container, nxCache *dagger.Service) *dagger.Container {
	if nxCache == nil {
		return ctr
	}

	return ctr.
		WithServiceBinding("nx-cache", nxCache).
		WithEnvVariable("NX_SELF_HOSTED_REMOTE_CACHE_SERVER", "http://nx-cache:3000")
}

// Postgres client tools on Debian, with nothing else installed yet.
func system() *dagger.Container {
	return dag.Container().
		From(debianImage).
		WithEnvVariable("CI", "1").
		WithExec([]string{"sh", "-c", "apt-get update" +
			" && apt-get install --yes --no-install-recommends ca-certificates postgresql-common" +
			" && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y" +
			" && apt-get install --yes --no-install-recommends postgresql-client-" + postgresMajor +
			// `cargo test` links with `cc`. Building WASM doesn't need it, with its own bundled linker
			" && apt-get install --yes --no-install-recommends gcc libc6-dev"})
}

// The Go toolchain, with the same golangci-lint release as the devcontainer's.
func goToolchain() *dagger.Container {
	return dag.Container().
		From(goImage).
		WithExec([]string{"sh", "-c", `set -e
case "$(uname -m)" in
	x86_64) arch=amd64 sha256=` + golangciLintAmd64Sha256 + ` ;;
	aarch64) arch=arm64 sha256=` + golangciLintArm64Sha256 + ` ;;
	*) echo "No pinned golangci-lint for $(uname -m)" >&2; exit 1 ;;
esac
release="golangci-lint-` + golangciLintVersion + `-linux-$arch"
curl --fail --silent --show-error --location --retry 3 --output /tmp/golangci-lint.tar.gz \
	"https://github.com/golangci/golangci-lint/releases/download/v` + golangciLintVersion + `/$release.tar.gz"
echo "$sha256  /tmp/golangci-lint.tar.gz" | sha256sum --check --quiet
tar --extract --gzip --file /tmp/golangci-lint.tar.gz --directory ` + goRoot + `/bin --strip-components=1 "$release/golangci-lint"
rm /tmp/golangci-lint.tar.gz`})
}

// The Rust toolchain, with the same components and tools as the devcontainer's, and no crates downloaded. The tools are
// the releases' prebuilt binaries, where the devcontainer compiles the same versions once per image.
func rustToolchain() *dagger.Container {
	return dag.Container().
		From(rustImage).
		WithExec([]string{"sh", "-c", "rustup component add rustfmt clippy llvm-tools-preview" +
			" && rustup target add wasm32-unknown-unknown"}).
		WithExec([]string{"sh", "-c", `set -e
case "$(uname -m)" in
	x86_64) target=x86_64-unknown-linux-musl llvm_cov_sha256=` + cargoLlvmCovAmd64Sha256 + ` wasm_bindgen_sha256=` + wasmBindgenAmd64Sha256 + ` ;;
	aarch64) target=aarch64-unknown-linux-musl llvm_cov_sha256=` + cargoLlvmCovArm64Sha256 + ` wasm_bindgen_sha256=` + wasmBindgenArm64Sha256 + ` ;;
	*) echo "No pinned Rust tools for $(uname -m)" >&2; exit 1 ;;
esac
curl --fail --silent --show-error --location --retry 3 --output /tmp/llvm-cov.tar.gz \
	"https://github.com/taiki-e/cargo-llvm-cov/releases/download/v` + cargoLlvmCovVersion + `/cargo-llvm-cov-$target.tar.gz"
echo "$llvm_cov_sha256  /tmp/llvm-cov.tar.gz" | sha256sum --check --quiet
tar --extract --gzip --file /tmp/llvm-cov.tar.gz --directory ` + cargoHome + `/bin cargo-llvm-cov
curl --fail --silent --show-error --location --retry 3 --output /tmp/wasm-bindgen.tar.gz \
	"https://github.com/wasm-bindgen/wasm-bindgen/releases/download/` + wasmBindgenVersion + `/wasm-bindgen-` + wasmBindgenVersion + `-$target.tar.gz"
echo "$wasm_bindgen_sha256  /tmp/wasm-bindgen.tar.gz" | sha256sum --check --quiet
tar --extract --gzip --file /tmp/wasm-bindgen.tar.gz --directory ` + cargoHome + `/bin --strip-components=1 --wildcards '*/wasm-bindgen' '*/wasm-bindgen-test-runner' '*/wasm2es6js'
rm /tmp/llvm-cov.tar.gz /tmp/wasm-bindgen.tar.gz`})
}

// Adds Go, Rust, pnpm, Node and OpenTofu, matching the devcontainer: last, so bumping one reruns only these copies. No npm (as in the
// devcontainer), so nothing silently depends on it.
func withTools(ctr *dagger.Container) *dagger.Container {
	// pnpm is a native binary, installed with npm and copied in with its package
	pnpm := dag.Container().
		From(nodeImage).
		WithExec([]string{"npm", "install", "--global", "pnpm@" + pnpmVersion}).
		Directory("/usr/local/lib/node_modules/pnpm")
	rust := rustToolchain()

	return ctr.
		WithDirectory(goRoot, goToolchain().Directory(goRoot)).
		WithDirectory(rustupHome, rust.Directory(rustupHome)).
		WithDirectory(cargoHome, rust.Directory(cargoHome)).
		WithEnvVariable("RUSTUP_HOME", rustupHome).
		WithEnvVariable("CARGO_HOME", cargoHome).
		// Crates come from `cargo fetch` alone, see `installed`
		WithEnvVariable("CARGO_NET_OFFLINE", "true").
		// Use the pinned toolchain, never one downloaded for a newer `go` directive in a go.mod
		WithEnvVariable("GOTOOLCHAIN", "local").
		WithDirectory(pnpmDir, pnpm).
		WithFile("/usr/local/bin/node", dag.Container().From(nodeImage).File("/usr/local/bin/node")).
		WithFile("/usr/local/bin/tofu", dag.Container().From(tofuImage).File("/usr/local/bin/tofu")).
		WithEnvVariable("PATH", "${PATH}:"+goRoot+"/bin:"+cargoHome+"/bin:"+pnpmDir, dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithEnvVariable("pnpm_config_store_dir", storeDir).
		WithEnvVariable("pnpm_config_cache_dir", cacheDir).
		WithWorkdir(workdir)
}

// Node + pnpm + Go + Rust + Postgres client tools, matching the devcontainer.
func (m *Ci) base() *dagger.Container {
	return withTools(system())
}

// Workspace with dependencies installed.
//
// Dependencies are fetched from the lockfile alone, so source-only changes reuse the cached fetch layer.
func (m *Ci) installed(source *dagger.Directory) *dagger.Container {
	lockfiles := source.Filter(dagger.DirectoryFilterOpts{
		// `pnpm fetch` applies `patchedDependencies` too
		Include: []string{"pnpm-lock.yaml", "pnpm-workspace.yaml", "patches/**"},
	})

	// Only keep the store and metadata cache: the `node_modules` that `pnpm fetch` leaves behind makes
	// `pnpm install` skip linking projects. The offline install needs the cached metadata to check the
	// lockfile against the supply-chain policies.
	//
	// Injected workspace packages are `directory:` dependencies, which `pnpm fetch` reads even though it has
	// nothing to download for them. Empty directories satisfy it, keeping this layer independent of the source.
	fetched := m.base().
		WithDirectory(workdir, lockfiles).
		WithExec([]string{"sh", "-c", `grep -oE 'resolution: \{directory: [^,]+' pnpm-lock.yaml | cut -d ' ' -f 3 | xargs -r mkdir -p`}).
		WithExec([]string{"pnpm", "fetch"})

	// As with pnpm, crates are fetched from the lockfile alone. Cargo also reads every manifest of the workspace, each of
	// which needs a library to be valid: empty files satisfy it, keeping this layer independent of the source.
	cargoFiles := source.Filter(dagger.DirectoryFilterOpts{
		Include: []string{"Cargo.lock", "**/Cargo.toml"},
	})
	crates := m.base().
		WithDirectory(workdir, cargoFiles).
		WithEnvVariable("CARGO_NET_OFFLINE", "false").
		WithExec([]string{"sh", "-c", `find . -mindepth 2 -name Cargo.toml -execdir sh -c 'mkdir -p src && touch src/lib.rs' \;`}).
		WithExec([]string{"cargo", "fetch", "--locked"})

	return m.base().
		WithDirectory(storeDir, fetched.Directory(storeDir)).
		WithDirectory(cacheDir, fetched.Directory(cacheDir)).
		WithDirectory(cargoHome+"/registry", crates.Directory(cargoHome+"/registry")).
		WithDirectory(workdir, source).
		WithExec([]string{"pnpm", "install", "--frozen-lockfile", "--offline"}).
		WithEnvVariable("PATH", "${PATH}:"+workdir+"/leyman/main/node_modules/.bin:"+workdir+"/scripts/commands", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		// More Nx tasks than CI's 4 CPUs, since many wait on services or timers: on 4 CPUs, 6 ran `verify` 14% faster than
		// Nx's default of 3
		WithEnvVariable("NX_PARALLEL", "6")
}
