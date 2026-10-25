// CI pipeline for the leyman monorepo.
//
// Nx decides what to build and test; this module only provides a clean, pinned environment to run it in.
package main

import (
	"context"
	"dagger/ci/internal/dagger"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strings"

	"golang.org/x/sync/errgroup"
)

// Keep in sync with `.devcontainer/Dockerfile` (see the devcontainer skill).
const (
	// debian:trixie-slim, the Debian release the Node and Go images are built on. The CI image starts from it and copies
	// in Node, pnpm and Go last, so bumping one doesn't rerun the apt installs.
	debianImage = "debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad"
	// node:24.22.1-trixie-slim. Under 7 days old: an emergency security bump. Drop this note after 2026-10-27.
	nodeImage = "node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea"
	// Outside the lockfile, so `minimumReleaseAge` can't check it: only bump to a release at least 7 days old.
	// 12.9.1 fixes `--frozen-lockfile` rejecting the lockfile of injected workspace packages with `catalog:`
	// peer dependencies.
	pnpmVersion = "12.9.1"
	// Keep in sync with `playwright` in `pnpm-workspace.yaml`. Only installs the browsers' system libraries here;
	// the `playwright-install` target downloads the browsers themselves.
	playwrightVersion = "1.62.1"
	// golang:1.26.10-trixie. Under 7 days old: an emergency security bump. Drop this note after 2026-10-27.
	// Only its Go toolchain is copied into the Node image, for projects written in Go.
	goImage = "golang:1.26.10-trixie@sha256:909771fef53e3dcb0950255f0c9a8b4728c3b841e61509c7b29b098de7ee02d4"
	// ghcr.io/opentofu/opentofu:1.13.2-minimal, for `infra/`. Keep in sync with `TOFU_IMAGE` in `.devcontainer/Dockerfile`.
	// Under 7 days old: an emergency security bump (1.13.2 stops trusting compromised intermediate certificates when
	// `tofu init` downloads providers). Drop this note after 2026-10-28.
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
	browsersDir = "/playwright-browsers"
	goRoot      = "/usr/local/go"
	pnpmDir     = "/usr/local/pnpm"
	npmRegistry = "https://registry.npmjs.org"
	// Same as the devcontainer's. A fixed password: the service only lives as long as the test run.
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
	// +ignore=["/.git", "/.claude-config", "**/node_modules", "/.pnpm-store", "/.nx", "/.coverage", "**/dist", "**/dist-test", "**/coverage"]
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
	ctr := m.installedOn(m.browserBase(), m.Source.WithoutDirectory(".changeset"))
	if nxCache != nil {
		ctr = ctr.
			WithServiceBinding("nx-cache", nxCache).
			WithEnvVariable("NX_SELF_HOSTED_REMOTE_CACHE_SERVER", "http://nx-cache:3000")
	}
	// Some targets run against real services, at the same hostnames as the devcontainer's sidecars
	built := withPostgres(ctr).WithExec([]string{"nx", "run-many", "-t", "build"})

	eg, ctx := errgroup.WithContext(ctx)
	eg.Go(func() error {
		_, err := built.
			WithServiceBinding("valkey", valkeyService()).
			WithExec([]string{"test-ci"}).
			Sync(ctx)
		return err
	})
	eg.Go(func() error {
		_, err := built.WithExec([]string{"nx", "run", "@leyman/main:lifecycle"}).Sync(ctx)
		return err
	})
	return eg.Wait()
}

// Build the documentation site (`docs/`), type-checking every example, ready to deploy as static files.
//
// Export it (`docs export --path ./site`) to upload to GitHub Pages.
func (m *Ci) Docs() *dagger.Directory {
	return withPostgres(m.installed(m.Source.WithoutDirectory(".changeset"))).
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
	accountId string,
) (string, error) {
	return m.installed(m.Source.WithoutDirectory(".changeset")).
		WithExec([]string{"nx", "run", "@leyman/nx-cache-worker:build"}).
		WithWorkdir(workdir+"/infra/nx-cache/worker").
		WithSecretVariable("CLOUDFLARE_API_TOKEN", apiToken).
		WithEnvVariable("CLOUDFLARE_ACCOUNT_ID", accountId).
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

// GitHub rejects PR bodies over 65536 characters
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

	type release struct {
		name, from, to, bump, changelog string
	}
	releases := []release{}
	for _, file := range paths {
		if path.Base(file) != "package.json" {
			continue
		}
		var before, after workspacePackage
		if err := readJSON(ctx, changes.Before().File(file), &before); err != nil {
			return "", err
		}
		if err := readJSON(ctx, changes.After().File(file), &after); err != nil {
			return "", err
		}
		// Private packages are only bumped for their internal dependencies, and never published
		if after.Private || before.Version == after.Version {
			continue
		}
		changelog, err := changelogSection(ctx, changes.After(), path.Dir(file), after.Version)
		if err != nil {
			return "", err
		}
		releases = append(releases, release{after.Name, before.Version, after.Version, bumpType(before.Version, after.Version), changelog})
	}
	// Biggest bumps first, as they need the most review
	sort.Slice(releases, func(i, j int) bool {
		if rank, other := bumpRank[releases[i].bump], bumpRank[releases[j].bump]; rank != other {
			return rank < other
		}
		return releases[i].name < releases[j].name
	})

	summary := []string{
		"Merging this PR publishes the packages below to npm.",
		"",
		"| Package | Bump | Version |",
		"| --- | --- | --- |",
	}
	notes := []string{}
	for _, r := range releases {
		summary = append(summary, fmt.Sprintf("| `%s` | %s | %s → **%s** |", r.name, r.bump, r.from, r.to))
		notes = append(notes, strings.TrimSpace(fmt.Sprintf("## %s@%s\n\n%s", r.name, r.to, r.changelog)))
	}

	body := strings.Join(append([]string{strings.Join(summary, "\n")}, notes...), "\n\n")
	if len(body) > maxNotesLength {
		body = strings.Join(summary, "\n") +
			"\n\nThe changelogs are too long to include here; see each package's CHANGELOG.md in this PR."
	}
	return body, nil
}

