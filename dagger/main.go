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
	"strings"

	"golang.org/x/sync/errgroup"
)

// Keep in sync with `.devcontainer/Dockerfile` (see the devcontainer skill).
const (
	// node:24.21.0-trixie-slim
	nodeImage   = "node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe"
	pnpmVersion = "12.7.0"
)

const (
	workdir     = "/workspace"
	storeDir    = "/pnpm-store"
	cacheDir    = "/pnpm-cache"
	tarballDir  = "/tarballs"
	npmRegistry = "https://registry.npmjs.org"
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
	ctr := m.installed(m.Source.WithoutDirectory(".changeset"))
	if nxCache != nil {
		ctr = ctr.
			WithServiceBinding("nx-cache", nxCache).
			WithEnvVariable("NX_SELF_HOSTED_REMOTE_CACHE_SERVER", "http://nx-cache:3000")
	}
	built := ctr.WithExec([]string{"nx", "run-many", "-t", "build"})

	eg, ctx := errgroup.WithContext(ctx)
	eg.Go(func() error {
		_, err := built.WithExec([]string{"test-ci"}).Sync(ctx)
		return err
	})
	eg.Go(func() error {
		_, err := built.WithExec([]string{"nx", "run", "@leyman/main:lifecycle"}).Sync(ctx)
		return err
	})
	return eg.Wait()
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

// Publish every public package whose current version is not yet on npm, from a fresh (uncached) build.
//
// Returns the published packages as `name@version`, one per line.
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

	built := m.installed(m.Source).WithExec([]string{"nx", "run-many", "-t", "build", "--skip-nx-cache"})

	unpublished, err := m.unpublishedPackages(ctx, built)
	if err != nil {
		return "", err
	}
	if len(unpublished) == 0 {
		return "", nil
	}

	// pnpm resolves `workspace:` and `catalog:` specifiers while packing
	packer := built
	for _, pkg := range unpublished {
		packer = packer.
			WithWorkdir(pkg.Path).
			WithExec([]string{"pnpm", "pack", "--pack-destination", tarballDir})
	}
	tarballs := packer.Directory(tarballDir)
	files, err := tarballs.Entries(ctx)
	if err != nil {
		return "", err
	}

	// Publish the tarballs with npm, which handles trusted publishing (OIDC) with provenance
	publisher := dag.Container().
		From(nodeImage).
		WithDirectory(tarballDir, tarballs).
		WithWorkdir(tarballDir)
	publishCmd := "npm publish \"$1\" --access public"
	if dryRun {
		publishCmd += " --dry-run"
	}
	if githubEnv != nil {
		publisher = publisher.WithMountedSecret("/run/secrets/github-env", githubEnv)
		publishCmd = "set -a && . /run/secrets/github-env && set +a && " + publishCmd + " --provenance"
	}
	for _, file := range files {
		publisher = publisher.WithExec([]string{"bash", "-c", publishCmd, "bash", file})
	}
	if _, err := publisher.Sync(ctx); err != nil {
		return "", err
	}

	published := make([]string, len(unpublished))
	for i, pkg := range unpublished {
		published[i] = pkg.Name + "@" + pkg.Version
	}
	return strings.Join(published, "\n"), nil
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
	return unpublished, nil
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

// Node + pnpm, matching the devcontainer
func (m *Ci) base() *dagger.Container {
	return dag.Container().
		From(nodeImage).
		WithEnvVariable("CI", "1").
		WithExec([]string{"npm", "install", "--global", "pnpm@" + pnpmVersion}).
		// Match the devcontainer, which removes npm so nothing silently depends on it
		WithExec([]string{"npm", "uninstall", "--global", "npm"}).
		WithEnvVariable("pnpm_config_store_dir", storeDir).
		WithEnvVariable("pnpm_config_cache_dir", cacheDir).
		WithWorkdir(workdir)
}

// Workspace with dependencies installed.
//
// Dependencies are fetched from the lockfile alone, so source-only changes reuse the cached fetch layer.
func (m *Ci) installed(source *dagger.Directory) *dagger.Container {
	lockfiles := source.Filter(dagger.DirectoryFilterOpts{
		Include: []string{"pnpm-lock.yaml", "pnpm-workspace.yaml"},
	})

	// Only keep the store and metadata cache: the `node_modules` that `pnpm fetch` leaves behind makes
	// `pnpm install` skip linking projects. The offline install needs the cached metadata to check the
	// lockfile against the supply-chain policies.
	fetched := m.base().
		WithDirectory(workdir, lockfiles).
		WithExec([]string{"pnpm", "fetch"})

	return m.base().
		WithDirectory(storeDir, fetched.Directory(storeDir)).
		WithDirectory(cacheDir, fetched.Directory(cacheDir)).
		WithDirectory(workdir, source).
		WithExec([]string{"pnpm", "install", "--frozen-lockfile", "--offline"}).
		WithEnvVariable("PATH", "${PATH}:"+workdir+"/leyman/main/node_modules/.bin:"+workdir+"/scripts/commands", dagger.ContainerWithEnvVariableOpts{Expand: true})
}
