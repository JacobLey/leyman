package main

import (
	"context"
	"dagger/test-and-build/internal/dagger"
)

type TestAndBuild struct{}

var nodeVersion = "22.13.1"
var pnpmVersion = "9.15.4"

// CI entrypoint
func (m *TestAndBuild) Run(
	ctx context.Context,
	// Root of source file
	// Ignore needs to mirror .gitignore
	// Can be copied from Monorepo (auto-populated)
	//
	// +ignore=["**/*.log*","**/.DS_Store","**/node_modules",".pnpm-store","**/.eslintcache","**/coverage","**/dist","**/.pnpm-lock-hash","**/.swcrc",".nx","dagger/**/.gitattributes","dagger/**/dagger.gen.go","dagger/**/internal"]
	source *dagger.Directory,
) *dagger.Directory {
	builtDir := dag.Monorepo(
		dag.Directory().WithDirectory(
			".",
			source,
			dagger.DirectoryWithDirectoryOpts{
				// Files that aren't ever used by Nx projects
				Exclude: []string{".git", ".changeset", ".vscode", "dagger", "leyman/main", "go.work", "go.work.sum", "README.md"},
			},
		),
	).Build(nodeVersion, pnpmVersion)

	dag.Node(nodeVersion).NodeContainer().WithDirectory(".", builtDir).Terminal()

	return builtDir
}