var bumpRank = map[string]int{"major": 0, "minor": 1, "patch": 2}

// The most significant part of a release version that changed: `major`, `minor` or `patch`
func bumpType(from string, to string) string {
	before, after := strings.Split(from, "."), strings.Split(to, ".")
	for i, bump := range []string{"major", "minor"} {
		if i >= len(before) || i >= len(after) || before[i] != after[i] {
			return bump
		}
	}
	return "patch"
}

func readJSON(ctx context.Context, file *dagger.File, v any) error {
	contents, err := file.Contents(ctx)
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(contents), v)
}

// The body of the `## <version>` section of a package's CHANGELOG.md, if it has one
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
		return "", fmt.Errorf("publishing requires --github-env for npm trusted publishing (or use --dry-run)")
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
	tarballs := packer.Directory(tarballDir)

	// Publish the tarballs with npm, which handles trusted publishing (OIDC) with provenance
	publisher := dag.Container().
		From(nodeImage).
		WithDirectory(tarballDir, tarballs)
	publishCmd := `npm publish "$1"/*.tgz --access public`
	if dryRun {
		publishCmd += " --dry-run"
	}
	if githubEnv != nil {
		publisher = publisher.WithMountedSecret("/run/secrets/github-env", githubEnv)
		publishCmd = "set -a && . /run/secrets/github-env && set +a && " + publishCmd + " --provenance"
	}
	results := []string{}
	for i, pkg := range unpublished {
		_, err := publisher.WithExec([]string{"bash", "-c", publishCmd, "bash", tarballPath(i)}).Sync(ctx)
		if err != nil {
			// On one line, so it can't be mistaken for another package's result
			results = append(results, fmt.Sprintf("failed %s@%s: %s", pkg.Name, pkg.Version, strings.Join(strings.Fields(err.Error()), " ")))
			break
		}
		results = append(results, fmt.Sprintf("published %s@%s", pkg.Name, pkg.Version))
	}
	return strings.Join(results, "\n"), nil
}

// Where `Publish` packs the i-th package
func tarballPath(i int) string {
	return fmt.Sprintf("%s/%d", tarballDir, i)
}

type workspacePackage struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Path    string `json:"path"`
	Private bool   `json:"private"`
}

// Public workspace packages whose current version is not on the registry
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

// The dependencies a package needs once installed from npm: all but `devDependencies`
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
	// Only dependencies being published with it can be out of order
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

	sorted := []workspacePackage{}
	done := map[string]bool{}
	for len(sorted) < len(pkgs) {
		ready := []string{}
		for name := range byName {
			if done[name] {
				continue
			}
			isReady := true
			for _, dep := range needs[name] {
				isReady = isReady && done[dep]
			}
			if isReady {
				ready = append(ready, name)
			}
		}
		if len(ready) == 0 {
			return nil, fmt.Errorf("workspace packages depend on each other in a cycle: %v", needs)
		}
		sort.Strings(ready)
		for _, name := range ready {
			done[name] = true
			sorted = append(sorted, byName[name])
		}
	}
	return sorted, nil
}

func versionExists(ctx context.Context, pkg workspacePackage) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, npmRegistry+"/"+url.PathEscape(pkg.Name)+"/"+pkg.Version, nil)
	if err != nil {
		return false, err
	}
	res, err := http.DefaultClient.Do(req)
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

// Binds Postgres at the devcontainer's hostname, with `DATABASE_URL` pointing at it. Every build needs it, not only
// tests: `prepare` (which the build runs) snapshots schemas from migrations.
func withPostgres(ctr *dagger.Container) *dagger.Container {
	return ctr.
		WithServiceBinding("postgres", postgresService()).
		WithEnvVariable("DATABASE_URL", databaseURL)
}

