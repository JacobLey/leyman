package main

import (
	"context"
	"dagger/test-and-build/internal/dagger"
	"strings"

	"golang.org/x/sync/errgroup"
)

type TestAndBuild struct {
	// Root of source file
	Source *dagger.Directory
}

var nodeVersion = "24.13.0"
var pnpmVersion = "10.28.1"

func New(
	ctx context.Context,
	// Root of source file
	// Relative to this module, not from caller
	// +defaultPath="../.."
	// Manually ignore the worst offenders, but use actual .gitignore parsing to catch the rest
	// +ignore=[".git",".claude","**/*.log*","**/.DS_Store","**/node_modules",".pnpm-store","**/.eslintcache",".coverage","**/dist",".nx"]
	source *dagger.Directory,
) (*TestAndBuild, error) {

	contents, err := source.File(".gitignore").Contents(ctx)
	if err != nil {
		return nil, err
	}

	exclude := []string{}
	for _, line := range strings.Split(contents, "\n") {
		if line != "" {
			exclude = append(exclude, line)
		}
	}

	// Version controlled, but not relevant to dagger
	exclude = append(exclude,
		".git",
		// ".gitignore",
		".changeset",
		".devcontainer",
		".github",
		".vscode",
		"dagger",
		"!dagger/monorepo/main.go",
		"!dagger/monorepo/monorepo-builder/main.go",
		"go.work",
		"go.work.sum",
		"README.md",
	)

	return &TestAndBuild{
		Source: source.Filter(dagger.DirectoryFilterOpts{
			Exclude: exclude,
		}),
	}, nil
}

// CI entrypoint
func (m *TestAndBuild) Run(ctx context.Context) (*dagger.Directory, error) {

	debian := dag.Debian()
	node := dag.Node(nodeVersion)
	pnpm := dag.Pnpm(pnpmVersion)

	container := debian.BaseContainer()
	container = node.InstallNode(container)
	container = pnpm.InstallPnpm(container)

	container = container.
		WithDirectory("/workspace", m.Source).
		WithWorkdir("/workspace")

	container = pnpm.Install(container)

	container = container.
		WithEnvVariable("PATH", "${PATH}:./leyman/main/node_modules/.bin:./scripts/commands", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithMountedCache(".nx", dag.CacheVolume("nx"))

	builtContainer := container.WithExec([]string{"nx", "run-many", "-t", "build"})

	eg, ctx := errgroup.WithContext(ctx)

	eg.Go(func() error {
		_, err := builtContainer.
			WithExec([]string{"test-coverage"}).
			Sync(ctx)
		return err
	})
	eg.Go(func() error {
		_, err := builtContainer.
			WithExec([]string{"nx", "run", "@leyman/main:lifecycle"}).
			Sync(ctx)
		return err
	})

	return builtContainer.Directory("/workspace"), eg.Wait()
}
