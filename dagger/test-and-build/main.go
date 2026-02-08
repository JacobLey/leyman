package main

import (
	"context"
	"dagger/test-and-build/internal/dagger"
	"strings"
)

type TestAndBuild struct {
	// Root of source file
	Source *dagger.Directory
}

var goLangVersion = "1.25.6"
var nodeVersion = "24.13.0"
var pnpmVersion = "10.28.1"

func New(
	ctx context.Context,
	// Root of source file
	// Manually ignore the worst offenders, but use actual .gitignore parsing to catch the rest
	// +ignore=[".git",".claude","**/*.log*","**/.DS_Store","**/node_modules",".pnpm-store","**/.eslintcache",".coverage","**/dist",".nx"]
	// +defaultPath="../.."
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
		".gitignore",
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
		"scripts",
	)

	return &TestAndBuild{
		Source: source.Filter(dagger.DirectoryFilterOpts{
			Exclude: exclude,
		}),
	}, nil
}

// CI entrypoint
func (m *TestAndBuild) Run(ctx context.Context) (*dagger.Directory, error) {

	monorepo := dag.Monorepo(
		m.Source.Filter(
			dagger.DirectoryFilterOpts{
				// Files that aren't ever used by Nx projects
				Exclude: []string{".github", "leyman/main"},
			},
		),
	)

	builtDir := monorepo.Build(goLangVersion, nodeVersion, pnpmVersion)

	projectDirs, err := monorepo.ProjectDirs(ctx, "node")
	if err != nil {
		return nil, err
	}

	return dag.Pnpm(pnpmVersion).RestoreVersions(builtDir, projectDirs), nil
}
