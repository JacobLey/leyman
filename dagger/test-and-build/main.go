package main

import (
	"context"
	"dagger/test-and-build/internal/dagger"
)

type TestAndBuild struct {
	// Root of source file
	Source *dagger.Directory
}

var goLangVersion = "1.23.0"
var nodeVersion = "22.14.0"
var pnpmVersion = "10.6.2"

func New(
	// Root of source file
	// Ignore needs to mirror .gitignore, in addition to files that are known to not be relevant to build.
	// Can be copied from Monorepo (auto-populated)
	// +ignore=[".git","**/*.log*","**/.DS_Store","**/node_modules",".pnpm-store","**/.eslintcache","**/coverage","**/dist","**/.pnpm-lock-hash","**/.swcrc",".nx",".changeset",".devcontainer",".github",".vscode","dagger","!dagger/monorepo/main.go","!dagger/monorepo/monorepo-builder/main.go","go.work","go.work.sum","README.md","scripts"]
	source *dagger.Directory,
) *TestAndBuild {
	return &TestAndBuild{
		Source: source.Filter(dagger.DirectoryFilterOpts{
			Exclude: []string{
				".git",
				"**/*.log*",
				"**/.DS_Store",
				"**/node_modules",
				".pnpm-store",
				"**/.eslintcache",
				"**/coverage",
				"**/dist",
				"**/.pnpm-lock-hash",
				"**/.swcrc",
				".nx",
				// Version controlled, but not relevant to dagger
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
			},
		},
		),
	}
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
