package main

import (
	"dagger/test-and-build/internal/dagger"
)

type TestAndBuild struct {
	// Root of source file
	Source *dagger.Directory
}

var nodeVersion = "22.13.1"
var pnpmVersion = "10.4.1"

func New(
	// Root of source file
	// Ignore needs to mirror .gitignore
	// Can be copied from Monorepo (auto-populated)
	// +ignore=[".git","**/*.log*","**/.DS_Store","**/node_modules",".pnpm-store","**/.eslintcache","**/coverage","**/dist","**/.pnpm-lock-hash","**/.swcrc",".nx","dagger/**/.gitattributes","dagger/**/dagger.gen.go","dagger/**/internal"]
	source *dagger.Directory,
) *TestAndBuild {
	return &TestAndBuild{
		Source: dag.Directory().WithDirectory(
			".",
			source,
			dagger.DirectoryWithDirectoryOpts{
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
					"dagger/**/.gitattributes",
					"dagger/**/dagger.gen.go",
					"dagger/**/internal",
				},
			},
		),
	}
}

// CI entrypoint
func (m *TestAndBuild) Run() *dagger.Directory {
	builtDir := dag.Monorepo(
		dag.Directory().WithDirectory(
			".",
			m.Source,
			dagger.DirectoryWithDirectoryOpts{
				// Files that aren't ever used by Nx projects
				Exclude: []string{".git", ".github", ".vscode", "dagger", "leyman/main", "go.work", "go.work.sum", "README.md"},
			},
		),
	).Build(nodeVersion, pnpmVersion)

	return builtDir
}