// Valkey for tests, with nothing persisted, matching the devcontainer's `valkey` sidecar
func valkeyService() *dagger.Service {
	return dag.Container().
		From(valkeyImage).
		WithExposedPort(6379).
		AsService(dagger.ContainerAsServiceOpts{
			Args: []string{"valkey-server", "--save", "", "--appendonly", "no"},
		})
}

// Postgres for tests, with nothing persisted and durability off, matching the devcontainer's `postgres` sidecar
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

// Postgres client tools on Debian, with nothing else installed yet
func system() *dagger.Container {
	return dag.Container().
		From(debianImage).
		WithEnvVariable("CI", "1").
		WithExec([]string{"sh", "-c", "apt-get update" +
			" && apt-get install --yes --no-install-recommends ca-certificates postgresql-common" +
			" && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y" +
			" && apt-get install --yes --no-install-recommends postgresql-client-" + postgresMajor})
}

// Adds Go, pnpm, Node and OpenTofu, matching the devcontainer: last, so bumping one reruns only these copies. No npm (as in the
// devcontainer), so nothing silently depends on it.
func withTools(ctr *dagger.Container) *dagger.Container {
	// pnpm is a native binary, installed with npm and copied in with its package
	pnpm := dag.Container().
		From(nodeImage).
		WithExec([]string{"npm", "install", "--global", "pnpm@" + pnpmVersion}).
		Directory("/usr/local/lib/node_modules/pnpm")
	return ctr.
		WithDirectory(goRoot, dag.Container().From(goImage).Directory(goRoot)).
		// Use the pinned toolchain, never one downloaded for a newer `go` directive in a go.mod
		WithEnvVariable("GOTOOLCHAIN", "local").
		WithDirectory(pnpmDir, pnpm).
		WithFile("/usr/local/bin/node", dag.Container().From(nodeImage).File("/usr/local/bin/node")).
		WithFile("/usr/local/bin/tofu", dag.Container().From(tofuImage).File("/usr/local/bin/tofu")).
		WithEnvVariable("PATH", "${PATH}:"+goRoot+"/bin:"+pnpmDir, dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithEnvVariable("pnpm_config_store_dir", storeDir).
		WithEnvVariable("pnpm_config_cache_dir", cacheDir).
		WithWorkdir(workdir)
}

// Node + pnpm + Go + Postgres client tools, matching the devcontainer
func (m *Ci) base() *dagger.Container {
	return withTools(system())
}

// Base image plus the system libraries Playwright's browsers need, with the browsers kept in a cache volume.
//
// The libraries are installed from the list `install-deps` would install (one package per line), not by running it:
// that needs Node, and the list doesn't change when Node does. So the install reruns only when the list changes.
func (m *Ci) browserBase() *dagger.Container {
	deps := m.base().
		WithExec([]string{"sh", "-c", "pnpm dlx playwright@" + playwrightVersion +
			" install-deps --dry-run chromium firefox webkit" +
			` | sed -n 's/^  \([a-z0-9][a-z0-9.+-]*\)$/\1/p' > /tmp/playwright-deps.txt` +
			" && test -s /tmp/playwright-deps.txt"}).
		File("/tmp/playwright-deps.txt")
	return withTools(system().
		WithMountedFile("/tmp/playwright-deps.txt", deps).
		WithExec([]string{"xargs", "--arg-file=/tmp/playwright-deps.txt", "apt-get", "install", "--yes", "--no-install-recommends"})).
		WithMountedCache(browsersDir, dag.CacheVolume("playwright-browsers-"+playwrightVersion)).
		WithEnvVariable("PLAYWRIGHT_BROWSERS_PATH", browsersDir)
}

// Workspace with dependencies installed.
func (m *Ci) installed(source *dagger.Directory) *dagger.Container {
	return m.installedOn(m.base(), source)
}

// Workspace with dependencies installed on top of `base`.
//
// Dependencies are fetched from the lockfile alone, so source-only changes reuse the cached fetch layer.
func (m *Ci) installedOn(base *dagger.Container, source *dagger.Directory) *dagger.Container {
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

	return base.
		WithDirectory(storeDir, fetched.Directory(storeDir)).
		WithDirectory(cacheDir, fetched.Directory(cacheDir)).
		WithDirectory(workdir, source).
		WithExec([]string{"pnpm", "install", "--frozen-lockfile", "--offline"}).
		WithEnvVariable("PATH", "${PATH}:"+workdir+"/leyman/main/node_modules/.bin:"+workdir+"/scripts/commands", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		// More Nx tasks than CI's 4 CPUs, since many wait on services or timers: on 4 CPUs, 6 ran `verify` 14% faster than
		// Nx's default of 3
		WithEnvVariable("NX_PARALLEL", "6")
}
