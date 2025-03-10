package main

import (
	"dagger/node-install/internal/dagger"
)

type NodeInstall struct {
	PnpmVersion string
}

func New(
	// Pnpm version to use
	pnpmVersion string,
) *NodeInstall {
	return &NodeInstall{
		PnpmVersion: pnpmVersion,
	}
}

func (m *NodeInstall) pnpm() *dagger.Pnpm {
	return dag.Pnpm(m.PnpmVersion)
}

// Adds node_modules directory to projectDir, with all dependencies installed.
// Local dependencies are fully installed, rather than synlinked, to ensure only
// production dependencies are copied over.
// Proxies call to pnpm module.
func (m *NodeInstall) Run(
	// +ignore=["*", "!.npmrc", "!.pnpmfile.cjs", "!pnpm-lock.yaml", "!pnpm-workspace.yaml"]
	source *dagger.Directory,
	// +ignore=["**/node_modules"]
	output *dagger.Directory,
	projectDir string,
	// +ignore=[".npmignore"]
	projectSource *dagger.Directory,
	dependencyProjectDirs []string,
) *dagger.Directory {

	return m.pnpm().InstallPackage(
		source,
		output,
		projectDir,
		projectSource,
		dependencyProjectDirs,
	)
}
